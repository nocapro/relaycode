import { logger } from '../utils/logger';
import { readAllStateFiles } from '../core/state';
import { STATE_DIRECTORY_NAME } from '../utils/constants';
import chalk from 'chalk';
import { formatTransactionDetails } from '../utils/formatters';

export const logCommand = async (cwd: string = process.cwd(), outputCapture?: string[]): Promise<void> => {
    const log = (message: string) => {
        if (outputCapture) {
            outputCapture.push(message);
        } else {
            logger.log(message);
        }
    };

    const transactions = await readAllStateFiles(cwd);

    if (transactions === null) {
        log(`${chalk.yellow('warn')}: State directory '${chalk.cyan(STATE_DIRECTORY_NAME)}' not found. No logs to display.`);
        log(`${chalk.blue('info')}: Run ${chalk.magenta("'relay init'")} to initialize the project.`);
        return;
    }

    if (transactions.length === 0) {
        log(`${chalk.blue('info')}: No committed transactions found.`);
        return;
    }

    log(chalk.bold('Committed Transactions (most recent first):'));
    log(chalk.gray('-------------------------------------------'));

    if (transactions.length === 0) {
        log(`${chalk.blue('info')}: No valid transactions found.`);
        return;
    }

    transactions.forEach(tx => {
        formatTransactionDetails(tx, { showOperations: true, showSpacing: true, showReasoning: false }).forEach(line => log(line));
    });
};