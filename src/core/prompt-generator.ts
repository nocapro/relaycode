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