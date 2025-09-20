import { loadConfigOrExit } from '../core/config';
import { approveAllPendingTransactions } from '../core/transaction';
import { logger } from '../utils/logger';

export const approveAllCommand = async (options: { yes?: boolean } = {}, cwd: string = process.cwd()): Promise<void> => {
  const config = await loadConfigOrExit(cwd);
  logger.setLevel(config.core.logLevel);
  
  logger.info('Reviewing pending transactions...');
  await approveAllPendingTransactions(config, cwd, options.yes);
};