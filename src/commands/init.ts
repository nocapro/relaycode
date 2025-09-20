import { promises as fs } from 'fs';
import path from 'path';
import { findConfig, createConfig, getProjectId, getStateDirectory } from '../core/config';
import { logger, getErrorMessage, isEnoentError } from '../utils/logger';
import {
  STATE_DIRECTORY_NAME,
  GITIGNORE_FILE_NAME,
  GITIGNORE_COMMENT,
  CONFIG_FILE_NAME_JSON,
} from '../utils/constants';
import chalk from 'chalk';
import { getSystemPrompt } from '../core/prompt-generator';

const PROMPT_FILE_NAME = 'system-prompt.md';

const getInitMessage = (projectId: string, promptFilePath: string): string => `
${chalk.green('✅ relaycode has been initialized for this project.')}

Configuration file created: ${chalk.cyan(CONFIG_FILE_NAME_JSON)}
Default system prompt created: ${chalk.cyan(promptFilePath)}

Project ID: ${chalk.cyan(projectId)}

${chalk.bold('Next steps:')}
${chalk.gray('1.')} (Optional) Open ${chalk.cyan(CONFIG_FILE_NAME_JSON)} to customize settings. The config is organized into sections:
   - In ${chalk.yellow("'watcher'")}, you can set ${chalk.yellow("'preferredStrategy'")} to control AI patch generation ('auto', 'standard-diff', 'search-replace', etc.).
   - In ${chalk.yellow("'git'")}, you can enable ${chalk.yellow("'git.autoGitBranch'")} to create a new branch for each transaction.
   - In ${chalk.yellow("'patch'")}, you can configure the linter, pre/post commands, and approval behavior.

${chalk.gray('2.')} (Optional) You can customize the AI instructions by editing ${chalk.cyan(promptFilePath)}.

${chalk.gray('3.')} Run ${chalk.magenta("'relay watch'")} in your terminal. It will automatically copy the system prompt to your clipboard.

${chalk.gray('4.')} Paste the system prompt into your AI assistant's "System Prompt" or "Custom Instructions".
`;


const updateGitignore = async (cwd: string): Promise<void> => {
  const gitignorePath = path.join(cwd, GITIGNORE_FILE_NAME);
  const entry = `\n${GITIGNORE_COMMENT}\n/${STATE_DIRECTORY_NAME}/\n`;

  try {
    const stats = await fs.stat(gitignorePath);
    if (stats.isDirectory()) {
      throw new Error('Path is a directory, not a file');
    }
    let content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes(STATE_DIRECTORY_NAME)) {
      content += entry;
      await fs.writeFile(gitignorePath, content);
      logger.info(`Updated ${chalk.cyan(GITIGNORE_FILE_NAME)} to ignore ${chalk.cyan(STATE_DIRECTORY_NAME)}/`);
    }
  } catch (error) {
    if (isEnoentError(error)) {
      await fs.writeFile(gitignorePath, entry.trim());
      logger.info(`Created ${chalk.cyan(GITIGNORE_FILE_NAME)} and added ${chalk.cyan(STATE_DIRECTORY_NAME)}/`);
    } else {
      logger.error(`Failed to update ${chalk.cyan(GITIGNORE_FILE_NAME)}: ${getErrorMessage(error)}`);
    }
  }
};

export const initCommand = async (cwd: string = process.cwd()): Promise<void> => {
  logger.info('Initializing relaycode in this project...');

  let config = await findConfig(cwd);
  let isNewProject = false;

  if (!config) {
    isNewProject = true;
    const projectId = await getProjectId(cwd);
    config = await createConfig(projectId, cwd);
    logger.success(`Created configuration file: ${chalk.cyan(CONFIG_FILE_NAME_JSON)}`);
  } else {
    logger.info(`Configuration file found. Verifying project setup...`);
  }

  const projectId = config.projectId;

  // Explicitly create the transaction directory so `log` command doesn't fail on a fresh init
  const stateDir = getStateDirectory(cwd);
  await fs.mkdir(path.join(stateDir, 'transaction'), { recursive: true });
  if (isNewProject) {
    logger.success(`Created state directory: ${STATE_DIRECTORY_NAME}/`);
  }

  // Create system prompt file if it doesn't exist
  const systemPrompt = getSystemPrompt(
    projectId,
    newConfig.watcher.preferredStrategy,
    newConfig.patch
  );
  const promptsDir = path.join(stateDir, 'prompts');
  await fs.mkdir(promptsDir, { recursive: true });
  const systemPromptPath = path.join(promptsDir, PROMPT_FILE_NAME);
  const relativePromptPath = path.join(STATE_DIRECTORY_NAME, 'prompts', PROMPT_FILE_NAME);
  
  let promptFileExists = false;
  try {
      await fs.access(systemPromptPath);
      promptFileExists = true;
  } catch (e) {
      // file doesn't exist
  }

  if (!promptFileExists) {
    const systemPrompt = getSystemPrompt(projectId, config.watcher.preferredStrategy, config.patch);
    await fs.writeFile(systemPromptPath, systemPrompt);
    logger.success(`Created default system prompt: ${chalk.cyan(relativePromptPath)}`);
  }

  await updateGitignore(cwd);

  if (isNewProject) {
      logger.log(getInitMessage(projectId, relativePromptPath));
  } else {
      logger.success('✅ Project setup verified. Your project is ready.');
      logger.info(`You can now run ${chalk.magenta("'relay watch'")}.`);
  }
};
