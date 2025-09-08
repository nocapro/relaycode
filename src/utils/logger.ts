import chalk from 'chalk';
import { type LogLevelName } from 'relaycode-core';

const LogLevels = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

let currentLogLevel: LogLevelName = 'info'; // Default level

const logMessage = (level: keyof typeof LogLevels, message: string, colorFn?: (s: string) => string) => {
    if (LogLevels[level] <= LogLevels[currentLogLevel]) {
        console.log(colorFn ? colorFn(message) : message);
    }
}

export const logger = {
  setLevel: (level: LogLevelName) => {
    if (level in LogLevels) {
      currentLogLevel = level;
    }
  },
  info: (message: string) => logMessage('info', message, chalk.blue),
  success: (message: string) => logMessage('info', message, chalk.green),
  warn: (message: string) => logMessage('warn', message, chalk.yellow),
  error: (message: string) => logMessage('error', message, chalk.red),
  debug: (message: string) => logMessage('debug', message, chalk.gray),
  log: (message: string) => logMessage('info', message),
  prompt: (message: string) => {
    // Prompts are special and should be shown unless silent
        if (currentLogLevel !== 'silent') {
          console.log(chalk.cyan(message));
        }
      },
    };
    
    export const getErrorMessage = (error: unknown): string => {
        return error instanceof Error ? error.message : String(error);
    };
    
    export const isEnoentError = (error: unknown): boolean => {
        return error instanceof Error && 'code' in error && error.code === 'ENOENT';
    };