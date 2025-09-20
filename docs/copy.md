This is a great suggestion to improve the user experience for `relay watch`. By automatically copying the system prompt to the clipboard and sourcing it from a file, we can make the process smoother and more customizable for users.

Here are the changes to implement this feature:

1.  **Create a new file `src/core/prompt-generator.ts`**: This will house the `getSystemPrompt` logic, which was previously in `watch.ts`. This function will now generate only the raw system prompt content, without any console-specific headers.
2.  **Update `init` command**: The `init` command will now use `getSystemPrompt` to create a default `.relay/prompts/system-prompt.md` file. The command's output message will be updated to inform the user about this new file and the improved `watch` behavior.
3.  **Update `watch` command**: The `watch` command will be modified to:
    *   Read the system prompt from `.relay/prompts/system-prompt.md`.
    *   Copy the content to the user's clipboard.
    *   Display a simple confirmation message instead of the full prompt text.

Here are the code modifications:

I'll start by creating the new file to hold the system prompt generation logic.

```typescript // src/core/prompt-generator.ts
import { type Config } from 'relaycode-core';

export const getSystemPrompt = (
  projectId: string,
  preferredStrategy: Config['watcher']['preferredStrategy'],
  patchConfig: Config['patch'],
): string => {
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

  const strategyInfo = {
    auto: { syntax: syntaxAuto, details: `${sectionStandardDiff}\n${sectionSearchReplace}` },
    replace: { syntax: syntaxReplace, details: '' },
    'standard-diff': { syntax: syntaxStandardDiff, details: sectionStandardDiff },
    'search-replace': { syntax: syntaxSearchReplace, details: sectionSearchReplace },
  };

  const preferred = strategyInfo[preferredStrategy] ?? strategyInfo.auto;
  const syntax = preferred.syntax;
  const strategyDetails = preferred.details;

  const promptParts = [intro, syntax, strategyDetails, otherOps, finalSteps];
  return promptParts.filter(Boolean).join('\n');
};
```

Next, I'll update the `init` command to generate the prompt file and display the new instructions.

```typescript // src/commands/init.ts standard-diff
--- src/commands/init.ts
+++ src/commands/init.ts
@@ -2,10 +2,22 @@
 import path from 'path';
 import { findConfig, createConfig, getProjectId, getStateDirectory } from '../core/config';
 import { logger, getErrorMessage, isEnoentError } from '../utils/logger';
-import { STATE_DIRECTORY_NAME, GITIGNORE_FILE_NAME, GITIGNORE_COMMENT, CONFIG_FILE_NAME_JSON } from '../utils/constants';
+import {
+  STATE_DIRECTORY_NAME,
+  GITIGNORE_FILE_NAME,
+  GITIGNORE_COMMENT,
+  CONFIG_FILE_NAME_JSON,
+} from '../utils/constants';
 import chalk from 'chalk';
+import { getSystemPrompt } from '../core/prompt-generator';

-const getInitMessage = (projectId: string): string => `
+const PROMPT_FILE_NAME = 'system-prompt.md';
+
+const getInitMessage = (projectId: string, promptFilePath: string): string => `
 ${chalk.green('✅ relaycode has been initialized for this project.')}

 Configuration file created: ${chalk.cyan(CONFIG_FILE_NAME_JSON)}
+Default system prompt created: ${chalk.cyan(promptFilePath)}

 Project ID: ${chalk.cyan(projectId)}

@@ -16,11 +28,11 @@
    - In ${chalk.yellow("'git'")}, you can enable ${chalk.yellow("'git.autoGitBranch'")} to create a new branch for each transaction.
    - In ${chalk.yellow("'patch'")}, you can configure the linter, pre/post commands, and approval behavior.

-${chalk.gray('2.')} Run ${chalk.magenta("'relay watch'")} in your terminal. This will start the service and display the system prompt tailored to your configuration.
+${chalk.gray('2.')} (Optional) You can customize the AI instructions by editing ${chalk.cyan(promptFilePath)}.

-${chalk.gray('3.')} Copy the system prompt provided by ${chalk.magenta("'relay watch'")} and paste it into your AI assistant's "System Prompt" or "Custom Instructions".
+${chalk.gray('3.')} Run ${chalk.magenta("'relay watch'")} in your terminal. It will automatically copy the system prompt to your clipboard.
+
+${chalk.gray('4.')} Paste the system prompt into your AI assistant's "System Prompt" or "Custom Instructions".
 `;


@@ -58,14 +70,25 @@
   }

   const projectId = await getProjectId(cwd);
-  await createConfig(projectId, cwd);
+  const newConfig = await createConfig(projectId, cwd);
   logger.success(`Created configuration file: ${chalk.cyan(CONFIG_FILE_NAME_JSON)}`);

   // Explicitly create the transaction directory so `log` command doesn't fail on a fresh init
-  await fs.mkdir(path.join(getStateDirectory(cwd), 'transaction'), { recursive: true });
+  const stateDir = getStateDirectory(cwd);
+  await fs.mkdir(path.join(stateDir, 'transaction'), { recursive: true });
   logger.success(`Created state directory: ${STATE_DIRECTORY_NAME}/`);

+  // Create system prompt file
+  const systemPrompt = getSystemPrompt(
+    projectId,
+    newConfig.watcher.preferredStrategy,
+    newConfig.patch
+  );
+  const promptsDir = path.join(stateDir, 'prompts');
+  await fs.mkdir(promptsDir, { recursive: true });
+  const systemPromptPath = path.join(promptsDir, PROMPT_FILE_NAME);
+  await fs.writeFile(systemPromptPath, systemPrompt);
+  const relativePromptPath = path.join(STATE_DIRECTORY_NAME, 'prompts', PROMPT_FILE_NAME);
+  logger.success(`Created default system prompt: ${chalk.cyan(relativePromptPath)}`);
+
   await updateGitignore(cwd);

-  logger.log(getInitMessage(projectId));
+  logger.log(getInitMessage(projectId, relativePromptPath));
 };

```

Finally, I'll update the `watch` command to read the file, copy it to the clipboard, and remove the old prompt-generation logic.

```typescript // src/commands/watch.ts standard-diff
--- src/commands/watch.ts
+++ src/commands/watch.ts
@@ -1,133 +1,24 @@
-import { findConfig, loadConfigOrExit, findConfigPath } from '../core/config';
+import {
+  findConfig,
+  loadConfigOrExit,
+  findConfigPath,
+  getStateDirectory,
+} from '../core/config';
 import { createClipboardWatcher, createBulkClipboardWatcher } from '../core/clipboard';
 import chalk from 'chalk';
-import { parseLLMResponse, type ParsedLLMResponse, logger as coreLogger } from 'relaycode-core';
+import {
+  parseLLMResponse,
+  type ParsedLLMResponse,
+  logger as coreLogger,
+} from 'relaycode-core';
 import { processPatch, processPatchesBulk } from '../core/transaction';
-import { logger } from '../utils/logger';
+import { logger, getErrorMessage } from '../utils/logger';
 import { type Config } from 'relaycode-core';
 import fs from 'fs';
-
-const getSystemPrompt = (
-  projectId: string,
-  preferredStrategy: Config['watcher']['preferredStrategy'],
-  patchConfig: Config['patch'],
-): string => {
-    const header = `
-✅ relaycode is watching for changes.
-
-IMPORTANT: For relaycode to work, you must configure your AI assistant.
-Copy the entire text below and paste it into your LLM's "System Prompt"
-or "Custom Instructions" section.
----------------------------------------------------------------------------`;
-
-  const intro = `You are an expert AI programmer. To modify a file, you MUST use a code block with a specified patch strategy.`;
-
-  const syntaxAuto = `
-**Syntax:**
-\`\`\`typescript // filePath {patchStrategy}
-... content ...
-\`\`\`
-- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
-- \`patchStrategy\`: (Optional) One of \`standard-diff\`, \`search-replace\`. If omitted, the entire file is replaced (this is the \`replace\` strategy).
-
-**Examples:**
-\`\`\`typescript // src/components/Button.tsx
-...
-\`\`\`
-\`\`\`typescript // "src/components/My Component.tsx" standard-diff
-...
-\`\`\``;
-
-  const syntaxReplace = `
-**Syntax:**
-\`\`\`typescript // filePath
-... content ...
-\`\`\`
-- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
-- Only the \`replace\` strategy is enabled. This means you must provide the ENTIRE file content for any change. This is suitable for creating new files or making changes to small files.`;
-
-  const syntaxStandardDiff = `
-**Syntax:**
-\`\`\`typescript // filePath standard-diff
-... diff content ...
-\`\`\`
-- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
-- You must use the \`standard-diff\` patch strategy for all modifications.`;
-
-  const syntaxSearchReplace = `
-**Syntax:**
-\`\`\`typescript // filePath search-replace
-... diff content ...
-\`\`\`
-- \`filePath\`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
-- You must use the \`search-replace\` patch strategy for all modifications.`;
-
-  const sectionStandardDiff = `---
-
-### Strategy 1: Advanced Unified Diff (\`standard-diff\`) - RECOMMENDED
-
-Use for most changes, like refactoring, adding features, and fixing bugs. It's resilient to minor changes in the source file.
-
-**Diff Format:**
-1.  **File Headers**: Start with \`--- {filePath}\` and \`+++ {filePath}\`.
-2.  **Hunk Header**: Use \`@@ ... @@\`. Exact line numbers are not needed.
-3.  **Context Lines**: Include 2-3 unchanged lines before and after your change for context.
-4.  **Changes**: Mark additions with \`+\` and removals with \`-\`. Maintain indentation.
-
-**Example:**
-\`\`\`diff
---- src/utils.ts
-+++ src/utils.ts
-@@ ... @@
-    function calculateTotal(items: number[]): number {
--      return items.reduce((sum, item) => {
--        return sum + item;
--      }, 0);
-+      const total = items.reduce((sum, item) => {
-+        return sum + item * 1.1;  // Add 10% markup
-+      }, 0);
-+      return Math.round(total * 100) / 100;  // Round to 2 decimal places
-+    }
-\`\`\`
-`;
-
-  const sectionSearchReplace = `---
-
-### Strategy 2: Search-Replace (\`search-replace\`)
-
-Use for precise, surgical replacements. The \`SEARCH\` block must be an exact match of the content in the file.
-
-**Diff Format:**
-Repeat this block for each replacement.
-\`\`\`diff
-<<<<<<< SEARCH
-[exact content to find including whitespace]
-=======
-[new content to replace with]
->>>>>>> REPLACE
-\`\`\`
-`;
-
-  const otherOps = `---
-
-### Other Operations
-
--   **Creating a file**: Use the default \`replace\` strategy (omit the strategy name) and provide the full file content.
--   **Deleting a file**:
-    \`\`\`typescript // path/to/file.ts
-    //TODO: delete this file
-    \`\`\`
-    \`\`\`typescript // "path/to/My Old Component.ts"
-    //TODO: delete this file
-    \`\`\`
--   **Renaming/Moving a file**:
-    \`\`\`json // rename-file
-    {
-      "from": "src/old/path/to/file.ts",
-      "to": "src/new/path/to/file.ts"
-    }
-    \`\`\`
-`;
-
-  const finalSteps_rules = [];
-  if (patchConfig.minFileChanges > 0) {
-    finalSteps_rules.push(`You must modify at least ${patchConfig.minFileChanges} file(s) in this transaction.`);
-  }
-  if (patchConfig.maxFileChanges) {
-    finalSteps_rules.push(`You must not modify more than ${patchConfig.maxFileChanges} file(s) in this transaction.`);
-  }
-
-  const finalSteps_list = [
-    'Add your step-by-step reasoning in plain text before each code block.',
-  ];
-  if (finalSteps_rules.length > 0) {
-    finalSteps_list.push(`Adhere to file limits: ${finalSteps_rules.join(' ')}`);
-  }
-  finalSteps_list.push('ALWAYS add the following YAML block at the very end of your response. Use the exact projectId shown here. Generate a new random uuid for each response.');
-
-  const finalSteps_list_string = finalSteps_list.map((item, index) => `${index + 1}.  ${item}`).join('\n');
-
-  const finalSteps = `---
-
-### Final Steps
-
-${finalSteps_list_string}
-
-    \`\`\`yaml
-    projectId: ${projectId}
-    uuid: (generate a random uuid)
-    changeSummary: # A list of key-value pairs for changes
-      - edit: src/main.ts
-      - new: src/components/Button.tsx
-      - delete: src/utils/old-helper.ts
-    promptSummary: A brief summary of my request.
-    gitCommitMsg: >-
-      feat: A concise, imperative git commit message.
-
-      Optionally, provide a longer description here.
-    \`\`\`
-`;
-
-  const footer = `---------------------------------------------------------------------------`;
-
-  const strategyInfo = {
-    auto: { syntax: syntaxAuto, details: `${sectionStandardDiff}\n${sectionSearchReplace}` },
-    replace: { syntax: syntaxReplace, details: '' },
-    'standard-diff': { syntax: syntaxStandardDiff, details: sectionStandardDiff },
-    'search-replace': { syntax: syntaxSearchReplace, details: sectionSearchReplace },
-  };
-
-  const preferred = strategyInfo[preferredStrategy] ?? strategyInfo.auto;
-  const syntax = preferred.syntax;
-  const strategyDetails = preferred.details;
-
-  return [header, intro, syntax, strategyDetails, otherOps, finalSteps, footer].filter(Boolean).join('\n');
-};
+import path from 'path';
+import clipboardy from 'clipboardy';

 export const watchCommand = async (options: { yes?: boolean } = {}, cwd: string = process.cwd()): Promise<{ stop: () => void }> => {
   let clipboardWatcher: { stop: () => void } | null = null;
@@ -135,7 +26,7 @@
   let configWatcher: fs.FSWatcher | null = null;
   let debounceTimer: NodeJS.Timeout | null = null;

-  const startServices = (config: Config) => {
+  const startServices = async (config: Config) => {
     // Stop existing watcher if it's running
     if (clipboardWatcher) {
       clipboardWatcher.stop();
@@ -148,7 +39,23 @@
     logger.debug(`Log level set to: ${config.core.logLevel}`);
     logger.debug(`Preferred strategy set to: ${config.watcher.preferredStrategy}`);

-    logger.log(getSystemPrompt(config.projectId, config.watcher.preferredStrategy, config.patch));
+    const systemPromptPath = path.join(getStateDirectory(cwd), 'prompts', 'system-prompt.md');
+    try {
+      const systemPrompt = await fs.promises.readFile(systemPromptPath, 'utf-8');
+      await clipboardy.write(systemPrompt);
+      logger.success('✅ System prompt copied to clipboard.');
+      logger.info(
+        `Paste it into your LLM's "System Prompt" or "Custom Instructions" section.`
+      );
+    } catch (error) {
+      logger.error(
+        `Could not read or copy system prompt from ${chalk.cyan(systemPromptPath)}.`
+      );
+      logger.info(
+        `Please run ${chalk.magenta("'relay init'")} to generate it, or create it manually.`
+      );
+      logger.debug(`Error details: ${getErrorMessage(error)}`);
+    }

     // Use bulk clipboard watcher if bulk mode is enabled
     if (config.watcher.enableBulkProcessing) {
@@ -233,7 +140,7 @@
         const newConfig = await findConfig(cwd);
         if (newConfig) {
           logger.success('Configuration reloaded. Restarting services...');
-          startServices(newConfig);
+          await startServices(newConfig);
         } else {
           logger.error(`Configuration file is invalid or has been deleted. Services paused.`);
           if (clipboardWatcher) {
@@ -256,7 +163,7 @@
   );

   logger.success('Configuration loaded. Starting relaycode watch...');
-  startServices(initialConfig);
+  await startServices(initialConfig);

   // Watch for changes after initial setup
   if (initialConfig.core.watchConfig && configPath) {

```

These changes centralize the prompt generation, make initialization more user-friendly by creating a customizable prompt file, and streamline the `watch` command by automatically copying the prompt to the clipboard.

YAML summary:
```yaml
projectId: relaycode
uuid: a6312520-2d93-4a0b-8d59-3c35b8026779
changeSummary:
  - new: src/core/prompt-generator.ts
  - edit: src/commands/init.ts
  - edit: src/commands/watch.ts
promptSummary: Improved UX for `relay watch` by reading the system prompt from a file (`.relay/prompts/system-prompt.md`), automatically copying it to the clipboard, and updating the `relay init` command to create this file by default.
gitCommitMsg: >-
  feat(cli): auto-copy system prompt and source from file

  Improves the user experience of the `relay watch` command by:
  - Automatically copying the system prompt to the clipboard upon startup.
  - Sourcing the system prompt from a new file: `.relay/prompts/system-prompt.md`. This allows users to easily customize the instructions for their AI assistant.
  - The `relay init` command now generates this default prompt file.
  - The console output for both `init` and `watch` has been updated to reflect these changes, providing clearer instructions to the user.
```
