import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import {
    setupE2ETest,
    createTestFile,
    runProcessPatch,
    createTestConfig,
} from '../test.util';
import type { E2ETestContext } from '../test.util';
import { revertCommand } from '../../src/commands/revert';
import { logger } from '../../src/utils/logger'; // Mocks can't be ESM imports
import { findLatestStateFile, readAllStateFiles, readStateFile } from '../../src/core/state';

describe('e2e/revert', () => {
    let context: E2ETestContext;

    beforeEach(async () => {
        context = await setupE2ETest();
        // We need an initialized project for revert to work
        await createTestConfig(context.testDir.path);
    });

    afterEach(async () => {
        if (context) await context.cleanup();
    });

    it('should successfully revert a simple file modification', async () => {
        const testFile = 'src/index.ts';
        const originalContent = 'console.log("v1");';
        const modifiedContent = 'console.log("v2");';
        await createTestFile(context.testDir.path, testFile, originalContent);

        // 1. Apply a patch to create a transaction (T1)
        const { uuid: t1_uuid } = await runProcessPatch(
            context,
            {},
            [{ type: 'edit', path: testFile, content: modifiedContent }]
        );

        // Verify file was modified
        const contentAfterPatch = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
        expect(contentAfterPatch).toBe(modifiedContent);

        // 2. Revert T1
        await revertCommand(t1_uuid, {}, context.testDir.path, async () => true);

        // 3. Verify changes
        const contentAfterRevert = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
        expect(contentAfterRevert).toBe(originalContent);

        // 4. Verify that a new transaction (T2) was created for the revert
        const t2 = await findLatestStateFile(context.testDir.path);
        expect(t2).not.toBeNull();
        expect(t2!.uuid).not.toBe(t1_uuid);
        expect(t2!.reasoning.join(' ')).toContain(`Reverting transaction ${t1_uuid}`);

        // 5. Verify T1 and T2 transactions exist in DB
        const t1_state = await readStateFile(context.testDir.path, t1_uuid);
        const t2_state = await readStateFile(context.testDir.path, t2!.uuid);
        expect(t1_state).not.toBeNull();
        expect(t2_state).not.toBeNull();
    });

    it('should correctly revert a complex transaction (edit, delete, create)', async () => {
        const fileToModify = 'src/modify.ts';
        const originalModifyContent = 'export const a = 1;';
        await createTestFile(context.testDir.path, fileToModify, originalModifyContent);
        
        const fileToDelete = 'src/delete.ts';
        const originalDeleteContent = 'export const b = 2;';
        await createTestFile(context.testDir.path, fileToDelete, originalDeleteContent);
        
        const newFilePath = 'src/components/new.ts';
        const newFileContent = 'export const c = 3;';
    
        // 1. Apply a complex patch (T1)
        const { uuid: t1_uuid } = await runProcessPatch(
            context, {},
            [
                { type: 'edit', path: fileToModify, content: 'export const a = 100;' },
                { type: 'delete', path: fileToDelete },
                { type: 'new', path: newFilePath, content: newFileContent }
            ]
        );
        
        // 2. Revert T1
        await revertCommand(t1_uuid, {}, context.testDir.path, async () => true);

        // 3. Verify rollback
        const restoredModifyContent = await fs.readFile(path.join(context.testDir.path, fileToModify), 'utf-8');
        expect(restoredModifyContent).toBe(originalModifyContent);
        
        const restoredDeleteFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
        expect(restoredDeleteFileExists).toBe(true);
        const restoredDeleteContent = await fs.readFile(path.join(context.testDir.path, fileToDelete), 'utf-8');
        expect(restoredDeleteContent).toBe(originalDeleteContent);
        
        const newFileExistsAfterRevert = await fs.access(path.join(context.testDir.path, newFilePath)).then(() => true).catch(() => false);
        expect(newFileExistsAfterRevert).toBe(false);

        // 4. Verify a new transaction (T2) was created
        const t2 = await findLatestStateFile(context.testDir.path);
        expect(t2).not.toBeNull();
        expect(t2!.uuid).not.toBe(t1_uuid);
    });

    it('should correctly revert a transaction with file creation and modification', async () => {
        const newFilePath = 'src/components/new-file.ts';
        const initialContent = 'export const a = 1;';
        const modifiedContent = 'export const a = 2;';

        // 1. Apply a patch with new file and modification (T1)
        const { uuid: t1_uuid } = await runProcessPatch(
            context, {},
            [
                { type: 'new', path: newFilePath, content: initialContent },
                { type: 'edit', path: newFilePath, content: modifiedContent }
            ]
        );

        // Verify file was created with modified content
        const contentAfterPatch = await fs.readFile(path.join(context.testDir.path, newFilePath), 'utf-8');
        expect(contentAfterPatch).toBe(modifiedContent);
        
        // 2. Revert T1
        await revertCommand(t1_uuid, {}, context.testDir.path, async () => true);

        // 3. Verify rollback (file should be deleted)
        const newFileExistsAfterRevert = await fs.access(path.join(context.testDir.path, newFilePath)).then(() => true).catch(() => false);
        expect(newFileExistsAfterRevert).toBe(false);
    });

    it('should correctly revert a mega-complex transaction', async () => {
        // 1. SETUP
        const fileToModify = 'src/modify.ts';
        const originalModifyContent = 'export const a = 1;';
        await createTestFile(context.testDir.path, fileToModify, originalModifyContent);

        const fileToDelete = 'src/delete.ts';
        const originalDeleteContent = 'export const b = 2;';
        await createTestFile(context.testDir.path, fileToDelete, originalDeleteContent);

        const fileToRename = 'src/rename-me.ts';
        const originalRenameContent = 'export const c = 3;';
        await createTestFile(context.testDir.path, fileToRename, originalRenameContent);
        
        const renamedPath = 'src/renamed.ts';

        // 2. APPLY a complex patch (T1)
        const { uuid: t1_uuid } = await runProcessPatch(
            context, {},
            [
                { type: 'edit', path: fileToModify, content: 'export const a = 100;' },
                { type: 'delete', path: fileToDelete },
                { type: 'new', path: 'src/new-file.ts', content: 'export const d = 4;' },
                { type: 'rename', from: fileToRename, to: renamedPath },
                { type: 'edit', path: renamedPath, content: 'export const c = 300;' },
            ]
        );

        // 3. REVERT T1
        await revertCommand(t1_uuid, {}, context.testDir.path, async () => true);

        // 4. ASSERTIONS
        const modifiedContent = await fs.readFile(path.join(context.testDir.path, fileToModify), 'utf-8');
        expect(modifiedContent).toBe(originalModifyContent);

        const deletedFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
        expect(deletedFileExists).toBe(true);
        const deletedContent = await fs.readFile(path.join(context.testDir.path, fileToDelete), 'utf-8');
        expect(deletedContent).toBe(originalDeleteContent);

        const newFileExists = await fs.access(path.join(context.testDir.path, 'src/new-file.ts')).then(() => true).catch(() => false);
        expect(newFileExists).toBe(false);

        const originalRenamedFileExists = await fs.access(path.join(context.testDir.path, fileToRename)).then(() => true).catch(() => false);
        expect(originalRenamedFileExists).toBe(true);
        const originalRenamedContent = await fs.readFile(path.join(context.testDir.path, fileToRename), 'utf-8');
        expect(originalRenamedContent).toBe(originalRenameContent);
        
        const renamedFileExists = await fs.access(path.join(context.testDir.path, renamedPath)).then(() => true).catch(() => false);
        expect(renamedFileExists).toBe(false);
    });

    it('should correctly revert a transaction with file modification and rename', async () => {
        const originalFilePath = 'src/original.ts';
        const renamedFilePath = 'src/renamed.ts';
        const originalContent = 'export const a = "v1";';
        const modifiedContent = 'export const a = "v2";';

        // Setup: create the original file
        await createTestFile(context.testDir.path, originalFilePath, originalContent);

        // 1. Apply a patch with modification and rename (T1)
        const { uuid: t1_uuid } = await runProcessPatch(
            context, {},
            [
                { type: 'edit', path: originalFilePath, content: modifiedContent },
                { type: 'rename', from: originalFilePath, to: renamedFilePath }
            ]
        );

        // Verify file was renamed and content is modified
        const renamedFileExists = await fs.access(path.join(context.testDir.path, renamedFilePath)).then(() => true).catch(() => false);
        expect(renamedFileExists).toBe(true);
        const renamedContent = await fs.readFile(path.join(context.testDir.path, renamedFilePath), 'utf-8');
        expect(renamedContent).toBe(modifiedContent);
        const originalFileExists = await fs.access(path.join(context.testDir.path, originalFilePath)).then(() => true).catch(() => false);
        expect(originalFileExists).toBe(false);
        
        // 2. Revert T1
        await revertCommand(t1_uuid, {}, context.testDir.path, async () => true);

        // 3. Verify rollback
        const originalFileExistsAfterRevert = await fs.access(path.join(context.testDir.path, originalFilePath)).then(() => true).catch(() => false);
        expect(originalFileExistsAfterRevert).toBe(true);
        const originalContentAfterRevert = await fs.readFile(path.join(context.testDir.path, originalFilePath), 'utf-8');
        expect(originalContentAfterRevert).toBe(originalContent);

        const renamedFileExistsAfterRevert = await fs.access(path.join(context.testDir.path, renamedFilePath)).then(() => true).catch(() => false);
        expect(renamedFileExistsAfterRevert).toBe(false);
    });

    it('should log an error and do nothing if UUID does not exist', async () => {
        let errorLog = '';
        (logger as any).error = (msg: string) => { errorLog = msg; };

        const fakeUuid = '00000000-0000-0000-0000-000000000000';
        await revertCommand(fakeUuid, {}, context.testDir.path);
        
        expect(errorLog).toContain(`Could not find transaction with UUID '${fakeUuid}'`);
    });

    it('should be possible to revert a revert', async () => {
        const testFile = 'src/index.ts';
        const v1 = 'v1';
        const v2 = 'v2';
        await createTestFile(context.testDir.path, testFile, v1);

        // 1. Apply patch to go from v1 -> v2 (T1)
        const { uuid: t1_uuid } = await runProcessPatch(
            context, {},
            [{ type: 'edit', path: testFile, content: v2 }]
        );
        let content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
        expect(content).toBe(v2);

        // 2. Revert T1 to go from v2 -> v1 (T2)
        await revertCommand(t1_uuid, {}, context.testDir.path, async () => true);
        content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
        expect(content).toBe(v1);

        // 3. Get T2's UUID and revert it to go from v1 -> v2 (T3)
        const t2 = await findLatestStateFile(context.testDir.path);
        expect(t2).not.toBeNull();
        await revertCommand(t2!.uuid, {}, context.testDir.path, async () => true);
        content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
        expect(content).toBe(v2);

        // 4. Check that we have 3 state files
        const allStates = await readAllStateFiles(context.testDir.path);
        expect(allStates).not.toBeNull();
        expect(allStates!.length).toBe(3);
    });

    describe('revert by index/default', () => {
        const testFile = 'src/index.ts';
        const v1 = 'v1';
        const v2 = 'v2';
        const v3 = 'v3';

        beforeEach(async () => {
            // Create a history of transactions
            await createTestFile(context.testDir.path, testFile, v1);
            // T1: v1 -> v2
            await runProcessPatch(context, {}, [{ type: 'edit', path: testFile, content: v2 }]);
            // T2: v2 -> v3
            await runProcessPatch(context, {}, [{ type: 'edit', path: testFile, content: v3 }]);
        });

        it('should revert the latest transaction when no identifier is provided', async () => {
            // Revert T2 (latest)
            await revertCommand(undefined, {}, context.testDir.path, async () => true);
            const content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
            expect(content).toBe(v2);
        });

        it('should revert the latest transaction when identifier is "1"', async () => {
            // Revert T2 (latest)
            await revertCommand('1', {}, context.testDir.path, async () => true);
            const content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
            expect(content).toBe(v2);
        });

        it('should revert the 2nd latest transaction when identifier is "2"', async () => {
            // Revert T1 (2nd latest)
            await revertCommand('2', {}, context.testDir.path, async () => true);
            const content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
            expect(content).toBe(v1);
        });

        it('should log an error for an invalid index', async () => {
            let errorLog = '';
            (logger as any).error = (msg: string) => { errorLog = msg; };
            await revertCommand('99', {}, context.testDir.path, async () => true);
            expect(errorLog).toContain('Could not find the 99-th latest transaction.');
        });
    });

    describe('revert with filtering', () => {
        const testFile = 'src/index.ts';
        const v1 = 'v1-original';
        const v2 = 'v2-first-change';
        const v3 = 'v3-second-change';
        let t1_uuid: string, t2_uuid: string, t3_uuid_revert_t2: string;

        beforeEach(async () => {
            // Setup a history: T1 (v1->v2), T2 (v2->v3), T3 (revert T2, v3->v2)
            await createTestFile(context.testDir.path, testFile, v1);

            // T1: v1 -> v2
            const { uuid: t1 } = await runProcessPatch(context, {}, [{ type: 'edit', path: testFile, content: v2 }]);
            t1_uuid = t1;

            // T2: v2 -> v3
            const { uuid: t2 } = await runProcessPatch(context, {}, [{ type: 'edit', path: testFile, content: v3 }]);
            t2_uuid = t2;

            // T3: Revert T2, bringing content from v3 -> v2
            await revertCommand(t2_uuid, {}, context.testDir.path, async () => true);
            const t3_state = await findLatestStateFile(context.testDir.path);
            t3_uuid_revert_t2 = t3_state!.uuid;
        });

        it('should skip reverting a "revert" transaction and a reverted transaction by default', async () => {
            // Attempt to revert the latest transaction. 
            // The chronological order is T3 (revert), T2 (reverted), T1.
            // T3 and T2 should be skipped, so T1 should be reverted.
            await revertCommand(undefined, {}, context.testDir.path, async () => true);
            
            // State after revert should be v1 (reverted T1)
            const content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
            expect(content).toBe(v1);

            const latest = await findLatestStateFile(context.testDir.path);
            expect(latest?.reasoning.join(' ')).toContain(`Reverting transaction ${t1_uuid}`);
        });

        it('should revert the latest "revert" transaction when --include-reverts is used', async () => {
            // Revert latest, including reverts. T3 should be reverted.
            await revertCommand('1', { includeReverts: true }, context.testDir.path, async () => true);

            // State after should be v3 (reverted the revert of T2)
            const content = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
            expect(content).toBe(v3);

            const latest = await findLatestStateFile(context.testDir.path);
            expect(latest?.reasoning.join(' ')).toContain(`Reverting transaction ${t3_uuid_revert_t2}`);
        });

        it('should fail to find the 2nd transaction when filtering is on', async () => {
            // With default filtering, the only revertable transaction is T1.
            // So asking for the 2nd should fail.
            let errorLog = '';
            (logger as any).error = (msg: string) => { errorLog += msg; };
            (logger as any).info = (msg: string) => { errorLog += msg; }; // Also capture info for the message
            await revertCommand('2', {}, context.testDir.path, async () => true);
            
            expect(errorLog).toContain('Could not find the 2-th latest transaction.');
            expect(errorLog).toContain('revert transaction');
        });

        it('should correctly identify the 2nd transaction when including reverts', async () => {
            // When including reverts, the order is T3, T2, T1. The 2nd is T2.
            // Reverting T2 will apply its snapshot, which contains v2. The file is already v2.
            await revertCommand('2', { includeReverts: true }, context.testDir.path, async () => true);
            const contentAfterRevert = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
            expect(contentAfterRevert).toBe(v2);

            const allStates = await readAllStateFiles(context.testDir.path);
            expect(allStates?.length).toBe(4); // T1, T2, T3, and the new revert of T2
            const latest = await findLatestStateFile(context.testDir.path);
            expect(latest?.reasoning.join(' ')).toContain(`Reverting transaction ${t2_uuid}`);
        });
    });
});