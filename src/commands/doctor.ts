import chalk from 'chalk';
import { logger } from '../utils/logger';
import { createConfirmationHandler, type Prompter } from '../utils/prompt';
import { executeShellCommand } from '../utils/shell';

interface DoctorOptions {
  fixPermissions?: boolean;
  path?: string;
  yes?: boolean;
}

const getUser = (): string => process.env.USER ?? '$USER';

const buildFixCommand = (targetPath: string, user: string): string => {
  return `sudo chown -R ${user}:${user} "${targetPath}"`;
};

export const doctorCommand = async (
  options: DoctorOptions = {},
  cwd: string = process.cwd(),
  prompter?: Prompter
): Promise<void> => {
  const targetPath = options.path ?? cwd;
  const user = getUser();
  const fixCommand = buildFixCommand(targetPath, user);

  logger.info(chalk.bold('relay doctor'));
  logger.info(`Target path: ${chalk.cyan(targetPath)}`);
  logger.info(`Suggested fix for permission issues:`);
  logger.info(chalk.magenta(fixCommand));

  if (!options.fixPermissions) {
    logger.info(`Run with ${chalk.cyan('--fix-permissions')} to apply this automatically.`);
    return;
  }

  const confirm = createConfirmationHandler({ yes: options.yes }, prompter);
  const approved = await confirm(`\nRun the permission fix command now? (y/N)`);
  if (!approved) {
    logger.info('Permission fix cancelled.');
    return;
  }

  logger.info(`Running: ${chalk.magenta(fixCommand)}`);
  const result = await executeShellCommand(fixCommand, cwd);
  if (result.exitCode !== 0) {
    logger.error(`Permission fix failed with exit code ${chalk.red(result.exitCode)}.`);
    if (result.stderr) logger.error(result.stderr);
    return;
  }

  logger.success('✅ Permissions updated successfully.');
};
