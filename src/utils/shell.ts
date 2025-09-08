import { spawn } from 'child_process';
import path from 'path';
import { logger } from './logger';
import { getTypeScriptErrorCount } from './typescript';

type ExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export const executeShellCommand = (command: string, cwd = process.cwd()): Promise<ExecutionResult> => {
  if (!command || command.trim() === '') {
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  }

  const normalizedCwd = path.resolve(cwd);

  return new Promise((resolve) => {
    logger.debug(`Executing command: ${command} in directory: ${normalizedCwd}`);
    
    const child = spawn(command, {
      cwd: normalizedCwd,
      shell: true, // Use shell to interpret the command (e.g., cmd.exe on Windows, /bin/sh on Linux)
      stdio: ['ignore', 'pipe', 'pipe'], // stdin, stdout, stderr
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.on('error', (err) => {
      // e.g., command not found
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
};

export const getErrorCount = async (linterCommand: string, cwd = process.cwd()): Promise<number> => {
  if (!linterCommand || linterCommand.trim() === '') {
    return 0;
  }
  
  if (linterCommand.includes('tsc')) {
    logger.debug('Detected tsc command, attempting to use TypeScript API for error counting.');
    try {
      const apiErrorCount = getTypeScriptErrorCount(linterCommand, cwd);
      if (apiErrorCount !== -1) {
        logger.debug(`TypeScript API returned ${apiErrorCount} errors.`);
        return apiErrorCount;
      }
    } catch (e) {
      logger.debug(`TypeScript API error counting threw an exception, falling back to shell execution. Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    logger.debug('TypeScript API error counting failed or was not applicable, falling back to shell execution.');
  }

  const { exitCode, stderr } = await executeShellCommand(linterCommand, cwd);
  if (exitCode === 0) return 0;

  // Try to extract a number of errors from stderr or assume 1 if non-zero exit code
  const errorMatches = stderr.match(/(\d+) error/i);
  if (errorMatches && errorMatches[1]) {
    return parseInt(errorMatches[1], 10);
  }
  // Assume at least one error if exit code is non-zero and we can't parse stderr.
  return 1;
};