import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import {
    setupE2ETest,
    createTestFile,
    createLLMResponseString,
    createTestConfig,
} from '../test.util';
import type { E2ETestContext } from '../test.util';
import { applyCommand } from '../../src/commands/apply';
import { STATE_DIRECTORY_NAME } from '../../src/utils/constants';
import { logger } from '../../src/utils/logger';
import { readStateFile } from '../../src/core/state';

describe('e2e/apply', () => {
    let context: E2ETestContext;
    let logs: string[];

    beforeEach(async () => {
        context = await setupE2ETest();
        logs = [];
        // Override the logger mock from setupE2ETest to capture logs for verification
        (logger as any).error = (msg: string) => { logs.push(msg); };
        (logger as any).info = (msg: string) => { logs.push(msg); };

        // We need an initialized project for apply to work
        await createTestConfig(context.testDir.path);
        await fs.mkdir(path.join(context.testDir.path, STATE_DIRECTORY_NAME), { recursive: true });
        
        // Clear logs from setup
        logs.length = 0;
    });

    afterEach(async () => {
        if (context) await context.cleanup();
    });

    it('should apply a simple patch to modify a file', async () => {
        const testFile = 'src/index.ts';
        const originalContent = 'console.log("hello");';
        const newContent = 'console.log("hello world");';
        await createTestFile(context.testDir.path, testFile, originalContent);

        const { response, uuid } = createLLMResponseString([
            { type: 'edit', path: testFile, content: newContent }
        ]);

        const patchFilePath = path.join(context.testDir.path, 'patch.txt');
        await fs.writeFile(patchFilePath, response);

        await applyCommand(patchFilePath, {}, context.testDir.path);

        const modifiedContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
        expect(modifiedContent).toBe(newContent);

        const stateFile = await readStateFile(context.testDir.path, uuid);
        expect(stateFile).not.toBeNull();
        expect(stateFile?.uuid).toBe(uuid);
    });

    it('should apply a complex patch with new, edit, and delete operations', async () => {
        // Setup existing files
        const fileToEdit = 'src/app.js';
        const fileToDelete = 'src/utils.js';
        await createTestFile(context.testDir.path, fileToEdit, 'v1');
        await createTestFile(context.testDir.path, fileToDelete, 'old stuff');

        // Define new file
        const newFile = 'src/components/button.js';
        const newFileContent = 'export default Button';
        const editedFileContent = 'v2';

        const { response, uuid } = createLLMResponseString([
            { type: 'edit', path: fileToEdit, content: editedFileContent },
            { type: 'new', path: newFile, content: newFileContent },
            { type: 'delete', path: fileToDelete },
        ]);

        const patchFilePath = path.join(context.testDir.path, 'patch.txt');
        await fs.writeFile(patchFilePath, response);

        await applyCommand(patchFilePath, {}, context.testDir.path);

        // Verify changes
        const editedContent = await fs.readFile(path.join(context.testDir.path, fileToEdit), 'utf-8');
        expect(editedContent).toBe(editedFileContent);

        const newContent = await fs.readFile(path.join(context.testDir.path, newFile), 'utf-8');
        expect(newContent).toBe(newFileContent);

        const deletedFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
        expect(deletedFileExists).toBe(false);

        // Verify state file
        const stateFile = await readStateFile(context.testDir.path, uuid);
        expect(stateFile).not.toBeNull();
        expect(stateFile?.uuid).toBe(uuid);
    });

    it('should do nothing and log an error if the patch file does not exist', async () => {
        const nonExistentPatchFile = path.join(context.testDir.path, 'no-such-file.txt');
        
        await applyCommand(nonExistentPatchFile, {}, context.testDir.path);

        const errorLog = logs.find(log => log.includes('Failed to read patch file'));
        expect(errorLog).toBeDefined();
        expect(errorLog).toContain('Aborting');
    });

    it('should do nothing and log an error if the patch file has invalid content', async () => {
        const patchFilePath = path.join(context.testDir.path, 'invalid.txt');
        await fs.writeFile(patchFilePath, 'this is not a valid patch');

        // The db might not exist yet if no valid transaction was processed.
        const stateDir = path.join(context.testDir.path, STATE_DIRECTORY_NAME, 'db', 'transactions');
        await fs.mkdir(stateDir, { recursive: true });
        const filesBefore = await fs.readdir(stateDir);

        await applyCommand(patchFilePath, {}, context.testDir.path);
        
        const infoLog = logs.find(log => log.includes('not a valid relaycode patch. Aborting.'));
        expect(infoLog).toBeDefined();

        // No new state files should be created
        const filesAfter = await fs.readdir(stateDir);
        expect(filesAfter.length).toBe(filesBefore.length);
    });
});