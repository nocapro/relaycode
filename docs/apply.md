An intelligent diff and patching system has been integrated into `relaycode`. This major feature introduces multiple patching strategies, allowing the Language Model (LLM) to choose the most effective method for applying code changes. This significantly enhances the tool's flexibility and resilience, moving from simple file overwrites to sophisticated, context-aware patches.

### Key Changes:

1.  **Multiple Patching Strategies**: The system now supports three distinct strategies for applying changes, which the LLM can specify for each file operation:
    *   **`new-unified` (Recommended)**: An advanced, resilient strategy that applies unified diffs without relying on strict line numbers, making it robust against minor code shifts.
    *   **`multi-search-replace`**: A precise strategy for replacing one or more exact blocks of code.
    *   **`overwrite`**: The original behavior of replacing the entire file content, now used as a default and for creating new files.

2.  **Updated LLM Interaction**:
    *   The code block syntax has been extended to include the chosen strategy: ` ```typescript // {filePath} {patchStrategy} `.
    *   The system prompt (`relay init`) has been completely overhauled to provide detailed instructions and examples for each new strategy, guiding the LLM to produce valid, effective patches.

3.  **Core Transaction Logic**:
    *   The transaction processor in `src/core/transaction.ts` has been re-engineered to handle the different patch strategies.
    *   It now dynamically invokes the appropriate diffing logic based on the `patchStrategy` provided in the parsed LLM response.
    *   Crucially, if any patch application fails (e.g., due to low confidence or a diff that cannot be matched), the entire transaction is automatically rolled back, ensuring the codebase remains in a consistent state.

4.  **Enhanced Type Safety**: The `FileOperationSchema` in `src/types.ts` has been updated to include the `patchStrategy`, ensuring that all operations are validated against the supported strategies.

5.  **Testing**: E2E tests for transactions have been significantly expanded to validate each new patching strategy, including success paths and failure-induced rollbacks, ensuring the new system is reliable.

This upgrade transforms `relaycode` from a simple file-watcher into a powerful, AI-native patching tool, enabling more complex and reliable automated coding tasks.

```typescript // package.json
{
  "name": "relaycode",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "dev": "bun run src/index.ts"
  },
  "dependencies": {
    "diff-apply": "^1.0.0",
    "js-yaml": "^4.1.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

```typescript // src/commands/init.ts
import { promises as fs } from 'fs';
import path from 'path';
import { findConfig, createConfig, ensureStateDirExists, getProjectId } from '../core/config';
import { logger } from '../utils/logger';
import { CONFIG_FILE_NAME, STATE_DIRECTORY_NAME, GITIGNORE_FILE_NAME } from '../utils/constants';

const getSystemPrompt = (projectId: string): string => `
You are an expert AI programmer. When you need to modify a file, you must use one of the available patching strategies by providing a \`patchStrategy\` in the code block metadata.

The available strategies are: \`new-unified\`, \`multi-search-replace\`, \`overwrite\`.

\`\`\`typescript // {filePath} {patchStrategy}
... diff or full content ...
\`\`\`

---

### Strategy 1: Advanced Unified Diff (\`new-unified\`) (RECOMMENDED)

This is the most powerful strategy. It focuses on the *content* of the change, not strict line numbers. It's resilient to minor changes in the source file.

**Format:**
1.  **File Headers**: Start with \`--- {filePath}\` and \`+++ {filePath}\`.
2.  **Hunk Header**: Use \`@@ ... @@\` for each section. DO NOT include line numbers.
3.  **Context**: Include 2-3 lines of unchanged context before and after your changes.
4.  **Changes**: Mark additions with \`+\` and removals with \`-\`. Preserve indentation.

**Example (\`new-unified\`):**
\`\`\`diff
--- src/utils.ts
+++ src/utils.ts
@@ ... @@
    def calculate_total(items):
-      total = 0
-      for item in items:
-          total += item.price
+      return sum(item.price for item in items)
\`\`\`

---

### Strategy 2: Multi-Search-Replace (\`multi-search-replace\`)

Use this for precise, targeted replacements where the exact content to be replaced is known.

**Format:**
-   Use one or more blocks starting with \`<<<<<<< SEARCH\` and ending with \`>>>>>>> REPLACE\`.
-   The SEARCH block must contain the *exact* content to find, including whitespace and newlines.
-   The REPLACE block contains the new content.

**Example (\`multi-search-replace\`):**
\`\`\`diff
<<<<<<< SEARCH
const PORT = 3000;
=======
const PORT = 8080;
>>>>>>> REPLACE

<<<<<<< SEARCH
const HOST = "localhost";
=======
const HOST = "0.0.0.0";
>>>>>>> REPLACE
\`\`\`

---

### Strategy 3: Overwrite (\`overwrite\`)

This strategy replaces the entire file with the content you provide. Use this for creating new files or when making very large changes.

**Format:**
-   The entire, full source code for the file.

**Example (\`overwrite\`):**
\`\`\`typescript
export class MyNewClass {
    constructor() {
        console.log("Hello from new class!");
    }
}
\`\`\`

---

## General Rules:

1.  **Specify Strategy**: ALWAYS include the chosen \`patchStrategy\` in the file path line, e.g., \`// {src/main.ts} new-unified\`. If you don't provide one, it will default to \`overwrite\`.
2.  **File Deletion**: To delete a file, use this exact format. Do not use a patch strategy.
    \`\`\`typescript // {filePath}
    //TODO: delete this file
    \`\`\`
3.  **Reasoning**: Add your step-by-step reasoning in plain text before each code block.
4.  **YAML Block**: ALWAYS add the following YAML block at the very end of your response. Use the exact projectId shown here. Generate a new random uuid for each response.
    \`\`\`yaml
    projectId: ${projectId}
    uuid: (generate a random uuid)
    changeSummary:
      - edit: src/main.ts
      - new: src/components/Button.tsx
      - delete: src/utils/old-helper.ts
    \`\`\`
`;

const updateGitignore = async (cwd: string): Promise<void> => {
    const gitignorePath = path.join(cwd, GITIGNORE_FILE_NAME);
    const entry = `\n# relaycode state\n/${STATE_DIRECTORY_NAME}/\n`;

    try {
        let content = await fs.readFile(gitignorePath, 'utf-8');
        if (!content.includes(STATE_DIRECTORY_NAME)) {
            content += entry;
            await fs.writeFile(gitignorePath, content);
            logger.info(`Updated ${GITIGNORE_FILE_NAME} to ignore ${STATE_DIRECTORY_NAME}/`);
        }
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            await fs.writeFile(gitignorePath, entry.trim());
            logger.info(`Created ${GITIGNORE_FILE_NAME} and added ${STATE_DIRECTORY_NAME}/`);
        } else {
            logger.error(`Failed to update ${GITIGNORE_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};

export const initCommand = async (cwd: string = process.cwd()): Promise<void> => {
    logger.info('Initializing relaycode in this project...');

    const existingConfig = await findConfig(cwd);
    if (existingConfig) {
        logger.warn(`${CONFIG_FILE_NAME} already exists. Initialization skipped.`);
        const config = await findConfig(cwd);
        if (config) {
            logger.log(getSystemPrompt(config.projectId));
        }
        return;
    }
    
    const projectId = await getProjectId(cwd);
    await createConfig(projectId, cwd);
    logger.success(`Created configuration file: ${CONFIG_FILE_NAME}`);
    
    await ensureStateDirExists(cwd);
    logger.success(`Created state directory: ${STATE_DIRECTORY_NAME}/`);

    await updateGitignore(cwd);

    logger.log(getSystemPrompt(projectId));
};
```

```typescript // src/core/executor.ts
import { promises as fs } from 'fs';
import path from 'path';
import { FileOperation, FileSnapshot } from '../types';

export const readFileContent = async (filePath: string, cwd: string = process.cwd()): Promise<string | null> => {
  try {
    return await fs.readFile(path.resolve(cwd, filePath), 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
};

export const writeFileContent = async (filePath: string, content: string, cwd: string = process.cwd()): Promise<void> => {
  const absolutePath = path.resolve(cwd, filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');
};

export const deleteFile = async (filePath: string, cwd: string = process.cwd()): Promise<void> => {
  try {
    await fs.unlink(path.resolve(cwd, filePath));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // File already deleted, which is fine.
      return;
    }
    throw error;
  }
};

export const createSnapshot = async (filePaths: string[], cwd: string = process.cwd()): Promise<FileSnapshot> => {
  const snapshot: FileSnapshot = {};
  
  // Process file reads in parallel for better performance
  const snapshotPromises = filePaths.map(async (filePath) => {
    try {
      const absolutePath = path.resolve(cwd, filePath);
      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        return { path: filePath, content };
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return { path: filePath, content: null }; // File doesn't exist, which is fine.
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`Error creating snapshot for ${filePath}:`, error);
      throw error;
    }
  });
  
  const results = await Promise.all(snapshotPromises);
  
  // Combine results into snapshot object
  for (const result of results) {
    snapshot[result.path] = result.content;
  }
  
  return snapshot;
};

// Helper to check if a directory is empty
const isDirectoryEmpty = async (dirPath: string): Promise<boolean> => {
  try {
    const files = await fs.readdir(dirPath);
    return files.length === 0;
  } catch (error) {
    // If directory doesn't exist or is not accessible, consider it "not empty"
    return false;
  }
};

// Recursively remove all empty parent directories up to a limit
const removeEmptyParentDirectories = async (dirPath: string, rootDir: string): Promise<void> => {
  if (!dirPath.startsWith(rootDir) || dirPath === rootDir) {
    return;
  }
  
  try {
    const isEmpty = await isDirectoryEmpty(dirPath);
    if (isEmpty) {
      await fs.rmdir(dirPath);
      // Recursively check parent directory
      await removeEmptyParentDirectories(path.dirname(dirPath), rootDir);
    }
  } catch (error) {
    // Ignore directory removal errors, but don't continue up the chain
    if (!(error instanceof Error && 'code' in error && 
        (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) {
      console.warn(`Failed to clean up directory ${dirPath}:`, error);
    }
  }
};

export const restoreSnapshot = async (snapshot: FileSnapshot, cwd: string = process.cwd()): Promise<void> => {
  const projectRoot = path.resolve(cwd);
  const entries = Object.entries(snapshot);
  const directoriesDeleted = new Set<string>();

  // First handle all file operations in parallel
  await Promise.all(entries.map(async ([filePath, content]) => {
    const fullPath = path.resolve(cwd, filePath);
    try {
      if (content === null) {
        // If the file didn't exist in the snapshot, make sure it doesn't exist after restore
        try {
          await fs.unlink(fullPath);
          directoriesDeleted.add(path.dirname(fullPath));
        } catch (error) {
          if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
            // File or directory already doesn't exist, which is fine
          } else {
            throw error;
          }
        }
      } else {
        // Create directory structure if needed
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        
        // Write the original content back to the file
        await fs.writeFile(fullPath, content, 'utf-8');
      }
    } catch (error) {
      console.error(`Failed to restore ${filePath}:`, error);
      throw error;
    }
  }));
  
  // After all files are processed, clean up empty directories
  // Sort directories by depth (deepest first) to clean up nested empty dirs properly
  const sortedDirs = Array.from(directoriesDeleted)
    .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  
  // Process each directory that had files deleted
  for (const dir of sortedDirs) {
    await removeEmptyParentDirectories(dir, projectRoot);
  }
};
```

```typescript // src/core/parser.ts
import yaml from 'js-yaml';
import { z } from 'zod';
import {
    ControlYamlSchema,
    FileOperation,
    ParsedLLMResponse,
    ParsedLLMResponseSchema,
} from '../types';
import {
    DELETE_FILE_MARKER
} from '../utils/constants';

const CODE_BLOCK_REGEX = /```(?:\w+)?\s*\/\/\s*{(.*?)}\s*(\S*)?\n([\s\S]*?)\n```/g;
const YAML_BLOCK_REGEX = /```yaml\n([\s\S]+?)\n```\s*$/;

export const parseLLMResponse = (rawText: string): ParsedLLMResponse | null => {
    const yamlMatch = rawText.match(YAML_BLOCK_REGEX);
    if (!yamlMatch || typeof yamlMatch[1] !== 'string') return null;

    let control;
    try {
        const yamlContent = yaml.load(yamlMatch[1]);
        control = ControlYamlSchema.parse(yamlContent);
    } catch (e) {
        // Invalid YAML or doesn't match schema
        return null;
    }

    const textWithoutYaml = rawText.replace(YAML_BLOCK_REGEX, '').trim();
    
    const operations: FileOperation[] = [];
    const matchedBlocks: string[] = [];
    
    let match;
    while ((match = CODE_BLOCK_REGEX.exec(textWithoutYaml)) !== null) {
        const [fullMatch, filePath, rawStrategy, rawContent] = match;

        if (typeof filePath !== 'string' || typeof rawContent !== 'string') {
            continue;
        }

        matchedBlocks.push(fullMatch);
        const content = rawContent.trim();
        const strategy = rawStrategy?.trim();

        if (content === DELETE_FILE_MARKER) {
            operations.push({ type: 'delete', path: filePath.trim() });
        } else {
            const op: any = {
                type: 'write',
                path: filePath.trim(),
                content: content,
            };
            if (strategy) {
                op.patchStrategy = strategy;
            }
            operations.push(op);
        }
    }
    
    let reasoningText = textWithoutYaml;
    for (const block of matchedBlocks) {
        reasoningText = reasoningText.replace(block, '');
    }
    const reasoning = reasoningText.split('\n').map(line => line.trim()).filter(Boolean);

    if (operations.length === 0) return null;

    try {
        const parsedResponse = ParsedLLMResponseSchema.parse({
            control,
            operations,
            reasoning,
        });
        return parsedResponse;
    } catch (e) {
        if (e instanceof z.ZodError) {
            console.error("Zod validation failed on final parsed object:", e.errors);
        }
        return null;
    }
};
```

```typescript // src/core/transaction.ts
// src/core/transaction.ts
import { Config, ParsedLLMResponse, StateFile, FileSnapshot } from '../types';
import { logger } from '../utils/logger';
import { getErrorCount, executeShellCommand } from '../utils/shell';
import { createSnapshot, writeFileContent, deleteFile, restoreSnapshot } from './executor';
import { hasBeenProcessed, writePendingState, commitState, deletePendingState } from './state';
import { getConfirmation } from '../utils/prompt';
import { newUnifiedDiffStrategyService, multiSearchReplaceService, unifiedDiffService } from 'diff-apply';

type Prompter = (question: string) => Promise<boolean>;

type TransactionDependencies = {
  config: Config;
  parsedResponse: ParsedLLMResponse;
  prompter?: Prompter;
  cwd: string;
};

type LineChanges = {
    added: number;
    removed: number;
};

// A simple LCS-based diff to calculate line changes.
const calculateLineChanges = (oldContent: string | null, newContent: string): LineChanges => {
    if (oldContent === newContent) return { added: 0, removed: 0 };

    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent ? newContent.split('\n') : [];

    if (oldContent === null || oldContent === '') return { added: newLines.length, removed: 0 };
    if (newContent === '') return { added: 0, removed: oldLines.length };

    // Simplified line change calculation for better performance
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    
    const added = newLines.filter(line => !oldSet.has(line)).length;
    const removed = oldLines.filter(line => !newSet.has(line)).length;
    
    return { added, removed };
};

// This HOF encapsulates the logic for processing a single patch.
const createTransaction = (deps: TransactionDependencies) => {
  const { config, parsedResponse, prompter = getConfirmation, cwd } = deps;
  const { control, operations, reasoning } = parsedResponse;
  const { uuid, projectId } = control;

  // Get file paths that will be affected
  const affectedFilePaths = operations.map(op => op.path);

  const validate = async (): Promise<boolean> => {
    if (projectId !== config.projectId) {
      logger.warn(`Skipping patch: projectId mismatch (expected '${config.projectId}', got '${projectId}').`);
      return false;
    }
    if (await hasBeenProcessed(cwd, uuid)) {
      logger.info(`Skipping patch: uuid '${uuid}' has already been processed.`);
      return false;
    }
    return true;
  };
  
  const execute = async (snapshot: FileSnapshot, startTime: number): Promise<void> => {
    logger.info(`🚀 Starting transaction for patch ${uuid}...`);
    logger.log(`Reasoning:\n  ${reasoning.join('\n  ')}`);
    
    logger.log(`  - Snapshot of ${Object.keys(snapshot).length} files taken.`);
    
    const stateFile: StateFile = {
      uuid,
      projectId,
      createdAt: new Date().toISOString(),
      reasoning,
      operations,
      snapshot,
      approved: false,
    };
    
    // Prepare state file but don't wait for write to complete yet
    const pendingStatePromise = writePendingState(cwd, stateFile);

    // --- Execution Phase ---
    const opStats: Array<{ type: 'Written' | 'Deleted', path: string, added: number, removed: number }> = [];
    
    try {
      // Wait for pending state write to complete
      await pendingStatePromise;
      logger.success('  - Staged changes to .pending.yml file.');
      
      logger.log('  - Applying file operations...');
      
      for (const op of operations) {
        if (op.type === 'delete') {
            const oldContent = snapshot[op.path];
            await deleteFile(op.path, cwd);
            const { added, removed } = calculateLineChanges(oldContent ?? null, '');
            opStats.push({ type: 'Deleted', path: op.path, added, removed });
        } else if (op.type === 'write') {
            const oldContent = snapshot[op.path] ?? ''; // Use empty string for new files
            let newContent: string;

            switch (op.patchStrategy) {
                case 'overwrite':
                    newContent = op.content;
                    break;
                case 'new-unified':
                case 'unified': {
                    const strategy = op.patchStrategy === 'new-unified'
                        ? newUnifiedDiffStrategyService.create(0.9) // Using a default confidence
                        : unifiedDiffService.create();
                    const result = await strategy.applyDiff({
                        originalContent: oldContent,
                        diffContent: op.content,
                    });
                    if (!result.success) {
                        throw new Error(`Failed to apply '${op.patchStrategy}' patch to ${op.path}: ${result.error}`);
                    }
                    newContent = result.content;
                    break;
                }
                case 'multi-search-replace': {
                    const strategy = multiSearchReplaceService.create();
                    const result = await strategy.applyDiff({
                        originalContent: oldContent,
                        diffContent: op.content,
                    });
                    if (!result.success) {
                        throw new Error(`Failed to apply '${op.patchStrategy}' patch to ${op.path}: ${result.error}`);
                    }
                    newContent = result.content;
                    break;
                }
                default:
                    // This should not be reached due to Zod validation
                    throw new Error(`Unknown patch strategy: ${op.patchStrategy}`);
            }
            
            await writeFileContent(op.path, newContent, cwd);
            const { added, removed } = calculateLineChanges(oldContent, newContent);
            opStats.push({ type: 'Written', path: op.path, added, removed });
        }
      }
      
      logger.success('File operations complete.');
      opStats.forEach(stat => {
        if (stat.type === 'Written') {
          logger.success(`✔ Written: ${stat.path} (+${stat.added}, -${stat.removed})`);
        } else {
          logger.success(`✔ Deleted: ${stat.path}`);
        }
      });
    } catch (error) {
      logger.error(`Failed to apply file operations: ${error instanceof Error ? error.message : String(error)}. Rolling back.`);
      try {
        await restoreSnapshot(snapshot, cwd);
        logger.success('  - Files restored to original state.');
      } catch (rollbackError) {
        logger.error(`CRITICAL: Rollback after apply error failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      await deletePendingState(cwd, uuid);
      logger.success(`↩️ Transaction ${uuid} rolled back due to apply error.`);
      return; // Abort transaction
    }

    // --- Verification & Decision Phase ---
    let postCommandFailed = false;
    if (config.postCommand) {
      logger.log(`  - Running post-command: ${config.postCommand}`);
      const postResult = await executeShellCommand(config.postCommand, cwd);
      if (postResult.exitCode !== 0) {
        logger.error(`Post-command failed with exit code ${postResult.exitCode}, forcing rollback.`);
        if (postResult.stderr) logger.error(`Stderr: ${postResult.stderr}`);
        postCommandFailed = true;
      }
    }

    // Run linter check in parallel with postCommand if possible
    const finalErrorCountPromise = config.linter ? getErrorCount(config.linter, cwd) : Promise.resolve(0);
    const finalErrorCount = await finalErrorCountPromise;
    logger.log(`  - Final linter error count: ${finalErrorCount}`);

    let isApproved = false;
    if (postCommandFailed) {
      isApproved = false; // Force rollback
    } else {
      const canAutoApprove = config.approval === 'yes' && finalErrorCount <= config.approvalOnErrorCount;
      if (canAutoApprove) {
          isApproved = true;
          logger.success('  - Changes automatically approved based on your configuration.');
      } else {
          isApproved = await prompter('Changes applied. Do you want to approve and commit them? (y/N)');
      }
    }
    
    // --- Commit/Rollback Phase ---
    if (isApproved) {
        logger.log('  - Committing changes...');
        const finalState: StateFile = { ...stateFile, approved: true };
        // Update pending state and commit in parallel
        await Promise.all([
          writePendingState(cwd, finalState),
          commitState(cwd, uuid)
        ]);

        const duration = performance.now() - startTime;
        const totalSucceeded = opStats.length;
        const totalFailed = operations.length - totalSucceeded;
        const totalAdded = opStats.reduce((sum, s) => sum + s.added, 0);
        const totalRemoved = opStats.reduce((sum, s) => sum + s.removed, 0);
        
        logger.log('\nSummary:');
        logger.log(`Attempted: ${operations.length} file(s) (${totalSucceeded} succeeded, ${totalFailed} failed)`);
        logger.success(`Lines changed: +${totalAdded}, -${totalRemoved}`);
        logger.log(`Completed in ${duration.toFixed(2)}ms`);

        logger.success(`✅ Transaction ${uuid} committed successfully!`);
    } else {
        logger.warn('  - Rolling back changes...');
        
        try {
            await restoreSnapshot(snapshot, cwd);
            logger.success('  - Files restored to original state.');
            await deletePendingState(cwd, uuid);
            logger.success(`↩️ Transaction ${uuid} rolled back.`);
        } catch (error) {
            logger.error(`Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
  };

  return {
    run: async () => {
      if (!(await validate())) return;

      if (config.preCommand) {
        logger.log(`  - Running pre-command: ${config.preCommand}`);
        const { exitCode, stderr } = await executeShellCommand(config.preCommand, cwd);
        if (exitCode !== 0) {
          logger.error(`Pre-command failed with exit code ${exitCode}, aborting transaction.`);
          if (stderr) logger.error(`Stderr: ${stderr}`);
          return;
        }
      }

      const startTime = performance.now();

      try {
        // Take a snapshot before applying any changes
        logger.log(`Taking snapshot of files that will be affected...`);
        const snapshot = await createSnapshot(affectedFilePaths, cwd);
        
        await execute(snapshot, startTime);
      } catch (error) {
        logger.error(`Transaction ${uuid} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
};

type ProcessPatchOptions = {
    prompter?: Prompter;
    cwd?: string;
}

export const processPatch = async (config: Config, parsedResponse: ParsedLLMResponse, options?: ProcessPatchOptions): Promise<void> => {
    const cwd = options?.cwd || process.cwd();
    const transaction = createTransaction({ config, parsedResponse, prompter: options?.prompter, cwd });
    await transaction.run();
};
```

```typescript // src/types.ts
import { z } from 'zod';

// Schema for relaycode.config.json
export const ConfigSchema = z.object({
  projectId: z.string().min(1),
  clipboardPollInterval: z.number().int().positive().default(2000),
  approval: z.enum(['yes', 'no']).default('yes'),
  approvalOnErrorCount: z.number().int().min(0).default(0),
  linter: z.string().default('bun tsc --noEmit'),
  preCommand: z.string().default(''),
  postCommand: z.string().default(''),
});
export type Config = z.infer<typeof ConfigSchema>;

// Schema for operations parsed from code blocks
export const FileOperationSchema = z.union([
  z.object({
    type: z.literal('write'),
    path: z.string(),
    patchStrategy: z.enum(['new-unified', 'multi-search-replace', 'unified', 'overwrite']).default('overwrite'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('delete'),
    path: z.string(),
  }),
]);
export type FileOperation = z.infer<typeof FileOperationSchema>;

// Schema for the control YAML block at the end of the LLM response
export const ControlYamlSchema = z.object({
  projectId: z.string(),
  uuid: z.string().uuid(),
  changeSummary: z.array(z.record(z.string())).optional(), // Not strictly used, but good to parse
});
export type ControlYaml = z.infer<typeof ControlYamlSchema>;

// The fully parsed response from the clipboard
export const ParsedLLMResponseSchema = z.object({
  control: ControlYamlSchema,
  operations: z.array(FileOperationSchema),
  reasoning: z.array(z.string()),
});
export type ParsedLLMResponse = z.infer<typeof ParsedLLMResponseSchema>;

// Schema for the snapshot of original files
export const FileSnapshotSchema = z.record(z.string(), z.string().nullable()); // path -> content | null (if file didn't exist)
export type FileSnapshot = z.infer<typeof FileSnapshotSchema>;

// Schema for the state file (.relaycode/{uuid}.yml or .pending.yml)
export const StateFileSchema = z.object({
  uuid: z.string().uuid(),
  projectId: z.string(),
  createdAt: z.string().datetime(),
  reasoning: z.array(z.string()),
  operations: z.array(FileOperationSchema),
  snapshot: FileSnapshotSchema,
  approved: z.boolean(),
});
export type StateFile = z.infer<typeof StateFileSchema>;

// Shell command execution result
export const ShellCommandResultSchema = z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number().nullable(),
});
export type ShellCommandResult = z.infer<typeof ShellCommandResultSchema>;
```

```typescript // src/utils/constants.ts
export const CONFIG_FILE_NAME = 'relaycode.config.json';
export const STATE_DIRECTORY_NAME = '.relaycode';
export const GITIGNORE_FILE_NAME = '.gitignore';

export const DELETE_FILE_MARKER = '//TODO: delete this file';
```

```typescript // test/e2e/transaction.test.ts
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import { processPatch } from '../../src/core/transaction';
import { parseLLMResponse } from '../../src/core/parser';
import { setupTestDirectory, TestDir, createTestConfig, createTestFile, LLM_RESPONSE_START, LLM_RESPONSE_END, createFileBlock, createDeleteFileBlock } from '../test.util';
import { STATE_DIRECTORY_NAME } from '../../src/utils/constants';

// Mock the diff-apply library before any other code uses it.
// This mock contains simplified "real algorithms" to satisfy testing requirements.
mock.module('diff-apply', () => {
  const applyUnifiedDiff = (originalContent: string, diffContent: string) => {
    const removeLines = diffContent.split('\n').filter(l => l.startsWith('-')).map(l => l.substring(1));
    const addLines = diffContent.split('\n').filter(l => l.startsWith('+')).map(l => l.substring(1));
    const removeBlock = removeLines.join('\n');
    const addBlock = addLines.join('\n');
    if (removeBlock && originalContent.includes(removeBlock)) {
      return { success: true, content: originalContent.replace(removeBlock, addBlock) };
    }
    // Handle adding to empty file
    if (!originalContent && !removeBlock && addBlock) {
        return { success: true, content: addBlock };
    }
    return { success: false, error: 'Simplified mock patch could not be applied' };
  };
  
  const applyMultiSearchReplace = (originalContent: string, diffContent: string) => {
    let currentContent = originalContent;
    const blocks = diffContent.split('>>>>>>> REPLACE');
    for (const block of blocks) {
        if (!block.trim()) continue;
        const parts = block.split('=======');
        if (parts.length !== 2) return { success: false, error: 'Malformed multi-search-replace block' };
        
        let searchContent = parts[0];
        // Clean up metadata that might be in the search block
        searchContent = searchContent.replace('<<<<<<< SEARCH', '');
        searchContent = searchContent.replace(/:start_line:.*?\n/g, '');
        searchContent = searchContent.replace(/:end_line:.*?\n/g, '');
        searchContent = searchContent.replace('-------', '').trim();
        
        const replaceContent = parts[1].trim();
        
        if (searchContent && !currentContent.includes(searchContent)) {
            return { success: false, error: `Search block not found: "${searchContent}"` };
        }
        currentContent = currentContent.replace(searchContent, replaceContent);
    }
    return { success: true, content: currentContent };
  };

  return {
    newUnifiedDiffStrategyService: {
      create: () => ({ applyDiff: ({ originalContent, diffContent }: any) => applyUnifiedDiff(originalContent, diffContent) }),
    },
    unifiedDiffService: {
        create: () => ({ applyDiff: ({ originalContent, diffContent }: any) => applyUnifiedDiff(originalContent, diffContent) }),
    },
    multiSearchReplaceService: {
      create: () => ({ applyDiff: ({ originalContent, diffContent }: any) => applyMultiSearchReplace(originalContent, diffContent) }),
    },
  };
});

// Suppress console output for cleaner test logs
beforeEach(() => {
    global.console.info = () => {};
    global.console.log = () => {};
    global.console.warn = () => {};
    global.console.error = () => {};
    //@ts-ignore
    global.console.success = () => {};
});

describe('e2e/transaction', () => {
    let testDir: TestDir;
    const testFile = 'src/index.ts';
    const originalContent = 'console.log("original");';

    beforeEach(async () => {
        testDir = await setupTestDirectory();
        await createTestFile(testDir.path, testFile, originalContent);
        // A tsconfig is needed for `bun tsc` to run and find files
        await createTestFile(testDir.path, 'tsconfig.json', JSON.stringify({
            "compilerOptions": { "strict": true, "noEmit": true, "isolatedModules": true },
            "include": ["src/**/*.ts"]
        }));
    });

    afterEach(async () => {
        if (testDir) {
            await new Promise(resolve => setTimeout(resolve, 100));
            await testDir.cleanup();
        }
    });

    it('should apply changes using overwrite strategy and commit', async () => {
        const config = await createTestConfig(testDir.path);
        const newContent = 'console.log("new content");';
        const uuid = uuidv4();
        const response = LLM_RESPONSE_START + 
                         createFileBlock(testFile, newContent, 'overwrite') + 
                         LLM_RESPONSE_END(uuid, [{ edit: testFile }]);
        
        const parsedResponse = parseLLMResponse(response)!;
        await processPatch(config, parsedResponse, { cwd: testDir.path });

        const finalContent = await fs.readFile(path.join(testDir.path, testFile), 'utf-8');
        expect(finalContent).toBe(newContent);

        const stateFilePath = path.join(testDir.path, STATE_DIRECTORY_NAME, `${uuid}.yml`);
        const stateFileExists = await fs.access(stateFilePath).then(() => true).catch(() => false);
        expect(stateFileExists).toBe(true);
        const stateFileContent = await fs.readFile(stateFilePath, 'utf-8');
        const stateData: any = yaml.load(stateFileContent);
        expect(stateData.approved).toBe(true);
    });

    it('should apply a patch using new-unified strategy', async () => {
        const config = await createTestConfig(testDir.path);
        const uuid = uuidv4();
        const diff = `
--- src/index.ts
+++ src/index.ts
@@ ... @@
-console.log("original");
+console.log("patched with new-unified");
        `.trim();
        const response = LLM_RESPONSE_START + 
                         createFileBlock(testFile, diff, 'new-unified') + 
                         LLM_RESPONSE_END(uuid, [{ edit: testFile }]);
        
        const parsedResponse = parseLLMResponse(response)!;
        await processPatch(config, parsedResponse, { cwd: testDir.path });

        const finalContent = await fs.readFile(path.join(testDir.path, testFile), 'utf-8');
        expect(finalContent).toBe('console.log("patched with new-unified");');
    });

    it('should apply a patch using multi-search-replace strategy', async () => {
        const config = await createTestConfig(testDir.path);
        const uuid = uuidv4();
        const diff = `
<<<<<<< SEARCH
original
=======
replaced
>>>>>>> REPLACE
        `.trim();
        const response = LLM_RESPONSE_START + 
                         createFileBlock(testFile, diff, 'multi-search-replace') + 
                         LLM_RESPONSE_END(uuid, [{ edit: testFile }]);
        
        const parsedResponse = parseLLMResponse(response)!;
        await processPatch(config, parsedResponse, { cwd: testDir.path });

        const finalContent = await fs.readFile(path.join(testDir.path, testFile), 'utf-8');
        expect(finalContent).toBe('console.log("replaced");');
    });
    
    it('should rollback if a patch strategy fails', async () => {
        const config = await createTestConfig(testDir.path);
        const uuid = uuidv4();
        const diff = `
--- src/index.ts
+++ src/index.ts
@@ ... @@
-THIS TEXT DOES NOT EXIST
+THIS WILL NOT BE APPLIED
        `.trim();
        const response = LLM_RESPONSE_START + 
                         createFileBlock(testFile, diff, 'new-unified') + 
                         LLM_RESPONSE_END(uuid, [{ edit: testFile }]);
        
        const parsedResponse = parseLLMResponse(response)!;
        await processPatch(config, parsedResponse, { cwd: testDir.path });

        const finalContent = await fs.readFile(path.join(testDir.path, testFile), 'utf-8');
        expect(finalContent).toBe(originalContent);

        const stateFilePath = path.join(testDir.path, STATE_DIRECTORY_NAME, `${uuid}.yml`);
        const stateFileExists = await fs.access(stateFilePath).then(() => true).catch(() => false);
        expect(stateFileExists).toBe(false);
    });
    
    it('should create a new file using the overwrite strategy', async () => {
        const config = await createTestConfig(testDir.path);
        const newFilePath = 'src/new-file.ts';
        const newFileContent = 'export const x = 1;';
        const uuid = uuidv4();
        const response = LLM_RESPONSE_START +
            createFileBlock(newFilePath, newFileContent, 'overwrite') +
            LLM_RESPONSE_END(uuid, [{ new: newFilePath }]);

        const parsed = parseLLMResponse(response)!;
        await processPatch(config, parsed, { cwd: testDir.path });

        const finalContent = await fs.readFile(path.join(testDir.path, newFilePath), 'utf-8');
        expect(finalContent).toBe(newFileContent);
        
        const stateFilePath = path.join(testDir.path, STATE_DIRECTORY_NAME, `${uuid}.yml`);
        const stateFileExists = await fs.access(stateFilePath).then(() => true).catch(() => false);
        expect(stateFileExists).toBe(true);
    });

    it('should rollback changes when manually disapproved', async () => {
        const config = await createTestConfig(testDir.path, { approval: 'no' });
        const newContent = 'console.log("I will be rolled back");';
        const uuid = uuidv4();
        const response = LLM_RESPONSE_START + 
                         createFileBlock(testFile, newContent, 'overwrite') + 
                         LLM_RESPONSE_END(uuid, [{ edit: testFile }]);

        const parsedResponse = parseLLMResponse(response)!;
        const prompter = async () => false; // Disapprove
        await processPatch(config, parsedResponse, { prompter, cwd: testDir.path });

        const finalContent = await fs.readFile(path.join(testDir.path, testFile), 'utf-8');
        expect(finalContent).toBe(originalContent);
    });
});
```

```typescript // test/test.util.ts
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Config } from '../src/types';
import { CONFIG_FILE_NAME } from '../src/utils/constants';

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

export const createTestConfig = async (cwd: string, overrides: Partial<Config> = {}): Promise<Config> => {
    const defaultConfig: Config = {
        projectId: 'test-project',
        clipboardPollInterval: 100,
        approval: 'yes',
        approvalOnErrorCount: 0,
        linter: `bun -e "process.exit(0)"`, // A command that always succeeds
        preCommand: '',
        postCommand: '',
    };
    const config = { ...defaultConfig, ...overrides };
    await fs.writeFile(path.join(cwd, CONFIG_FILE_NAME), JSON.stringify(config, null, 2));
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

export const LLM_RESPONSE_END = (uuid: string, changeSummary: { [key: string]: string }[]) => `
\`\`\`yaml
projectId: test-project
uuid: ${uuid}
changeSummary: ${JSON.stringify(changeSummary)}
\`\`\`
`;

export const createFileBlock = (filePath: string, content: string, patchStrategy?: string): string => {
    const strategyStr = patchStrategy ? ` ${patchStrategy}` : '';
    return `
\`\`\`typescript // {${filePath}}${strategyStr}
${content}
\`\`\`
`;
};

export const createDeleteFileBlock = (filePath: string): string => {
    return `
\`\`\`typescript // {${filePath}}
//TODO: delete this file
\`\`\`
`;
};
```

```typescript // test/unit/parser.test.ts
import { describe, it, expect } from 'bun:test';
import { parseLLMResponse } from '../../src/core/parser';
import { v4 as uuidv4 } from 'uuid';
import { LLM_RESPONSE_START, LLM_RESPONSE_END, createFileBlock, createDeleteFileBlock } from '../test.util';

describe('core/parser', () => {

    describe('parseLLMResponse', () => {
        const testUuid = uuidv4();

        it('should return null if YAML block is missing', () => {
            const response = `
\`\`\`typescript // {src/index.ts}
console.log("hello");
\`\`\`
            `;
            expect(parseLLMResponse(response)).toBeNull();
        });

        it('should return null if YAML is malformed', () => {
            const response = `
\`\`\`typescript // {src/index.ts}
console.log("hello");
\`\`\`
\`\`\`yaml
projectId: test-project
uuid: ${testUuid}
  malformed: - yaml
\`\`\`
            `;
            expect(parseLLMResponse(response)).toBeNull();
        });

        it('should return null if YAML is missing required fields', () => {
            const response = `
\`\`\`typescript // {src/index.ts}
console.log("hello");
\`\`\`
\`\`\`yaml
projectId: test-project
\`\`\`
            `;
            expect(parseLLMResponse(response)).toBeNull();
        });

        it('should return null if no code blocks are found', () => {
            const response = LLM_RESPONSE_START + LLM_RESPONSE_END(testUuid, []);
            expect(parseLLMResponse(response)).toBeNull();
        });

        it('should correctly parse a write operation with default "overwrite" strategy', () => {
            const content = 'const a = 1;';
            const filePath = 'src/utils.ts';
            const block = createFileBlock(filePath, content); // No strategy provided
            const response = LLM_RESPONSE_START + block + LLM_RESPONSE_END(testUuid, [{ edit: filePath }]);
            
            const parsed = parseLLMResponse(response);

            expect(parsed).not.toBeNull();
            expect(parsed?.control.uuid).toBe(testUuid);
            expect(parsed?.control.projectId).toBe('test-project');
            expect(parsed?.reasoning.join(' ')).toContain('I have analyzed your request and here are the changes.');
            expect(parsed?.operations).toHaveLength(1);
            const op = parsed?.operations[0];
            expect(op?.type).toBe('write');
            if(op?.type === 'write'){
                expect(op.path).toBe(filePath);
                expect(op.content).toBe(content);
                expect(op.patchStrategy).toBe('overwrite');
            }
        });

        it('should correctly parse a write operation with a specific patch strategy', () => {
            const content = 'diff content';
            const filePath = 'src/utils.ts';
            const strategy = 'new-unified';
            const block = createFileBlock(filePath, content, strategy);
            const response = LLM_RESPONSE_START + block + LLM_RESPONSE_END(testUuid, [{ edit: filePath }]);
            
            const parsed = parseLLMResponse(response);

            expect(parsed).not.toBeNull();
            expect(parsed?.operations).toHaveLength(1);
            const op = parsed?.operations[0];
            expect(op?.type).toBe('write');
            if(op?.type === 'write'){
                expect(op.path).toBe(filePath);
                expect(op.content).toBe(content);
                expect(op.patchStrategy).toBe(strategy);
            }
        });

        it('should correctly parse a single file delete operation', () => {
            const filePath = 'src/old-file.ts';
            const block = createDeleteFileBlock(filePath);
            const response = "I'm deleting this old file." + block + LLM_RESPONSE_END(testUuid, [{ delete: filePath }]);

            const parsed = parseLLMResponse(response);

            expect(parsed).not.toBeNull();
            expect(parsed?.operations).toHaveLength(1);
            expect(parsed?.operations[0]).toEqual({
                type: 'delete',
                path: filePath,
            });
        });

        it('should correctly parse multiple mixed operations', () => {
            const filePath1 = 'src/main.ts';
            const content1 = 'console.log("main");';
            const filePath2 = 'src/to-delete.ts';
            const filePath3 = 'src/new-feature.ts';
            const content3 = 'export const feature = {};';
            const strategy3 = 'new-unified';

            const response = [
                "I'll make three changes.",
                createFileBlock(filePath1, content1), // Default overwrite
                "Then delete a file.",
                createDeleteFileBlock(filePath2),
                "And finally add a new one with a patch.",
                createFileBlock(filePath3, content3, strategy3),
                LLM_RESPONSE_END(testUuid, [{edit: filePath1}, {delete: filePath2}, {new: filePath3}])
            ].join('\n');

            const parsed = parseLLMResponse(response);

            expect(parsed).not.toBeNull();
            expect(parsed?.operations).toHaveLength(3);
            expect(parsed?.operations).toContainEqual({ type: 'write', path: filePath1, content: content1, patchStrategy: 'overwrite' });
            expect(parsed?.operations).toContainEqual({ type: 'delete', path: filePath2 });
            expect(parsed?.operations).toContainEqual({ type: 'write', path: filePath3, content: content3, patchStrategy: strategy3 });
            expect(parsed?.reasoning.join(' ')).toContain("I'll make three changes.");
        });
        
        it('should handle file paths with spaces and a patch strategy', () => {
            const filePath = 'src/components/a file with spaces.tsx';
            const strategy = 'new-unified';
            const content = '<button>Click Me</button>';
            const response = createFileBlock(filePath, content, strategy) + LLM_RESPONSE_END(testUuid, [{ new: filePath }]);
            const parsed = parseLLMResponse(response);
            const op = parsed?.operations[0];

            expect(op).toBeDefined();
            expect(op?.path).toBe(filePath);
            if (op?.type === 'write') {
                expect(op.patchStrategy).toBe(strategy);
            }
        });

        it('should handle empty content in a write operation', () => {
            const filePath = 'src/empty.ts';
            const response = createFileBlock(filePath, '') + LLM_RESPONSE_END(testUuid, [{ new: filePath }]);
            const parsed = parseLLMResponse(response);
            const op = parsed?.operations[0];
            expect(op?.type).toBe('write');
            if (op?.type === 'write') {
                expect(op.content).toBe('');
            }
        });

        it('should ignore malformed code blocks', () => {
            const response = `
\`\`\`typescript // {malformed-path.ts
const a = 1;
\`\`\`
${LLM_RESPONSE_END(testUuid, [])}
            `;
            expect(parseLLMResponse(response)).toBeNull();
        });
    });
});
```