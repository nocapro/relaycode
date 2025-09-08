import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { setupE2ETest, createTestFile, runProcessPatch } from '../test.util';
import type { E2ETestContext } from '../test.util';
import { writePendingState, readStateFile } from '../../src/core/state';
import { getDb } from '../../src/core/db';
import type { StateFile } from 'relaycode-core';

describe('e2e/transaction', () => {
  let context: E2ETestContext;
  const testFile = 'src/index.ts';
  const originalContent = 'console.log("original");';

  beforeEach(async () => {
    context = await setupE2ETest({ withTsconfig: true });
    await createTestFile(context.testDir.path, testFile, originalContent);
  });

  afterEach(async () => {
    if (context) await context.cleanup();
  });

  it('should apply changes, commit, and store state in a yaml file in the transaction dir', async () => {
    const newContent = 'console.log("new content");';
    const { uuid } = await runProcessPatch(
      context,
      { linter: '', approvalMode: 'auto' },
      [{ type: 'edit', path: testFile, content: newContent }]
    );
    // Add a small delay to ensure file operations have completed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check file content
    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(newContent);

    // Check that the transaction file exists at the correct path with a .yaml extension
    const transactionDir = path.join(context.testDir.path, '.relay', 'transactions', 'transactions');
    const files = await fs.readdir(transactionDir);
    const transactionFile = files.find(f => f.endsWith('.yaml'));
    expect(transactionFile).toBeDefined();

    const stateData = await readStateFile(context.testDir.path, uuid);

    expect(stateData).not.toBeNull();
    if (!stateData) return; // type guard

    expect(stateData.uuid).toBe(uuid);
    expect(stateData.approved).toBe(true);
    expect(stateData.operations).toHaveLength(1);
    const op = stateData.operations[0]!;
    expect(op.type).toBe('write');
    if (op.type === 'write') {
      expect(op.path).toBe(testFile);
    }
    expect(stateData.snapshot[testFile]).toBe(originalContent);
    expect(stateData.reasoning).toBeDefined();
  });

  it('should rollback changes when manually disapproved', async () => {
    const { uuid } = await runProcessPatch(
      context,
      { approvalMode: 'manual' },
      [{ type: 'edit', path: testFile, content: 'console.log("I will be rolled back");' }],
      { prompter: async () => false }
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);

    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).toBeNull();
  });

  it('should not re-apply a rolled back (undone) transaction', async () => {
    const { uuid } = await runProcessPatch(
      context,
      { approvalMode: 'manual' },
      [{ type: 'edit', path: testFile, content: 'this change will be rolled back' }],
      { prompter: async () => false } // Disapprove
    );

    // File should be rolled back
    let finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);

    // Attempt to process the patch again, it should be skipped because its status is 'undone'
    await runProcessPatch(
      context,
      {}, // config doesn't matter as it should be skipped before processing
      [{ type: 'edit', path: testFile, content: 'this change will NOT be applied' }],
      { responseOverrides: { uuid } } // Use same UUID
    );

    // File should still have original content, proving the second patch was ignored
    finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);
  });

  it('should fallback to shell execution for non-tsc linters and require approval on failure', async () => {
    await runProcessPatch(
      context,
      // 'false' is a command that always exits with 1. This tests the shell fallback.
      { approvalMode: 'auto', approvalOnErrorCount: 0, linter: 'false' },
      [{ type: 'edit', path: testFile, content: 'any content' }],
      { prompter: async () => false } // Disapprove manually
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent); // Should be rolled back
  });

  it('should require manual approval if linter errors exceed approvalOnErrorCount', async () => {
    await runProcessPatch(
      context,
      { approvalMode: 'auto', approvalOnErrorCount: 0, linter: 'bun tsc -b --noEmit' },
      [{ type: 'edit', path: testFile, content: 'const x: string = 123;' }],
      { prompter: async () => false }
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);
  });

  it('should skip linter if command is empty and auto-approve', async () => {
    const badContent = 'const x: string = 123;'; // Would fail linter, but it's skipped

    await runProcessPatch(
      context,
      { linter: '' },
      [{ type: 'edit', path: testFile, content: badContent }]
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(badContent);
  });

  it('should ignore patch with already processed UUID', async () => {
    const uuid = uuidv4();

    // 1. Process and commit a patch
    await runProcessPatch(context, {}, [{ type: 'edit', path: testFile, content: "first change" }], { responseOverrides: { uuid } });

    // 2. Try to process another patch with the same UUID - this will create a new response with the same UUID.
    // The `processPatch` logic should see the existing state file and ignore it.
    await runProcessPatch(context, {}, [{ type: 'edit', path: testFile, content: "second change" }], { responseOverrides: { uuid } });

    // Content should be from the first change, not the second
    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe("first change");
  });

  it('should create nested directories for new files', async () => {
    const newFilePath = 'src/a/b/c/new-file.ts';
    const newFileContent = 'hello world';

    await runProcessPatch(
      context,
      {},
      [{ type: 'new', path: newFilePath, content: newFileContent }]
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, newFilePath), 'utf-8');
    expect(finalContent).toBe(newFileContent);
  });

  it('should rollback new file and its new empty parent directory on rejection', async () => {
    const newFilePath = 'src/new/dir/file.ts';

    await runProcessPatch(context, { approvalMode: 'manual' },
      [{ type: 'new', path: newFilePath, content: 'content' }], { prompter: async () => false });

    const fileExists = await fs.access(path.join(context.testDir.path, newFilePath)).then(() => true).catch(() => false);
    expect(fileExists).toBe(false);

    const dirExists = await fs.access(path.join(context.testDir.path, 'src/new/dir')).then(() => true).catch(() => false);
    expect(dirExists).toBe(false);

    const midDirExists = await fs.access(path.join(context.testDir.path, 'src/new')).then(() => true).catch(() => false);
    expect(midDirExists).toBe(false);

    // src directory should still exist as it contained a file before
    const srcDirExists = await fs.access(path.join(context.testDir.path, 'src')).then(() => true).catch(() => false);
    expect(srcDirExists).toBe(true);
  });

  it('should not delete parent directory on rollback if it was not empty beforehand', async () => {
    const existingFilePath = 'src/shared/existing.ts';
    const newFilePath = 'src/shared/new.ts';

    await createTestFile(context.testDir.path, existingFilePath, 'const existing = true;');

    await runProcessPatch(context, { approvalMode: 'manual' },
      [{ type: 'new', path: newFilePath, content: 'const brandNew = true;' }],
      { prompter: async () => false });

    // New file should be gone
    const newFileExists = await fs.access(path.join(context.testDir.path, newFilePath)).then(() => true).catch(() => false);
    expect(newFileExists).toBe(false);

    // Existing file and its directory should remain
    const existingFileExists = await fs.access(path.join(context.testDir.path, existingFilePath)).then(() => true).catch(() => false);
    expect(existingFileExists).toBe(true);

    const sharedDirExists = await fs.access(path.join(context.testDir.path, 'src/shared')).then(() => true).catch(() => false);
    expect(sharedDirExists).toBe(true);
  });

  it('should abort transaction if preCommand fails', async () => {
    const { uuid } = await runProcessPatch(
      context,
      { preCommand: 'false' },
      [{ type: 'edit', path: testFile, content: 'new content' }]
    );

    // File should not have been changed
    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);

    // No state file should have been created
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).toBeNull();
  });

  it('should automatically roll back if postCommand fails', async () => {
    const { uuid } = await runProcessPatch(
      context,
      { postCommand: 'false' },
      [{ type: 'edit', path: testFile, content: 'new content' }]
    );

    // File should have been rolled back
    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);

    // No state file should have been committed
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).toBeNull();
  });

  it('should ignore patch with non-matching projectId', async () => {
    const { uuid } = await runProcessPatch(
      context,
      { projectId: 'correct-project' },
      [{ type: 'edit', path: testFile, content: 'should not be applied' }],
      { responseOverrides: { projectId: 'wrong-project' } }
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(originalContent);

    // No state file should have been committed
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).toBeNull();
  });

  it('should fail transaction gracefully and rollback if a patch hunk is invalid', async () => {
    const fileA = 'src/a.ts';
    const originalA = 'console.log("a original");';
    await createTestFile(context.testDir.path, fileA, originalA);

    const fileB = 'src/b.ts';
    const originalB = 'console.log("b original");';
    await createTestFile(context.testDir.path, fileB, originalB);

    // This diff is invalid because "b original" does not contain "non-existent content"
    const invalidDiff = `--- a/src/b.ts
+++ b/src/b.ts
@@ -1,1 +1,1 @@
-console.log("non-existent content");
+console.log("b modified");
 `;

    const { uuid } = await runProcessPatch(
      context, {},
      [
        { type: 'edit', path: fileA, content: 'console.log("a modified");' },
        { type: 'edit', path: fileB, content: invalidDiff, strategy: 'standard-diff' },
      ]
    );

    // Check that both files are rolled back
    const finalA = await fs.readFile(path.join(context.testDir.path, fileA), 'utf-8');
    expect(finalA).toBe(originalA);

    const finalB = await fs.readFile(path.join(context.testDir.path, fileB), 'utf-8');
    expect(finalB).toBe(originalB);

    // No state file should have been committed
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).toBeNull();
  });

  it('should correctly apply a file deletion operation', async () => {
    const fileToDelete = 'src/delete-me.ts';
    const originalDeleteContent = 'delete this content';
    await createTestFile(context.testDir.path, fileToDelete, originalDeleteContent);

    const { uuid } = await runProcessPatch(
      context,
      {},
      [{ type: 'delete', path: fileToDelete }]
    );

    const deletedFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
    expect(deletedFileExists).toBe(false);

    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).not.toBeNull();
  });

  it('should correctly roll back a file deletion operation', async () => {
    const fileToDelete = 'src/delete-me.ts';
    const originalDeleteContent = 'delete this content';
    await createTestFile(context.testDir.path, fileToDelete, originalDeleteContent);

    const { uuid } = await runProcessPatch(
      context, { approvalMode: 'manual' },
      [{ type: 'delete', path: fileToDelete }], { prompter: async () => false }
    );

    const restoredFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
    expect(restoredFileExists).toBe(true);

    // Content should be the same as the original
    const restoredContent = await fs.readFile(path.join(context.testDir.path, fileToDelete), 'utf-8');
    expect(restoredContent).toBe(originalDeleteContent);

    // No state file should have been committed
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).toBeNull();
  });

  it('should auto-approve if linter errors are within approvalOnErrorCount', async () => {
    const badContent = 'const x: string = 123;'; // 1 TS error

    const { uuid } = await runProcessPatch(
      context,
      { approvalMode: 'auto', approvalOnErrorCount: 1, linter: 'bun tsc -b --noEmit' },
      [{ type: 'edit', path: testFile, content: badContent }]
    );

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(badContent);

    // State file should have been committed
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).not.toBeNull();
  });

  it('should overwrite an orphaned pending transaction and allow reprocessing', async () => {
    const uuid = uuidv4();
    const newContent = 'console.log("final content");';
    
    // 1. Manually create a pending state to simulate a crash during a previous run.
    const orphanedState: StateFile = {
      uuid,
      projectId: 'test-project',
      createdAt: new Date().toISOString(),
      reasoning: ['orphaned transaction'],
      operations: [{ type: 'write', path: testFile, content: "this won't be applied", strategy: 'replace' }],
      snapshot: { [testFile]: originalContent },
      approved: false,
    };
    await writePendingState(context.testDir.path, orphanedState);

    // 2. Run processPatch again with the same UUID. It should detect the orphaned pending state,
    // delete it, and process the new patch successfully.
    await runProcessPatch(
      context,
      {},
      [{ type: 'edit', path: testFile, content: newContent }],
      { responseOverrides: { uuid } }
    );
    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe(newContent);

    // A committed state file should exist
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).not.toBeNull();
    if (!stateData) return;
    // The final committed reasoning should be from the second run.
    expect(stateData.operations.length).toBeGreaterThan(0);
    const op = stateData.operations[0]!;
    expect(op.type).toBe('write');
    if (op.type === 'write') {
      expect(op.content).toContain('final content');
    }
  });

  it('should run pre and post commands in the correct order', async () => {
    const preCommandFile = path.join(context.testDir.path, 'pre.txt');
    const postCommandFile = path.join(context.testDir.path, 'post.txt');

    // Use a synchronous file write to avoid potential race conditions or async flushing issues
    // with `node -e` in a shelled-out process.
    const preCommand = `node -e "require('fs').writeFileSync('${preCommandFile.replace(/\\/g, '/')}', '')"`;
    const postCommand = `node -e "require('fs').writeFileSync('${postCommandFile.replace(/\\/g, '/')}', '')"`;

    await runProcessPatch(
      context,
      {
        preCommand,
        postCommand,
      },
      [{ type: 'edit', path: testFile, content: 'new content' }]
    );

    const preExists = await fs.access(preCommandFile).then(() => true).catch(() => false);
    expect(preExists).toBe(true);

    const postExists = await fs.access(postCommandFile).then(() => true).catch(() => false);
    expect(postExists).toBe(true);

    const finalContent = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(finalContent).toBe('new content');
  });

 it('should create a pending record during transaction and mark as undone on rollback', async () => {
    const uuid = uuidv4();
    let pendingFileExistedDuringRun = false;

    const prompter = async (): Promise<boolean> => {
      const db = getDb(context.testDir.path);
      const pendingRecord = await db.query().from('transactions').where({ uuid, status: 'pending' }).first();
      pendingFileExistedDuringRun = !!pendingRecord;
      return false; // Disapprove to trigger rollback
    };

    await runProcessPatch(
      context,
      { approvalMode: 'manual' },
      [{ type: 'edit', path: testFile, content: 'I will be rolled back' }],
      { prompter, responseOverrides: { uuid } }
    );

    expect(pendingFileExistedDuringRun).toBe(true);

    // No committed file should exist
    const committedState = await readStateFile(context.testDir.path, uuid);
    expect(committedState).toBeNull();

    // A record with status 'undone' should exist
    const db = getDb(context.testDir.path);
    const undoneRecord = await db.query().from('transactions').where({ uuid, status: 'undone' }).first();
    expect(undoneRecord).not.toBeNull();
  });

  it('should fail transaction gracefully if a file is not writable and rollback all changes', async () => {
    const unwritableFile = 'src/unwritable.ts';
    const writableFile = 'src/writable.ts';
    const originalUnwritableContent = 'original unwritable';
    const originalWritableContent = 'original writable';

    await createTestFile(context.testDir.path, unwritableFile, originalUnwritableContent);
    await createTestFile(context.testDir.path, writableFile, originalWritableContent);

    const unwritableFilePath = path.join(context.testDir.path, unwritableFile);

    try {
      await fs.chmod(unwritableFilePath, 0o444); // Make read-only

      const { uuid } = await runProcessPatch(
        context, {},
        [
          { type: 'edit', path: writableFile, content: 'new writable content' },
          { type: 'edit', path: unwritableFile, content: 'new unwritable content' }
        ]
      );

      // Check file states: both should be rolled back to original content.
      const finalWritable = await fs.readFile(path.join(context.testDir.path, writableFile), 'utf-8');
      expect(finalWritable).toBe(originalWritableContent);

      const finalUnwritable = await fs.readFile(path.join(context.testDir.path, unwritableFile), 'utf-8');
      expect(finalUnwritable).toBe(originalUnwritableContent);

      // No state file should have been committed
      const stateData = await readStateFile(context.testDir.path, uuid);
      expect(stateData).toBeNull();
    } finally {
      // Make the file writable again to allow cleanup
      try {
        await fs.chmod(unwritableFilePath, 0o644);
      } catch (err) {
        console.error('Failed to restore file permissions:', err);
      }
    }
  });

  it('should rollback gracefully if creating a file in a non-writable directory fails', async () => {
    const readonlyDir = 'src/readonly-dir';
    const newFilePath = path.join(readonlyDir, 'new-file.ts');
    const readonlyDirPath = path.join(context.testDir.path, readonlyDir);

    await fs.mkdir(readonlyDirPath, { recursive: true });
    await fs.chmod(readonlyDirPath, 0o555); // Read and execute only

    try {
      const { uuid } = await runProcessPatch(
        context,
        {},
        [{ type: 'new', path: newFilePath, content: 'this should not be written' }]
      );

      // Check that the new file was not created
      const newFileExists = await fs.access(path.join(context.testDir.path, newFilePath)).then(() => true).catch(() => false);
      expect(newFileExists).toBe(false);

      // No state file should have been committed
      const stateData = await readStateFile(context.testDir.path, uuid);
      expect(stateData).toBeNull();
    } finally {
      // Restore permissions for cleanup
      try {
        // The directory might have been removed on rollback, so check if it exists first.
        if (await fs.access(readonlyDirPath).then(() => true).catch(() => false)) {
          await fs.chmod(readonlyDirPath, 0o755);
        }
      } catch (err) {
        console.error('Failed to restore directory permissions:', err);
      }
    }
  });

  it('should correctly rollback a complex transaction (modify, delete, create)', async () => {
    // Setup initial files
    const fileToModify = 'src/modify.ts';
    const originalModifyContent = 'export const a = 1;';
    await createTestFile(context.testDir.path, fileToModify, originalModifyContent);

    const fileToDelete = 'src/delete.ts';
    const originalDeleteContent = 'export const b = 2;';
    await createTestFile(context.testDir.path, fileToDelete, originalDeleteContent);

    const newFilePath = 'src/new/component.ts';
    const newFileContent = 'export const c = 3;';

    // Disapprove the transaction
    await runProcessPatch(
      context,
      { approvalMode: 'manual' },
      [
        { type: 'edit', path: fileToModify, content: 'export const a = 100;' },
        { type: 'delete', path: fileToDelete },
        { type: 'new', path: newFilePath, content: newFileContent }
      ], { prompter: async () => false }
    );

    // Verify rollback
    const modifiedFileContent = await fs.readFile(path.join(context.testDir.path, fileToModify), 'utf-8');
    expect(modifiedFileContent).toBe(originalModifyContent);

    const deletedFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
    expect(deletedFileExists).toBe(true);

    const deletedFileContent = await fs.readFile(path.join(context.testDir.path, fileToDelete), 'utf-8');
    expect(deletedFileContent).toBe(originalDeleteContent);

    const newFileExists = await fs.access(path.join(context.testDir.path, newFilePath)).then(() => true).catch(() => false);
    expect(newFileExists).toBe(false);
  });

  it('should correctly rollback a mega-complex transaction and restore filesystem state', async () => {
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

    const existingSharedFile = 'src/shared/existing.ts';
    const originalSharedContent = 'export const d = 4;';
    await createTestFile(context.testDir.path, existingSharedFile, originalSharedContent);

    const newSharedFile = 'src/shared/new.ts';

    // 2. OPERATIONS
    await runProcessPatch(
        context,
        { approvalMode: 'manual' },
        [
            // Standard modify
            { type: 'edit', path: fileToModify, content: 'export const a = 100;' },
            // Standard delete
            { type: 'delete', path: fileToDelete },
            // Standard create
            { type: 'new', path: 'src/new-file.ts', content: 'export const e = 5;' },
            // Rename a file
            { type: 'rename', from: fileToRename, to: renamedPath },
            // Modify the *renamed* file
            { type: 'edit', path: renamedPath, content: 'export const c = 300;' },
            // Re-create a file with the *original* name of the renamed file
            { type: 'new', path: fileToRename, content: 'export const f = 6;' },
            // Create a file in an existing directory
            { type: 'new', path: newSharedFile, content: 'export const g = 7;' },
        ],
        { prompter: async () => false } // 3. TRIGGER ROLLBACK
    );

    // 4. ASSERTIONS
    // Check modified file
    const modifiedContent = await fs.readFile(path.join(context.testDir.path, fileToModify), 'utf-8');
    expect(modifiedContent).toBe(originalModifyContent);

    // Check deleted file (should be restored)
    const deletedFileExists = await fs.access(path.join(context.testDir.path, fileToDelete)).then(() => true).catch(() => false);
    expect(deletedFileExists).toBe(true);
    const deletedContent = await fs.readFile(path.join(context.testDir.path, fileToDelete), 'utf-8');
    expect(deletedContent).toBe(originalDeleteContent);

    // Check created file (should be gone)
    const newFileExists = await fs.access(path.join(context.testDir.path, 'src/new-file.ts')).then(() => true).catch(() => false);
    expect(newFileExists).toBe(false);

    // Check renamed file (original should be restored, renamed path should be gone)
    const originalRenamedFileExists = await fs.access(path.join(context.testDir.path, fileToRename)).then(() => true).catch(() => false);
    expect(originalRenamedFileExists).toBe(true);
    const originalRenamedContent = await fs.readFile(path.join(context.testDir.path, fileToRename), 'utf-8');
    expect(originalRenamedContent).toBe(originalRenameContent);
    
    const renamedFileExists = await fs.access(path.join(context.testDir.path, renamedPath)).then(() => true).catch(() => false);
    expect(renamedFileExists).toBe(false);

    // Check shared directory state
    const existingSharedFileExists = await fs.access(path.join(context.testDir.path, existingSharedFile)).then(() => true).catch(() => false);
    expect(existingSharedFileExists).toBe(true);
    const sharedContent = await fs.readFile(path.join(context.testDir.path, existingSharedFile), 'utf-8');
    expect(sharedContent).toBe(originalSharedContent);
    
    const newSharedFileExists = await fs.access(path.join(context.testDir.path, newSharedFile)).then(() => true).catch(() => false);
    expect(newSharedFileExists).toBe(false);

    const sharedDirExists = await fs.access(path.join(context.testDir.path, 'src/shared')).then(() => true).catch(() => false);
    expect(sharedDirExists).toBe(true); // Directory should not be deleted as it wasn't empty
  });

  it('should correctly apply multiple sequential operations on the same file, including a rename', async () => {
    const originalFilePath = 'src/service.ts';
    const renamedFilePath = 'src/services/main-service.ts';
    const originalServiceContent = `class Service {
    name = "MyService";

    execute() {
        console.log("Executing service");
    }
}`;
    await createTestFile(context.testDir.path, originalFilePath, originalServiceContent);

    // First, a standard diff to rename a property and add a new one.
    const unifiedDiff = `--- a/${originalFilePath}
+++ b/${originalFilePath}
@@ -1,5 +1,6 @@
 class Service {
-     name = "MyService";
+    name = "MyAwesomeService";
+    version = "1.0";

     execute() {
         console.log("Executing service");
    }
}`;

    // Then, a search-replace to update a method on the *result* of the first patch.
    const searchReplaceDiff = `
<<<<<<< SEARCH
        console.log("Executing service");
=======
        console.log(\`Executing service \${this.name} v\${this.version}\`);
>>>>>>> REPLACE
`;

    // And finally, rename the file.
    const { uuid } = await runProcessPatch(
      context,
      {},
      [
        { type: 'edit', path: originalFilePath, content: unifiedDiff, strategy: 'standard-diff' },
        { type: 'edit', path: originalFilePath, content: searchReplaceDiff, strategy: 'search-replace' },
        { type: 'rename', from: originalFilePath, to: renamedFilePath },
      ]
    );

    // 1. Verify file system state
    const originalFileExists = await fs.access(path.join(context.testDir.path, originalFilePath)).then(() => true).catch(() => false);
    expect(originalFileExists).toBe(false);

    const renamedFileExists = await fs.access(path.join(context.testDir.path, renamedFilePath)).then(() => true).catch(() => false);
    expect(renamedFileExists).toBe(true);

    // 2. Verify final content
    const finalContent = await fs.readFile(path.join(context.testDir.path, renamedFilePath), 'utf-8');
    const expectedContent = `class Service {
    name = "MyAwesomeService";
    version = "1.0";

    execute() {
        console.log(\`Executing service \${this.name} v\${this.version}\`);
    }
}`;
    expect(finalContent.replace(/\s/g, '')).toBe(expectedContent.replace(/\s/g, ''));

    // 3. Verify snapshot in state file for rollback purposes
    const stateData = await readStateFile(context.testDir.path, uuid);
    expect(stateData).not.toBeNull();
    expect(stateData?.snapshot[originalFilePath]).toBe(originalServiceContent);
    expect(stateData?.snapshot[renamedFilePath]).toBe(null); // It didn't exist at snapshot time
  });
});
