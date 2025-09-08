import { loadConfigOrExit } from '../core/config';
import { findStateFileByIdentifier, readAllStateFiles } from '../core/state';
import { processPatch } from '../core/transaction';
import { logger } from '../utils/logger';
import { type FileOperation, type ParsedLLMResponse } from 'relaycode-core';
import { v4 as uuidv4 } from 'uuid';
import { createConfirmationHandler, type Prompter } from '../utils/prompt';
import { formatTransactionDetails } from '../utils/formatters';
import chalk from 'chalk';

interface RevertOptions {
    yes?: boolean;
    includeReverts?: boolean;
}

export const revertCommand = async (identifier?: string, options: RevertOptions = {}, cwd: string = process.cwd(), prompter?: Prompter): Promise<void> => {
    const getConfirmation = createConfirmationHandler(options, prompter);
    const config = await loadConfigOrExit(cwd);

    let targetDescription: string;

    // Default to '1' to revert the latest transaction if no identifier is provided.
    const effectiveIdentifier = identifier ?? '1';

    const isIndexSearch = /^-?\d+$/.test(effectiveIdentifier);

    if (isIndexSearch) {
        const index = Math.abs(parseInt(effectiveIdentifier, 10));
        if (isNaN(index) || index <= 0) {
            logger.error(`Invalid index. Please provide a positive number (e.g., ${chalk.cyan('"1"')} for the latest).`);
            return;
        }
        targetDescription = index === 1 ? 'the latest transaction' : `the ${chalk.cyan(index)}-th latest transaction`;
    } else {
        // We assume it's a UUID, findStateFileByIdentifier will validate
        targetDescription = `transaction with UUID '${chalk.cyan(effectiveIdentifier)}'`;
    }

    logger.info(`Looking for ${targetDescription}...`);
    const stateToRevert = await findStateFileByIdentifier(cwd, effectiveIdentifier, {
        skipReverts: !options.includeReverts,
    });

    if (!stateToRevert) {
        logger.error(`Could not find ${targetDescription}.`);
        if (isIndexSearch) {
            const allTransactions = await readAllStateFiles(cwd, { skipReverts: false }); // Show total count including reverts
            const nonRevertTransactions = await readAllStateFiles(cwd, { skipReverts: true });
            const revertCount = (allTransactions?.length ?? 0) - (nonRevertTransactions?.length ?? 0);
            
            logger.info(`Found ${chalk.cyan(allTransactions?.length ?? 0)} total transactions.`);
            if (revertCount > 0) {
                logger.info(`${chalk.cyan(revertCount)} of them are revert transactions, which are skipped by default.`);
                logger.info(`Use the ${chalk.cyan('--include-reverts')} flag to include them in the search.`);
            }
        }
        return;
    }
    logger.log(chalk.bold(`Transaction to be reverted:`));
    formatTransactionDetails(stateToRevert).forEach(line => logger.log(line));

    const confirmed = await getConfirmation('\nAre you sure you want to revert this transaction? (y/N)');
    if (!confirmed) {
        logger.info('Revert operation cancelled.');
        return;
    }

    // 3. Generate inverse operations.
    // This logic is simpler and more robust than trying to reverse each operation individually.
    // It determines the final state of files after the transaction and generates operations
    // to transform that final state back to the initial snapshot state.
    const inverse_operations: FileOperation[] = [];

    // Get a set of all file paths that existed *after* the transaction.
    const finalPaths = new Set<string>(Object.keys(stateToRevert.snapshot));
    for (const op of stateToRevert.operations) {
        if (op.type === 'rename') {
            finalPaths.delete(op.from);
            finalPaths.add(op.to);
        } else if (op.type === 'write' && !finalPaths.has(op.path)) {
            finalPaths.add(op.path); // A new file was created
        } else if (op.type === 'delete') {
            finalPaths.delete(op.path);
        }
    }

    // Any path that exists now but didn't in the snapshot (or was null) must be deleted.
    for (const finalPath of finalPaths) {
        if (!stateToRevert.snapshot.hasOwnProperty(finalPath) || stateToRevert.snapshot[finalPath] === null) {
            inverse_operations.push({ type: 'delete', path: finalPath });
        }
    }

    // Any path that was in the snapshot must be restored to its original content.
    for (const [snapshotPath, content] of Object.entries(stateToRevert.snapshot)) {
        if (content !== null) {
            inverse_operations.push({ type: 'write', path: snapshotPath, content, patchStrategy: 'replace' });
        }
    }

    if (inverse_operations.length === 0) {
        logger.warn('No operations to revert for this transaction.');
        return;
    }

    // 4. Create and process a new "revert" transaction
    const newUuid = uuidv4();
    const reasoning = [
        `Reverting transaction ${stateToRevert.uuid}.`,
        `Reasoning from original transaction: ${stateToRevert.reasoning.join(' ')}`
    ];

    const parsedResponse: ParsedLLMResponse = {
        control: {
            projectId: config.projectId,
            uuid: newUuid,
        },
        operations: inverse_operations,
        reasoning,
    };

    logger.info(`Creating new transaction ${chalk.gray(newUuid)} to perform the revert.`);
    await processPatch(config, parsedResponse, { cwd, prompter, yes: options.yes });
};