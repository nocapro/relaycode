import { type Config, type ParsedLLMResponse, type StateFile, type FileSnapshot, type FileOperation, normalizeGitCommitMsg } from 'relaycode-core';
import { logger, getErrorMessage } from '../utils/logger';
import { getErrorCount, executeShellCommand } from '../utils/shell';
import { deleteFile, readFileContent, removeEmptyParentDirectories, renameFile, writeFileContent } from '../utils/fs';
import path from 'path';
import chalk from 'chalk';
import { applyOperations as applyOperationsCore, calculateLineChanges as calculateLineChangesCore } from 'relaycode-core';

import { commitState, deletePendingState, hasBeenProcessed, updatePendingState, writePendingState } from './state';
import { createConfirmationHandler } from '../utils/prompt';
import { requestApprovalWithNotification, notifyFailure, notifySuccess, notifyPatchDetected, notifyRollbackFailure } from '../utils/notifier';

type Prompter = (question: string) => Promise<boolean>;

type ProcessPatchOptions = {
    prompter?: Prompter;
    cwd?: string;
    notifyOnStart?: boolean;
    yes?: boolean;
};

const transactionLocks = new Map<string, Promise<any>>();

export const createSnapshot = async (filePaths: string[], cwd: string = process.cwd()): Promise<FileSnapshot> => {
  const snapshot: FileSnapshot = {};
  await Promise.all(
    filePaths.map(async (filePath) => {
      snapshot[filePath] = await readFileContent(filePath, cwd);
    })
  );
  return snapshot;
};

/**
 * Applies a series of file operations to the filesystem and returns the new in-memory file states.
 * This function processes operations sequentially, applying patches (like diffs) against the evolving
 * state of files, and performing filesystem actions (write, delete, rename) along the way.
 * @param operations The file operations to apply.
 * @param originalFiles The initial state of the files.
 * @param cwd The working directory.
 * @returns A map representing the final state of all affected files.
 */
export const applyOperations = async (  
  operations: FileOperation[],
  originalFiles: Map<string, string | null>,
  cwd: string = process.cwd()
): Promise<Map<string, string | null>> => {
  // Step 1: Calculate all new file states in-memory. This is now parallelized inside relaycode-core.
  const result = await applyOperationsCore(operations, originalFiles);

  if (!result.success) {
    throw new Error(`Failed to calculate state changes: ${result.error}`);
  }

  const { newFileStates } = result;

  // Step 2: Apply physical changes to the filesystem.
  // To correctly handle renames, we process rename operations first.
  const renameOps = operations.filter((op): op is Extract<FileOperation, {type: 'rename'}> => op.type === 'rename');
  for (const op of renameOps) {
    await renameFile(op.from, op.to, cwd);
  }

  // Step 3: Apply writes and deletes, which can be done in parallel.
  const fsPromises: Promise<void>[] = [];
  const allPaths = new Set([...originalFiles.keys(), ...newFileStates.keys()]);
  const renamedFromPaths = new Set(renameOps.map(op => op.from));

  for (const path of allPaths) {
    if (renamedFromPaths.has(path)) continue; // This path was a source of a rename, it's already handled.

    const oldContent = originalFiles.get(path);
    const newContent = newFileStates.get(path);
    if (oldContent !== newContent) {
        // Use `== null` to check for both null and undefined.
        // If newContent is missing from the map, it's treated as a deletion.
        if (newContent == null) {
            fsPromises.push(deleteFile(path, cwd));
        } else {
            fsPromises.push(writeFileContent(path, newContent, cwd));
        }
    }
  }
  await Promise.all(fsPromises);

  return newFileStates;
};

export const restoreSnapshot = async (snapshot: FileSnapshot, cwd: string = process.cwd()): Promise<void> => {
  const projectRoot = path.resolve(cwd);
  const entries = Object.entries(snapshot);
  const directoriesToClean = new Set<string>();
  const restoreErrors: { path: string, error: unknown }[] = [];

  // Attempt to restore all files in parallel, collecting errors.
  await Promise.all(entries.map(async ([filePath, content]) => {
      const fullPath = path.resolve(cwd, filePath);
      try {
        if (content === null) {
          // If the file didn't exist in the snapshot, make sure it doesn't exist after restore.
          await deleteFile(filePath, cwd);
          directoriesToClean.add(path.dirname(fullPath));
        } else {
          // Create directory structure if needed and write the original content back.
          await writeFileContent(filePath, content, cwd);
        }
      } catch (error) {
        restoreErrors.push({ path: filePath, error });
      }
  }));
  
  // After all files are processed, clean up empty directories
  // Sort directories by depth (deepest first) to clean up nested empty dirs properly
  const sortedDirs = Array.from(directoriesToClean)
    .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  
  // Process each directory that had files deleted
  for (const dir of sortedDirs) {
    await removeEmptyParentDirectories(dir, projectRoot);
  }

  if (restoreErrors.length > 0) {
    const errorSummary = restoreErrors
      .map(e => `  - ${e.path}: ${getErrorMessage(e.error)}`)
      .join('\n');
    throw new Error(`Rollback failed for ${restoreErrors.length} file(s):\n${errorSummary}`);
  }
};

const logCompletionSummary = (
    uuid: string,
    startTime: number,
    operations: FileOperation[]
) => {
    const duration = performance.now() - startTime;

    logger.log(chalk.bold('\nSummary:'));
    logger.log(`Applied ${chalk.cyan(operations.length)} file operation(s) successfully.`);
    logger.log(`Total time from start to commit: ${chalk.gray(`${duration.toFixed(2)}ms`)}`);
    logger.success(`✅ Transaction ${chalk.gray(uuid)} committed successfully!`);
};

const rollbackTransaction = async (cwd: string, uuid: string, snapshot: FileSnapshot, reason: string, enableNotifications: boolean = true, isError: boolean = true): Promise<void> => {
    if (isError) {
        logger.warn(`Rolling back changes: ${reason}`);
    }

    let rollbackSuccessful = false;
    try {
        await restoreSnapshot(snapshot, cwd);
        logger.success('  - Files restored to original state.');
        rollbackSuccessful = true;
    } catch (error) {
        logger.error(`Fatal: Rollback failed: ${getErrorMessage(error)}`);
        notifyRollbackFailure(uuid, enableNotifications);
        // Do not rethrow; we're already in a final error handling state.
    } finally {
        try {
            await deletePendingState(cwd, uuid);
            logger.info(`↩️ Transaction ${chalk.gray(uuid)} rolled back.`);
            if (isError && rollbackSuccessful) {
                notifyFailure(uuid, enableNotifications);
            }
        } catch (cleanupError) {
            logger.error(`Fatal: Could not clean up pending state for ${chalk.gray(uuid)}: ${getErrorMessage(cleanupError)}`);
        }
    }
};

type ApprovalOptions = {
    config: Config;
    cwd: string;
    getConfirmation: Prompter;
}

const handleApproval = async ({ config, cwd, getConfirmation }: ApprovalOptions): Promise<boolean> => {
    const finalErrorCount = await getErrorCount(config.patch.linter, cwd);
    logger.log(`  - Final linter error count: ${finalErrorCount > 0 ? chalk.red(finalErrorCount) : chalk.green(finalErrorCount)}`);
    
    const getManualApproval = async (reason: string): Promise<boolean> => {
        logger.warn(reason);
        
        const notificationResult = await requestApprovalWithNotification(config.projectId, config.core.enableNotifications);

        if (notificationResult === 'approved') {
            logger.info('Approved via notification.');
            return true;
        }
        if (notificationResult === 'rejected') {
            logger.info('Rejected via notification.');
            return false;
        }

        if (notificationResult === 'timeout') {
            logger.info('Notification timed out or was dismissed. Please use the terminal to respond.');
        }

        return await getConfirmation('Changes applied. Do you want to approve and commit them? (y/N)');
    };

    if (config.patch.approvalMode === 'manual') {
        return await getManualApproval('Manual approval mode is enabled.');
    }
    // auto mode
    const canAutoApprove = finalErrorCount <= config.patch.approvalOnErrorCount;
    if (canAutoApprove) {
        logger.success('  - Changes automatically approved based on your configuration.');
        return true;
    }
    return await getManualApproval(`Manual approval required: Linter found ${finalErrorCount} error(s) (threshold is ${config.patch.approvalOnErrorCount}).`);
};

const _processPatch = async (config: Config, parsedResponse: ParsedLLMResponse, options?: ProcessPatchOptions): Promise<void> => {
    const cwd = options?.cwd || process.cwd();
    const getConfirmation = createConfirmationHandler({ yes: options?.yes }, options?.prompter);
    const { control, operations, reasoning } = parsedResponse;
    const { uuid, projectId } = control;
    const startTime = performance.now();

    // 1. Validation
    if (projectId !== config.projectId) {
        logger.warn(`Skipping patch: projectId mismatch (expected '${chalk.cyan(config.projectId)}', got '${chalk.cyan(projectId)}').`);
        return;
    }
    if (await hasBeenProcessed(cwd, uuid)) {
        logger.info(`Skipping patch: uuid '${chalk.gray(uuid)}' has already been processed.`);
        return;
    }

    const { minFileChanges, maxFileChanges } = config.patch;
    const operationCount = operations.length;
    if (minFileChanges > 0 && operationCount < minFileChanges) {
        logger.warn(`Skipping patch: Not enough file changes (expected at least ${minFileChanges}, got ${operationCount}).`);
        return;
    }
    if (maxFileChanges && operationCount > maxFileChanges) {
        logger.warn(`Skipping patch: Too many file changes (expected at most ${maxFileChanges}, got ${operationCount}).`);
        return;
    }

    // Notify if coming from watch mode, now that we know it's a new patch.
    if (options?.notifyOnStart) {
        notifyPatchDetected(config.projectId, config.core.enableNotifications);
        logger.success(`Valid patch detected for project '${chalk.cyan(config.projectId)}'. Processing...`);
    }

    // 2. Pre-flight checks
    if (config.patch.preCommand) {
        logger.log(`  - Running pre-command: ${chalk.magenta(config.patch.preCommand)}`);
        const { exitCode, stderr } = await executeShellCommand(config.patch.preCommand, cwd);
        if (exitCode !== 0) {
            logger.error(`Pre-command failed with exit code ${chalk.red(exitCode)}, aborting transaction.`);
            if (stderr) logger.error(`Stderr: ${stderr}`);
            return;
        }
    }

    logger.info(`🚀 Starting transaction for patch ${chalk.gray(uuid)}...`);
    logger.log(`${chalk.bold('Reasoning:')}\n  ${reasoning.join('\n  ')}`);

    const affectedFilePaths = operations.reduce<string[]>((acc, op) => {
        if (op.type === 'rename') {
            acc.push(op.from, op.to);
        } else {
            acc.push(op.path);
        }
        return acc;
    }, []);
    const snapshot = await createSnapshot(affectedFilePaths, cwd);
    
    const stateFile: StateFile = {
        uuid,
        projectId,
        createdAt: new Date().toISOString(),
        gitCommitMsg: control.gitCommitMsg,
        promptSummary: control.promptSummary,
        reasoning,
        operations,
        snapshot,
        approved: false,
    };

    try {
        await writePendingState(cwd, stateFile);
        logger.success('  - Staged changes to .pending.yml file.');

        const originalFiles = new Map<string, string | null>();
        affectedFilePaths.forEach(p => originalFiles.set(p, snapshot[p] ?? null));

        // Apply changes
        logger.log('  - Applying file operations...');
        const newFileStates = await applyOperations(operations, originalFiles, cwd);
        logger.success('  - File operations complete.');

        const opStats = operations.map(op => {
            const stats = calculateLineChangesCore(op, originalFiles, newFileStates);
            if (op.type === 'write') {
                logger.success(`✔ Written: ${chalk.cyan(op.path)} (${chalk.green(`+${stats.added}`)}, ${chalk.red(`-${stats.removed}`)})`);
            } else if (op.type === 'delete') {
                logger.success(`✔ Deleted: ${chalk.cyan(op.path)}`);
            } else if (op.type === 'rename') {
                logger.success(`✔ Renamed: ${chalk.cyan(op.from)} -> ${chalk.cyan(op.to)}`);
            }
            return stats;
        });

        // Run post-command
        if (config.patch.postCommand) {
            logger.log(`  - Running post-command: ${chalk.magenta(config.patch.postCommand)}`);
            const postResult = await executeShellCommand(config.patch.postCommand, cwd);
            if (postResult.exitCode !== 0) {
                logger.error(`Post-command failed with exit code ${chalk.red(postResult.exitCode)}.`);
                if (postResult.stderr) logger.error(`Stderr: ${postResult.stderr}`);
                throw new Error('Post-command failed, forcing rollback.');
            }
        }

        // Log summary before asking for approval
        const checksDuration = performance.now() - startTime;
        const totalAdded = opStats.reduce((sum, s) => sum + s.added, 0);
        const totalRemoved = opStats.reduce((sum, s) => sum + s.removed, 0);
        const totalDifference = opStats.reduce((sum, s) => sum + s.difference, 0);

        logger.log(chalk.bold('\nPre-flight summary:'));
        logger.success(`Lines changed: ${chalk.green(`+${totalAdded}`)}, ${chalk.red(`-${totalRemoved}`)} (${chalk.yellow(`${totalDifference} total`)})`);
        logger.log(`Checks completed in ${chalk.gray(`${checksDuration.toFixed(2)}ms`)}`);

        const isApproved = await handleApproval({ config, cwd, getConfirmation });

        if (isApproved) {
            stateFile.approved = true;
            stateFile.linesAdded = totalAdded;
            stateFile.linesRemoved = totalRemoved;
            stateFile.linesDifference = totalDifference;
            await updatePendingState(cwd, stateFile); // Update state with approval and stats before commit
            await commitState(cwd, uuid);
            logCompletionSummary(uuid, startTime, operations);
            notifySuccess(uuid, config.core.enableNotifications);
            await handleAutoGitBranch(config, stateFile, cwd);
        } else {
            logger.warn('Operation cancelled by user. Rolling back changes...');
            await rollbackTransaction(cwd, uuid, snapshot, 'User cancellation', config.core.enableNotifications, false);
        }
    } catch (error) {
        const reason = getErrorMessage(error);
        await rollbackTransaction(cwd, uuid, snapshot, reason, config.core.enableNotifications, true);
    }
};

/**
 * Processes a patch transaction. This function acts as a locking wrapper around the core
 * patch processing logic (`_processPatch`) to ensure that only one transaction is
 * processed at a time for a given working directory. This prevents race conditions
 * with the file-based database.
 * @param config The application configuration.
 * @param parsedResponse The parsed response from the LLM.
 * @param options Options for processing the patch.
 */
export const processPatch = async (config: Config, parsedResponse: ParsedLLMResponse, options?: ProcessPatchOptions): Promise<void> => {
    const cwd = options?.cwd || process.cwd();
    const run = () => _processPatch(config, parsedResponse, options);
    const ongoingTransaction = transactionLocks.get(cwd) ?? Promise.resolve();
    const nextTransaction = ongoingTransaction.finally(run);
    transactionLocks.set(cwd, nextTransaction);
    await nextTransaction;
};

const handleAutoGitBranch = async (config: Config, stateFile: StateFile, cwd: string): Promise<void> => {
    if (!config.git.autoGitBranch) return;

    let branchNameSegment = '';
    if (config.git.gitBranchTemplate === 'gitCommitMsg' && stateFile.gitCommitMsg) {
        branchNameSegment = normalizeGitCommitMsg(stateFile.gitCommitMsg) ?? '';
    } else {
        branchNameSegment = stateFile.uuid;
    }

    const sanitizedSegment = branchNameSegment
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove all non-word, non-space, non-hyphen chars
        .replace(/[\s_]+/g, '-') // Replace spaces and underscores with a single hyphen
        .replace(/-+/g, '-') // Collapse consecutive hyphens
        .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
        .slice(0, 70); // Truncate

    if (sanitizedSegment) {
        const branchName = `${config.git.gitBranchPrefix}${sanitizedSegment}`;
        logger.info(`Creating and switching to new git branch: ${chalk.magenta(branchName)}`);
        const command = `git checkout -b "${branchName}"`;
        const result = await executeShellCommand(command, cwd);
        if (result.exitCode === 0) {
            logger.success(`Successfully created and switched to branch '${chalk.magenta(branchName)}'.`);
        } else {
            // Exit code 128 from `git checkout -b` often means the branch already exists.
            if (result.exitCode === 128 && result.stderr.includes('already exists')) {
                logger.warn(`Could not create branch '${chalk.magenta(branchName)}' because it already exists.`);
            } else {
                logger.warn(`Could not create git branch '${chalk.magenta(branchName)}'.`);
            }
            logger.debug(`'${command}' failed with: ${result.stderr}`);
        }
    } else {
        logger.warn('Could not generate a branch name segment from commit message or UUID. Skipping git branch creation.');
    }
};
