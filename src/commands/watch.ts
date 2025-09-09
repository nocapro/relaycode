import { findConfig, loadConfigOrExit, findConfigPath } from '../core/config';
import { createClipboardWatcher } from '../core/clipboard';
import { parseLLMResponse } from 'relaycode-core';
import { processPatch } from '../core/transaction';
import { logger } from '../utils/logger';
import { type Config } from 'relaycode-core';
import fs from 'fs';
import path from 'path';

const getSystemPrompt = (
  projectId: string,
  preferredStrategy: Config['watcher']['preferredStrategy'],
  patchConfig: Config['patch'],
): string => {
    const header = `
✅ relaycode is watching for changes.

IMPORTANT: For relaycode to work, you must configure your AI assistant.
Copy the entire text below and paste it into your LLM's "System Prompt"
or "Custom Instructions" section.
---------------------------------------------------------------------------`;

  const intro = `You are an expert AI programmer. To modify a file, you MUST use a code block with a specified patch strategy.`;

  const syntaxAuto = `
**Syntax:**
\`\`\`typescript // filePath {patchStrategy}
... content ...
\`\`\`
- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
- \`patchStrategy\`: (Optional) One of \`standard-diff\`, \`search-replace\`. If omitted, the entire file is replaced (this is the \`replace\` strategy).

**Examples:**
\`\`\`typescript // src/components/Button.tsx
...
\`\`\`
\`\`\`typescript // "src/components/My Component.tsx" standard-diff
...
\`\`\``;

  const syntaxReplace = `
**Syntax:**
\`\`\`typescript // filePath
... content ...
\`\`\`
- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
- Only the \`replace\` strategy is enabled. This means you must provide the ENTIRE file content for any change. This is suitable for creating new files or making changes to small files.`;

  const syntaxStandardDiff = `
**Syntax:**
\`\`\`typescript // filePath standard-diff
... diff content ...
\`\`\`
- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
- You must use the \`standard-diff\` patch strategy for all modifications.`;

  const syntaxSearchReplace = `
**Syntax:**
\`\`\`typescript // filePath search-replace
... diff content ...
\`\`\`
- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
- You must use the \`search-replace\` patch strategy for all modifications.`;

  const sectionStandardDiff = `---

### Strategy 1: Advanced Unified Diff (\`standard-diff\`) - RECOMMENDED

Use for most changes, like refactoring, adding features, and fixing bugs. It's resilient to minor changes in the source file.

**Diff Format:**
1.  **File Headers**: Start with \`--- {filePath}\` and \`+++ {filePath}\`.
2.  **Hunk Header**: Use \`@@ ... @@\`. Exact line numbers are not needed.
3.  **Context Lines**: Include 2-3 unchanged lines before and after your change for context.
4.  **Changes**: Mark additions with \`+\` and removals with \`-\`. Maintain indentation.

**Example:**
\`\`\`diff
--- src/utils.ts
+++ src/utils.ts
@@ ... @@
    function calculateTotal(items: number[]): number {
-      return items.reduce((sum, item) => {
-        return sum + item;
-      }, 0);
+      const total = items.reduce((sum, item) => {
+        return sum + item * 1.1;  // Add 10% markup
+      }, 0);
+      return Math.round(total * 100) / 100;  // Round to 2 decimal places
+    }
\`\`\`
`;

  const sectionSearchReplace = `---

### Strategy 2: Search-Replace (\`search-replace\`)

Use for precise, surgical replacements. The \`SEARCH\` block must be an exact match of the content in the file.

**Diff Format:**
Repeat this block for each replacement.
\`\`\`diff
<<<<<<< SEARCH
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
\`\`\`
`;

  const otherOps = `---

### Other Operations

-   **Creating a file**: Use the default \`replace\` strategy (omit the strategy name) and provide the full file content.
-   **Deleting a file**:
    \`\`\`typescript // path/to/file.ts
    //TODO: delete this file
    \`\`\`
    \`\`\`typescript // "path/to/My Old Component.ts"
    //TODO: delete this file
    \`\`\`
-   **Renaming/Moving a file**:
    \`\`\`json // rename-file
    {
      "from": "src/old/path/to/file.ts",
      "to": "src/new/path/to/file.ts"
    }
    \`\`\`
`;

  const finalSteps_rules = [];
  if (patchConfig.minFileChanges > 0) {
    finalSteps_rules.push(`You must modify at least ${patchConfig.minFileChanges} file(s) in this transaction.`);
  }
  if (patchConfig.maxFileChanges) {
    finalSteps_rules.push(`You must not modify more than ${patchConfig.maxFileChanges} file(s) in this transaction.`);
  }

  const finalSteps_list = [
    'Add your step-by-step reasoning in plain text before each code block.',
  ];
  if (finalSteps_rules.length > 0) {
    finalSteps_list.push(`Adhere to file limits: ${finalSteps_rules.join(' ')}`);
  }
  finalSteps_list.push('ALWAYS add the following YAML block at the very end of your response. Use the exact projectId shown here. Generate a new random uuid for each response.');

  const finalSteps_list_string = finalSteps_list.map((item, index) => `${index + 1}.  ${item}`).join('\n');

  const finalSteps = `---

### Final Steps

${finalSteps_list_string}

    \`\`\`yaml
    projectId: ${projectId}
    uuid: (generate a random uuid)
    changeSummary: # A list of key-value pairs for changes
      - edit: src/main.ts
      - new: src/components/Button.tsx
      - delete: src/utils/old-helper.ts
    promptSummary: A brief summary of my request.
    gitCommitMsg: >-
      feat: A concise, imperative git commit message.

      Optionally, provide a longer description here.
    \`\`\`
`;

  const footer = `---------------------------------------------------------------------------`;

  const strategyInfo = {
    auto: { syntax: syntaxAuto, details: `${sectionStandardDiff}\n${sectionSearchReplace}` },
    replace: { syntax: syntaxReplace, details: '' },
    'standard-diff': { syntax: syntaxStandardDiff, details: sectionStandardDiff },
    'search-replace': { syntax: syntaxSearchReplace, details: sectionSearchReplace },
  };

  const preferred = strategyInfo[preferredStrategy] ?? strategyInfo.auto;
  const syntax = preferred.syntax;
  const strategyDetails = preferred.details;

  return [header, intro, syntax, strategyDetails, otherOps, finalSteps, footer].filter(Boolean).join('\n');
};

export const watchCommand = async (options: { yes?: boolean } = {}, cwd: string = process.cwd()): Promise<{ stop: () => void }> => {
  let clipboardWatcher: ReturnType<typeof createClipboardWatcher> | null = null;
  let configWatcher: fs.FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  const startServices = (config: Config) => {
    // Stop existing watcher if it's running
    if (clipboardWatcher) {
      clipboardWatcher.stop();
    }

    logger.setLevel(config.core.logLevel);
    logger.debug(`Log level set to: ${config.core.logLevel}`);
    logger.debug(`Preferred strategy set to: ${config.watcher.preferredStrategy}`);

    logger.log(getSystemPrompt(config.projectId, config.watcher.preferredStrategy, config.patch));

    clipboardWatcher = createClipboardWatcher(config.watcher.clipboardPollInterval, async (content) => {
      logger.info('New clipboard content detected. Attempting to parse...');
      const parsedResponse = parseLLMResponse(content);

      if (!parsedResponse) {
        logger.warn('Clipboard content is not a valid relaycode patch. Ignoring.');
        return;
      }

      // Check project ID before notifying and processing.
      if (parsedResponse.control.projectId !== config.projectId) {
        logger.debug(`Ignoring patch for different project (expected '${config.projectId}', got '${parsedResponse.control.projectId}').`);
        return;
      }

      await processPatch(config, parsedResponse, { cwd, notifyOnStart: true, yes: options.yes });
      logger.info('--------------------------------------------------');
      logger.info('Watching for next patch...');
    });
  };

  const handleConfigChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      logger.info(`Configuration file change detected. Reloading...`);
      try {
        const newConfig = await findConfig(cwd);
        if (newConfig) {
          logger.success('Configuration reloaded. Restarting services...');
          startServices(newConfig);
        } else {
          logger.error(`Configuration file is invalid or has been deleted. Services paused.`);
          if (clipboardWatcher) {
            clipboardWatcher.stop();
            clipboardWatcher = null;
          }
        }
      } catch (error) {
        logger.error(`Error reloading configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 250);
  };

  // Initial startup
  const initialConfig = await loadConfigOrExit(cwd);
  const configPath = await findConfigPath(cwd);
  logger.success('Configuration loaded. Starting relaycode watch...');
  startServices(initialConfig);

  // Watch for changes after initial setup
  if (initialConfig.core.watchConfig && configPath) {
    logger.info(`Configuration file watching is enabled for ${path.basename(configPath)}.`);
    configWatcher = fs.watch(configPath, handleConfigChange);
  } else {
    logger.info('Configuration file watching is disabled. Changes to config will require a restart to take effect.');
  }

  const stopAll = () => {
    if (clipboardWatcher) {
      clipboardWatcher.stop();
    }
    if (configWatcher) {
      configWatcher.close();
      logger.info('Configuration file watcher stopped.');
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
  return { stop: stopAll };
};
