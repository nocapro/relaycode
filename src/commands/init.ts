import { promises as fs } from 'fs';
import path from 'path';
import { findConfig, createConfig, getProjectId, getStateDirectory } from '../core/config';
import { logger, getErrorMessage, isEnoentError } from '../utils/logger';
import { STATE_DIRECTORY_NAME, GITIGNORE_FILE_NAME, GITIGNORE_COMMENT, CONFIG_FILE_NAME_JSON } from '../utils/constants';
import chalk from 'chalk';

const getInitMessage = (projectId: string): string => `
${chalk.green('✅ relaycode has been initialized for this project.')}

Configuration file created: ${chalk.cyan(CONFIG_FILE_NAME_JSON)}

Project ID: ${chalk.cyan(projectId)}

${chalk.bold('Next steps:')}
${chalk.gray('1.')} (Optional) Open ${chalk.cyan(CONFIG_FILE_NAME_JSON)} to customize settings. The config is organized into sections:
   - In ${chalk.yellow("'watcher'")}, you can set ${chalk.yellow("'preferredStrategy'")} to control AI patch generation ('auto', 'standard-diff', 'search-replace', etc.).
   - In ${chalk.yellow("'git'")}, you can enable ${chalk.yellow("'git.autoGitBranch'")} to create a new branch for each transaction.
   - In ${chalk.yellow("'patch'")}, you can configure the linter, pre/post commands, and approval behavior.

${chalk.gray('2.')} Run ${chalk.magenta("'relay watch'")} in your terminal. This will start the service and display the system prompt tailored to your configuration.

${chalk.gray('3.')} Copy the system prompt provided by ${chalk.magenta("'relay watch'")} and paste it into your AI assistant's "System Prompt" or "Custom Instructions".
`;


const updateGitignore = async (cwd: string): Promise<void> => {
  const gitignorePath = path.join(cwd, GITIGNORE_FILE_NAME);
  const entry = `\n${GITIGNORE_COMMENT}\n/${STATE_DIRECTORY_NAME}/\n`;

  try {
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

  const config = await findConfig(cwd);
  if (config) {
    logger.warn(`Configuration file already exists. Initialization skipped.`);
    logger.log(`
To use relaycode, please run ${chalk.magenta("'relay watch'")}.
It will display a system prompt to copy into your LLM assistant.
You can review your configuration in your existing config file.
`);
    return;
  }

  const projectId = await getProjectId(cwd);
  await createConfig(projectId, cwd);
  logger.success(`Created configuration file: ${chalk.cyan(CONFIG_FILE_NAME_JSON)}`);

  // Explicitly create the transaction directory so `log` command doesn't fail on a fresh init
  await fs.mkdir(path.join(getStateDirectory(cwd), 'transaction'), { recursive: true });
  logger.success(`Created state directory: ${STATE_DIRECTORY_NAME}/`);

  await updateGitignore(cwd);

  logger.log(getInitMessage(projectId));
};
