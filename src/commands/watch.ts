import {
  findConfig,
  loadConfigOrExit,
  findConfigPath,
  getStateDirectory,
} from '../core/config';
import { createClipboardWatcher, createBulkClipboardWatcher } from '../core/clipboard';
import chalk from 'chalk';
import {
  parseLLMResponse,
  type ParsedLLMResponse,
  logger as coreLogger,
} from 'relaycode-core';
import { processPatch, processPatchesBulk } from '../core/transaction';
import { logger, getErrorMessage } from '../utils/logger';
import { type Config } from 'relaycode-core';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';


export const watchCommand = async (options: { yes?: boolean } = {}, cwd: string = process.cwd()): Promise<{ stop: () => void }> => {
  let clipboardWatcher: { stop: () => void } | null = null;
  let configWatcher: fs.FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  const startServices = async (config: Config) => {
    // Stop existing watcher if it's running
    if (clipboardWatcher) {
      clipboardWatcher.stop();
    }

    logger.setLevel(config.core.logLevel);
    if (config.core.logLevel === 'debug') {
      coreLogger.setLevel('debug');
    }
    logger.debug(`Log level set to: ${config.core.logLevel}`);
    logger.debug(`Preferred strategy set to: ${config.watcher.preferredStrategy}`);

    const systemPromptPath = path.join(getStateDirectory(cwd), 'prompts', 'system-prompt.md');
    try {
      const systemPrompt = await fs.promises.readFile(systemPromptPath, 'utf-8');
      await clipboardy.write(systemPrompt);
      logger.success('✅ System prompt copied to clipboard.');
      logger.info(
        `Paste it into your LLM's "System Prompt" or "Custom Instructions" section.`
      );
    } catch (error) {
      logger.error(
        `Could not read or copy system prompt from ${chalk.cyan(systemPromptPath)}.`
      );
      logger.info(
        `Please run ${chalk.magenta("'relay init'")} to generate it, or create it manually.`
      );
      logger.debug(`Error details: ${getErrorMessage(error)}`);
    }

    // Use bulk clipboard watcher if bulk mode is enabled
    if (config.watcher.enableBulkProcessing) {
      clipboardWatcher = createBulkClipboardWatcher(
        config.watcher.clipboardPollInterval,
        async (contents) => {
          logger.info(`Processing ${contents.length} clipboard items in bulk mode...`);

          const parsedResponses: ParsedLLMResponse[] = [];
          for (const content of contents) {
            const parsedResponse = parseLLMResponse(content);
            if (parsedResponse) {
              if (parsedResponse.ignoredBlocks && parsedResponse.ignoredBlocks.length > 0) {
                parsedResponse.ignoredBlocks.forEach(block => {
                  logger.warn(`${chalk.yellow('⚠ Ignored block:')} ${block.reason}`);
                });
              }
              // Only add responses that have operations to process
              if (parsedResponse.operations.length > 0) {
                parsedResponses.push(parsedResponse);
              }
            }
          }

          if (parsedResponses.length === 0) {
            logger.warn('No operations to process from clipboard items.');
            return;
          }

          await processPatchesBulk(config, parsedResponses, { cwd, notifyOnStart: true, yes: options.yes });
          logger.info(chalk.gray(`\n[relay] Watching for patches...`));
        },
        config.watcher.bulkSize || 5,
        config.watcher.bulkTimeout || 30000
      );
    } else {
      clipboardWatcher = createClipboardWatcher(config.watcher.clipboardPollInterval, async (content) => {
        logger.debug('New clipboard content detected. Attempting to parse...');
        const parsedResponse = parseLLMResponse(content);

        if (!parsedResponse) {
          logger.debug('Clipboard content is not a valid relaycode patch. Ignoring.');
          return;
        }
        
        // Check project ID before notifying and processing.
        if (parsedResponse.control.projectId !== config.projectId) {
          logger.debug(`Ignoring patch for different project (expected '${config.projectId}', got '${parsedResponse.control.projectId}').`);
          return;
        }

        if (parsedResponse.ignoredBlocks && parsedResponse.ignoredBlocks.length > 0) {
            parsedResponse.ignoredBlocks.forEach(block => {
                logger.warn(`${chalk.yellow('⚠ Ignored block:')} ${block.reason}`);
            });
        }
        if (parsedResponse.operations.length === 0) {
            return; // Silently return, user has been notified of ignored blocks if any.
        }

        await processPatch(config, parsedResponse, { cwd, notifyOnStart: true, yes: options.yes });
        logger.info(chalk.gray(`\n[relay] Watching for patches...`));
      });
    }
  };

  const handleConfigChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      logger.info(`Configuration file change detected. Reloading...`);
      try {
        const newConfig = await findConfig(cwd);
        if (newConfig) {
          logger.success('Configuration reloaded. Restarting services...');
          await startServices(newConfig);
        } else {
          logger.error(`Configuration file is invalid or has been deleted. Services paused.`);
          if (clipboardWatcher) {
            clipboardWatcher.stop();
            clipboardWatcher = null;
          }
        }
      } catch (error) {
        logger.error(`Error reloading configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 250);
  };

  // Initial startup
  const initialConfig = await loadConfigOrExit(cwd);
  const configPath = await findConfigPath(cwd);
  
  const { clipboardPollInterval } = initialConfig.watcher;
  logger.info(
    chalk.gray(
      `[relay] Watching for patches... (project: ${initialConfig.projectId}, approval: ${initialConfig.patch.approvalMode}, poll: ${clipboardPollInterval}ms)`
    )
  );
  
  logger.success('Configuration loaded. Starting relaycode watch...');
  await startServices(initialConfig);

  // Watch for changes after initial setup
  if (initialConfig.core.watchConfig && configPath) {
    configWatcher = fs.watch(configPath, handleConfigChange);
  } else {
    logger.info('Configuration file watching is disabled. Changes to config will require a restart to take effect.');
  }

  const stopAll = () => {
    if (clipboardWatcher) {
      clipboardWatcher.stop();
    }
    if (configWatcher) {
      configWatcher.close();
      logger.info('Configuration file watcher stopped.');
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
  return { stop: stopAll };
};
