import { readAllStateFiles, markTransactionsAsGitCommitted } from '../core/state';
import { logger } from '../utils/logger';
import { executeShellCommand } from '../utils/shell';
import { createConfirmationHandler, type Prompter } from '../utils/prompt';
import { formatTransactionDetails } from '../utils/formatters';
import { normalizeGitCommitMsg } from 'relaycode-core';
import chalk from 'chalk';

export const gitCommitCommand = async (options: { yes?: boolean } = {}, cwd: string = process.cwd(), prompter?: Prompter): Promise<void> => {
    const getConfirmation = createConfirmationHandler(options, prompter);

    logger.info('Looking for new transactions to commit...');

    // 1. Check if it's a git repository
    const gitCheck = await executeShellCommand('git rev-parse --is-inside-work-tree', cwd);
    if (gitCheck.exitCode !== 0) {
        logger.error('This does not appear to be a git repository. Aborting commit.');
        return;
    }

    // 2. Get the timestamp of the last commit
    const lastCommitTimeResult = await executeShellCommand('git log -1 --format=%ct', cwd);
    const lastCommitTimestamp = lastCommitTimeResult.exitCode === 0 ? parseInt(lastCommitTimeResult.stdout, 10) * 1000 : 0;
    
    // 3. Find all transactions newer than the last commit that haven't been git-committed yet
    const allTransactions = await readAllStateFiles(cwd) ?? [];
    const newTransactions = allTransactions
        .filter(tx => {
            // Only include transactions that:
            // 1. Are newer than the last git commit, OR
            // 2. Have never been git-committed (for new repos with no commits)
            const isNewerThanLastCommit = new Date(tx.createdAt).getTime() > lastCommitTimestamp;
            const hasNotBeenGitCommitted = !(tx as any).gitCommittedAt;
            return (isNewerThanLastCommit || lastCommitTimestamp === 0) && hasNotBeenGitCommitted;
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Sort oldest to newest

    if (newTransactions.length === 0) {
        logger.info('No new transactions to commit since the last git commit.');
        return;
    }

    const commitMessages = newTransactions.map(tx => normalizeGitCommitMsg(tx.gitCommitMsg)).filter((msg): msg is string => !!msg);

    if (commitMessages.length === 0) {
        logger.warn('No new transactions with git commit messages found.');
        return;
    }

    // 4. Merge commit messages
    const mergedCommitMessage = commitMessages.join('\n\n');

    logger.log('Found new transactions to commit:');
    newTransactions.forEach(tx => {
        formatTransactionDetails(tx).forEach(line => logger.log(line));
    });

    const commitMessagePreview = mergedCommitMessage.split('\n').map(line => `    ${line}`).join('\n');
    const confirmed = await getConfirmation(`\nDo you want to run 'git add .' and commit with the following message?\n\n${chalk.yellow(commitMessagePreview)}\n\n(y/N)`);

    if (!confirmed) {
        logger.info('Commit operation cancelled.');
        return;
    }

    // 5. Execute git commands
    logger.info(`Running ${chalk.magenta("'git add .'")}...`);
    const addResult = await executeShellCommand('git add .', cwd);
    if (addResult.exitCode !== 0) {
        logger.error(`${chalk.magenta("'git add .'")} failed with exit code ${chalk.red(addResult.exitCode)}.`);
        logger.error(addResult.stderr);
        return;
    }
    logger.success(`${chalk.magenta("'git add .'")} completed successfully.`);

    const commitCmd = `git commit -m "${mergedCommitMessage}"`;
    logger.info(`Running commit command...`);
    const commitResult = await executeShellCommand(commitCmd, cwd);

    if (commitResult.exitCode !== 0) {
        logger.error(`${chalk.magenta("'git commit'")} failed with exit code ${chalk.red(commitResult.exitCode)}.`);
        logger.error(commitResult.stderr);
        if (commitResult.stdout) logger.log(commitResult.stdout);
        logger.warn('You may need to resolve commit issues manually.');
        return;
    }
    
    // 6. Mark transactions as git-committed
    const transactionUuids = newTransactions.map(tx => tx.uuid);
    await markTransactionsAsGitCommitted(cwd, transactionUuids);
    
    logger.success('✅ Git commit successful!');
    logger.log(commitResult.stdout);
};