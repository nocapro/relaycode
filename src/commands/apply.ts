import { promises as fs } from 'fs';
import path from 'path';
import { loadConfigOrExit } from '../core/config';
import { parseLLMResponse, logger as coreLogger } from 'relaycode-core';
import { processPatch } from '../core/transaction';
import { logger } from '../utils/logger';
import chalk from 'chalk';

export const applyCommand = async (filePath: string, options: { yes?: boolean } = {}, cwd: string = process.cwd()): Promise<void> => {
    const config = await loadConfigOrExit(cwd);
    logger.setLevel(config.core.logLevel);
    if (config.core.logLevel === 'debug') {
        coreLogger.setLevel('debug');
    }

    let content: string;
    const absoluteFilePath = path.resolve(cwd, filePath);
    try {
        const stats = await fs.stat(absoluteFilePath);
        if (stats.isDirectory()) {
            logger.error(`Path is a directory, not a file: ${chalk.cyan(absoluteFilePath)}`);
            return;
        }
        content = await fs.readFile(absoluteFilePath, 'utf-8');
        logger.info(`Reading patch from file: ${chalk.cyan(absoluteFilePath)}`);
    } catch (error) {
        logger.error(`Failed to read patch file at '${chalk.cyan(absoluteFilePath)}'. Aborting.`);
        return;
    }

    logger.info('Attempting to parse patch file...');
    const parsedResponse = parseLLMResponse(content);

    if (!parsedResponse) {
        logger.error('The content of the file is not a valid relaycode patch. Aborting.');
        return;
    }

    if (parsedResponse.ignoredBlocks && parsedResponse.ignoredBlocks.length > 0) {
        parsedResponse.ignoredBlocks.forEach(block => {
            logger.warn(`${chalk.yellow('⚠ Ignored block:')} ${block.reason}`);
        });
    }

    if (parsedResponse.operations.length === 0) {
        logger.info('No operations to apply from this file.');
        return;
    }

    logger.success('Valid patch format detected. Processing...');
    await processPatch(config, parsedResponse, { cwd, yes: options.yes });
    logger.info(chalk.gray('--------------------------------------------------'));
};