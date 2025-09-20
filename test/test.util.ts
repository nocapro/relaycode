import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import type { Config, PatchStrategy } from 'relaycode-core';
import { CONFIG_FILE_NAME_JSON } from '../src/utils/constants';
import { logger } from '../src/utils/logger';
import { processPatch } from '../src/core/transaction';
import { parseLLMResponse } from 'relaycode-core';

export type Prompter = (message: string) => Promise<boolean>;
export interface TestDir {
  path: string;
  cleanup: () => Promise<void>;
}

export const setupTestDirectory = async (): Promise<TestDir> => {
  const testDirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'relaycode-test-'));

  const cleanup = async () => {
    await fs.rm(testDirPath, { recursive: true, force: true });
  };

  return { path: testDirPath, cleanup };
};

export interface E2ETestContext {
  testDir: TestDir;
  cleanup: () => Promise<void>;
}

export const setupE2ETest = async (options: { withTsconfig?: boolean } = {}): Promise<E2ETestContext> => {
  chalk.level = 0; // Disable colors for all tests

  const testDir = await setupTestDirectory();

  if (options.withTsconfig) {
    await createTestFile(testDir.path, 'tsconfig.json', JSON.stringify({
      "compilerOptions": { "strict": true, "noEmit": true, "isolatedModules": true },
      "include": ["src/**/*.ts"]
    }, null, 2));
  }

  // Suppress logger output
  const originalLogger = {
    info: (logger as any).info,
    log: (logger as any).log,
    warn: (logger as any).warn,
    error: (logger as any).error,
    success: (logger as any).success,
    prompt: (logger as any).prompt,
  };

  (logger as any).info = () => { };
  (logger as any).log = () => { };
  (logger as any).warn = () => { };
  (logger as any).error = () => { };
  if ((logger as any).success) (logger as any).success = () => { };
  if ((logger as any).prompt) (logger as any).prompt = () => { };


  const cleanup = async () => {
    // Restore logger
    (logger as any).info = originalLogger.info;
    (logger as any).log = originalLogger.log;
    (logger as any).warn = originalLogger.warn;
    (logger as any).error = originalLogger.error;
    if (originalLogger.success) (logger as any).success = originalLogger.success;
    if (originalLogger.prompt) (logger as any).prompt = originalLogger.prompt;

    // Give fs operations time to complete before cleanup
    await new Promise(resolve => setTimeout(resolve, 150));

    // Cleanup directory
    await testDir.cleanup();
  };

  return { testDir, cleanup };
};

export type TestOperation =
  | { type: 'edit' | 'new'; path: string; content?: string; strategy?: PatchStrategy }
  | { type: 'delete'; path: string }
  | { type: 'rename'; from: string; to: string };

export function createLLMResponseString(
  operations: TestOperation[],
  overrides: { uuid?: string, projectId?: string, reasoning?: string[], gitCommitMsg?: string } = {}
): { response: string, uuid: string } {
  const uuid = overrides.uuid ?? uuidv4();
  const projectId = overrides.projectId ?? 'test-project';
  const reasoning = overrides.reasoning ?? [LLM_RESPONSE_START];

  const blocks = operations.map(op => {
    if (op.type === 'delete') {
      return createDeleteFileBlock(op.path);
    }
    if (op.type === 'rename') {
      return createRenameFileBlock(op.from, op.to);
    }
    return createFileBlock(op.path, op.content ?? '', op.strategy);
  });

  const changeSummary = operations.map(op => {
    if (op.type === 'rename') {
      return { [op.type]: `${op.from} -> ${op.to}` };
    }
    return { [op.type]: op.path };
  });

  const response = [
    ...reasoning,
    ...blocks,
    LLM_RESPONSE_END(uuid, changeSummary, projectId, overrides.gitCommitMsg)
  ].join('\n');

  return { response, uuid };
}

export async function runProcessPatch(
  context: E2ETestContext,
  configOverrides: Record<string, any>,
  operations: TestOperation[],
  options: { prompter?: Prompter, responseOverrides?: { uuid?: string, projectId?: string, reasoning?: string[], gitCommitMsg?: string } } = {}
): Promise<{ uuid: string; config: Config }> {
  const config = await createTestConfig(context.testDir.path, configOverrides);

  const { response, uuid } = createLLMResponseString(operations, { ...options.responseOverrides, projectId: options.responseOverrides?.projectId ?? config.projectId });

  const parsedResponse = parseLLMResponse(response);
  if (!parsedResponse) {
    throw new Error("Failed to parse mock LLM response");
  }

  await processPatch(config, parsedResponse, { prompter: options.prompter, cwd: context.testDir.path });

  return { uuid, config };
}


// Helper function to deep merge objects
const deepMerge = (target: any, source: any): any => {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

export const createTestConfig = async (cwd: string, overrides: Record<string, any> = {}): Promise<Config> => {
  const defaultConfig: Config = {
    projectId: 'test-project',
    core: {
      logLevel: 'info',
      enableNotifications: false,
      watchConfig: true,
    },
    watcher: {
      clipboardPollInterval: 100,
      preferredStrategy: 'auto',
      enableBulkProcessing: false,
      bulkSize: 5,
      bulkTimeout: 30000,
    },
    patch: {
      approvalMode: 'auto',
      approvalOnErrorCount: 0,
      linter: `bun -e "process.exit(0)"`, // A command that always succeeds
      preCommand: '',
      postCommand: '',
      minFileChanges: 0,
    },
    git: {
      autoGitBranch: false,
      gitBranchPrefix: 'relay/',
      gitBranchTemplate: 'gitCommitMsg',
    },
  };

  // Handle legacy flat config overrides by mapping them to the new nested structure
  const normalizedOverrides: any = { ...overrides };

  // Map flat properties to nested structure for backward compatibility
  const flatToNestedMapping: Record<string, string> = {
    'approvalMode': 'patch.approvalMode',
    'approvalOnErrorCount': 'patch.approvalOnErrorCount',
    'linter': 'patch.linter',
    'preCommand': 'patch.preCommand',
    'postCommand': 'patch.postCommand',
    'clipboardPollInterval': 'watcher.clipboardPollInterval',
    'preferredStrategy': 'watcher.preferredStrategy',
    'logLevel': 'core.logLevel',
    'enableNotifications': 'core.enableNotifications',
    'watchConfig': 'core.watchConfig',
    'autoGitBranch': 'git.autoGitBranch',
    'gitBranchPrefix': 'git.gitBranchPrefix',
    'gitBranchTemplate': 'git.gitBranchTemplate',
  };

  for (const [flatKey, nestedPath] of Object.entries(flatToNestedMapping)) {
    if (flatKey in normalizedOverrides) {
      const value = normalizedOverrides[flatKey];
      delete normalizedOverrides[flatKey];

      const pathParts = nestedPath.split('.');
      let current: any = normalizedOverrides;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!part) continue;
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart) {
        current[lastPart] = value;
      }
    }
  }

  const config = deepMerge(defaultConfig, normalizedOverrides);
  await fs.writeFile(path.join(cwd, CONFIG_FILE_NAME_JSON), JSON.stringify(config, null, 2));
  return config;
};

export const createTestFile = async (cwd: string, filePath: string, content: string): Promise<void> => {
  const absolutePath = path.resolve(cwd, filePath);
  const dir = path.dirname(absolutePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, content);
};

export const LLM_RESPONSE_START = `
I have analyzed your request and here are the changes.
First, I will edit the main file.
`;

export const LLM_RESPONSE_END = (uuid: string, changeSummary: { [key: string]: string }[] = [], projectId: string = 'test-project', gitCommitMsg?: string) => {
  const yamlContent = [
    `projectId: ${projectId}`,
    `uuid: ${uuid}`,
    `changeSummary: ${JSON.stringify(changeSummary)}`
  ];
  
  if (gitCommitMsg) {
    // Support both oneliner and multi-line formats
    if (gitCommitMsg.includes('\n')) {
      // Multi-line format with >-
      yamlContent.push(`gitCommitMsg: >-`);
      const lines = gitCommitMsg.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        yamlContent.push(`  ${line}`);
      });
    } else {
      // Single line format
      yamlContent.push(`gitCommitMsg: "${gitCommitMsg}"`);
    }
  }
  
  return `
\`\`\`yaml
${yamlContent.join('\n')}
\`\`\`
`;
};

export const createFileBlock = (filePath: string, content: string, patchStrategy?: PatchStrategy): string => {
  const strategyString = patchStrategy ? ` ${patchStrategy}` : '';
  // Note: No newline after ${content} to avoid double newlines when content already has one.
  return `
\`\`\`typescript // ${filePath}${strategyString}
${content}\`\`\`
`;
};

export const createRenameFileBlock = (from: string, to: string): string => {
  const content = JSON.stringify({ from, to }, null, 2);
  return `
\`\`\`json // rename-file
${content}
\`\`\`
`;
};

export const createDeleteFileBlock = (filePath: string): string => {
  return `
\`\`\`typescript // ${filePath}
//TODO: delete this file
\`\`\`
`;
};
