import { z } from 'zod';
import path from 'path';
import { promises as fs } from 'fs';
import { type Config, ConfigSchema } from 'relaycode-core';
import { CONFIG_FILE_NAMES, STATE_DIRECTORY_NAME, CONFIG_FILE_NAME_JSON } from '../utils/constants';
import { logger, isEnoentError } from '../utils/logger';
import chalk from 'chalk';

export const findConfigPath = async (cwd: string = process.cwd()): Promise<string | null> => {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.join(cwd, fileName);
    try {
      await fs.access(configPath);
      return configPath;
    } catch (error) {
      if (!isEnoentError(error)) {
        // ignore other errors for now to keep searching
      }
    }
  }
  return null;
};

export const findConfig = async (cwd: string = process.cwd()): Promise<Config | null> => {
  const configPath = await findConfigPath(cwd);
  if (!configPath) {
    return null;
  }
  try {
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const configJson = JSON.parse(fileContent);
    return ConfigSchema.parse(configJson);
  } catch (error) {
    if (isEnoentError(error)) {
      return null;
    }
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid configuration in ${path.basename(configPath)}: ${error.message}`);
    }
    throw error;
  }
};

export const loadConfigOrExit = async (cwd: string = process.cwd()): Promise<Config> => {
  const config = await findConfig(cwd);
  if (!config) {
    logger.error(`Configuration file ('${chalk.cyan(CONFIG_FILE_NAME_JSON)}') not found.`);
    logger.info(`Please run ${chalk.magenta("'relay init'")} to create one.`);
    process.exit(1);
  }
  return config;
};

const stateDirectoryCache = new Map<string, boolean>();

export const getStateDirectory = (cwd: string) => path.resolve(cwd, STATE_DIRECTORY_NAME);

export const ensureStateDirExists = async (cwd: string = process.cwd()): Promise<void> => {
  const stateDirPath = getStateDirectory(cwd);
  if (!stateDirectoryCache.has(stateDirPath)) {
    await fs.mkdir(stateDirPath, { recursive: true });
    stateDirectoryCache.set(stateDirPath, true);
  }
};

export const createConfig = async (projectId: string, cwd: string = process.cwd()): Promise<Config> => {

  const defaultConfig = ConfigSchema.parse({ projectId });

  const configContent = {
    $schema: "https://relay.noca.pro/schema.json",
    ...defaultConfig
  };

  const configPath = path.join(cwd, CONFIG_FILE_NAME_JSON);
  await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

  return configContent;
};

export const getProjectId = async (cwd: string = process.cwd()): Promise<string> => {
  try {
    const pkgJsonPath = path.join(cwd, 'package.json');
    const fileContent = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(fileContent);
    if (pkgJson.name && typeof pkgJson.name === 'string') {
      return pkgJson.name;
    }
  } catch (e) {
    // Ignore if package.json doesn't exist or is invalid
  }
  return path.basename(cwd);
};
