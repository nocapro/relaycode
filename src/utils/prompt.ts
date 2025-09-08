import { logger } from './logger';

export type Prompter = (question: string) => Promise<boolean>;

export const getConfirmation: Prompter = (question: string) => {
  return new Promise(resolve => {
    logger.prompt(question);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    const onData = (text: string) => {
      const cleanedText = text.trim().toLowerCase();
      if (cleanedText === 'y' || cleanedText === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    };
    process.stdin.on('data', onData);
  });
};

export const createConfirmationHandler = (options: { yes?: boolean } = {}, prompter?: Prompter): Prompter => {
  if (options.yes) {
    return () => Promise.resolve(true);
  }
  return prompter || getConfirmation;
};