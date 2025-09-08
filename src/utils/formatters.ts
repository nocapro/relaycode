import chalk from 'chalk';
import { type FileOperation, type StateFile } from 'relaycode-core';

const opToString = (op: FileOperation): string => {
    switch (op.type) {
        case 'write': return `${chalk.green('write')}:  ${chalk.cyan(op.path)}`;
        case 'delete': return `${chalk.red('delete')}: ${chalk.cyan(op.path)}`;
        case 'rename': return `${chalk.yellow('rename')}: ${chalk.cyan(op.from)} -> ${chalk.cyan(op.to)}`;
    }
};

export const formatTransactionDetails = (
    tx: StateFile,
    options: { showOperations?: boolean, showSpacing?: boolean, showReasoning?: boolean } = {}
): string[] => {
    const { showOperations, showSpacing, showReasoning = true } = options;
    const lines: string[] = [
        `- ${chalk.bold('UUID')}: ${chalk.gray(tx.uuid)}`,
        `  ${chalk.bold('Date')}: ${new Date(tx.createdAt).toLocaleString()}`,
    ];

    if (tx.promptSummary) lines.push(`  ${chalk.bold('Prompt Summary')}: ${tx.promptSummary}`);
    if (tx.gitCommitMsg) lines.push(`  ${chalk.bold('Git Commit')}: "${tx.gitCommitMsg}"`);

    const hasLineChanges = typeof tx.linesAdded === 'number' && typeof tx.linesRemoved === 'number';
    if (hasLineChanges) {
        const diffText = typeof tx.linesDifference === 'number' ? ` (${chalk.yellow(`${tx.linesDifference} total`)})` : '';
        lines.push(`  ${chalk.bold('Lines Changed')}: ${chalk.green(`+${tx.linesAdded}`)}, ${chalk.red(`-${tx.linesRemoved}`)}${diffText}`);
    }

    if (showReasoning && tx.reasoning && tx.reasoning.length > 0) {
        lines.push(`  ${chalk.bold('Reasoning')}:`);
        tx.reasoning.forEach(r => lines.push(`    - ${r}`));
    }
    if (showOperations && tx.operations && tx.operations.length > 0) {
        lines.push(`  ${chalk.bold('Changes')}:`);
        tx.operations.forEach(op => lines.push(`    - ${opToString(op)}`));
    }
    if (showSpacing) {
        lines.push(''); // Newline for spacing
    }
    return lines;
};