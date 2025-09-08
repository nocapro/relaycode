# Relaycode - API and Technical Specification

## 1. Introduction

`relaycode` is a CLI developer tool designed to bridge the gap between Large Language Models (LLMs) and local development environments. It automates the process of applying code changes suggested by an AI assistant by parsing a specific response format, applying the changes transactionally, and managing the history of these changes.

## 2. Architecture Overview

The system is event-driven, primarily initiated by clipboard events. The core workflow is as follows:

1.  **Watch**: The `relay watch` command starts a poller that monitors the system clipboard for new content.
2.  **Parse**: When new content is detected, it is passed to the `parser`. The parser attempts to interpret the content as a `relaycode` patch, which consists of file operations and metadata.~
3.  **Validate**: The parsed response is validated. Its `projectId` must match the local configuration, and its `uuid` must not have been processed before.
4.  **Transact**: If valid, a new trans~action begins.
    *   A **snapshot** of all files to be affected is created.
    *   A `.pending.yml` state file is written to the `.relaycode` directory, recording the intended operations and the file snapshot.
5.  **Execute**: The file operations (write, delete, rename) are applied to the local file system.
6.  **Approve**: Post-execution checks (like running a linter) are performed. Based on the configuration (`approvalMode`) and the results of the checks, the changes are either auto-approved or the user is prompted for manual approval.
7.  **Commit/Rollback**:
    *   If **approved**, the `.pending.yml` file is renamed to `.yml`, finalizing the transaction.
    *   If **rejected** or if any step **fails**, the initial file snapshot is restored, and the `.pending.yml` file is deleted, effectively rolling back all changes.

This transactional approach ensures that the user's project is never left in a partially modified state.

## 3. Core Components

*   **`cli.ts`**: The entry point for the command-line interface, built with `commander`. It defines all available commands (`init`, `watch`, `log`, etc.) and delegates their execution to the corresponding modules in `src/commands/`.

*   **`core/config.ts`**: Handles loading, parsing, and validating the project's configuration file (`relaycode.config.ts`). It uses `esbuild` to support TypeScript configurations and `zod` for schema validation. It also provides sensible defaults for all configuration options.

*   **`core/parser.ts`**: The "brains" of the input processing. It uses regular expressions to find code blocks and a YAML block within a larger text response from an LLM. It parses file headers (`// filePath {patchStrategy}`), infers patch strategies, and extracts file content, delete markers, or rename operations. The final output is a structured `ParsedLLMResponse` object.

*   **`core/transaction.ts`**: Orchestrates the entire lifecycle of a single patch. It's the central workflow manager that calls other core components in the correct order:
    1.  Validates the parsed patch.
    2.  Creates the file snapshot (`executor.ts`).
    3.  Writes the pending state (`state.ts`).
    4.  Applies the operations (`executor.ts`).
    5.  Handles post-run commands and linting (`shell.ts`).
    6.  Manages the approval flow (manual or automatic).
    7.  Commits the state (`state.ts`) or triggers a rollback (`executor.ts`).
    8.  Handles optional Git branch creation (`shell.ts`).

*   **`core/executor.ts`**: Responsible for direct file system interactions.
    *   `createSnapshot`: Reads the current content of files before they are modified.
    *   `applyOperations`: Executes the `FileOperation` array. It uses the `diff-apply` library for patch strategies (`new-unified`, `multi-search-replace`) and native `fs` calls for `replace`, `delete`, and `rename`.
    *   `restoreSnapshot`: Reverts file changes by writing the original content back from the snapshot. It also handles cleaning up newly created files and directories on rollback.

*   **`core/state.ts`**: Manages the persistence of transaction records in the `.relaycode` directory. It handles writing, committing (renaming `.pending.yml` to `.yml`), and reading state files. It includes optimized functions like `findLatestStateFile` that avoid parsing every YAML file to find the most recent one.

*   **`core/clipboard.ts`**: Provides a cross-platform clipboard monitoring utility. It uses `clipboardy` as a base but includes Windows-specific fallbacks and dependency checks for Linux (`xsel`/`xclip`) to ensure robustness.

*   **`utils/`**: A collection of helper modules:
    *   `logger.ts`: A configurable logger with different levels (`debug`, `info`, `warn`, `error`) and color-coded output using `chalk`.
    *   `shell.ts`: A wrapper for executing shell commands (`child_process.spawn`) and parsing their output.
    *   `fs.ts`: Abstractions over Node's `fs` module for common tasks like reading/writing files, ensuring directories exist, and safely renaming files across devices.
    *   `prompt.ts`: Handles user confirmation prompts in the terminal.
    *   `notifier.ts`: A "fire-and-forget" utility for sending desktop notifications using `toasted-notifier`, used for approval requests and success/failure alerts.
    *   `formatters.ts`: Utilities for formatting transaction details for display in the `log` and `revert` commands.
    *   `constants.ts`: A central place for shared string constants (file names, markers, etc.).

## 4. Data Structures and Schemas (`types.ts`)

All core data structures are defined and validated using `zod`.

### `Config`

The fully parsed and validated configuration object from `relaycode.config.ts`.

```typescript
{
  projectId: string,
  core: {
    logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug',
    enableNotifications: boolean,
    watchConfig: boolean,
  },
  watcher: {
    clipboardPollInterval: number,
    preferredStrategy: 'auto' | 'replace' | 'new-unified' | 'multi-search-replace',
  },
  patch: {
    approvalMode: 'auto' | 'manual',
    approvalOnErrorCount: number, // Auto-approve if linter errors <= this value
    linter: string, // e.g., 'bun tsc --noEmit'
    preCommand: string,
    postCommand: string,
  },
  git: {
    autoGitBranch: boolean,
    gitBranchPrefix: string,
    gitBranchTemplate: 'uuid' | 'gitCommitMsg',
  }
}
```

### `FileOperation`

A single atomic action to be performed on the filesystem.

```typescript
// A file modification
{
  type: 'write',
  path: string,
  content: string,
  patchStrategy: 'replace' | 'new-unified' | 'multi-search-replace' | 'unified',
}

// A file deletion
{
  type: 'delete',
  path: string,
}

// A file rename/move
{
  type: 'rename',
  from: string,
  to: string,
}
```

### `ParsedLLMResponse`

The structured representation of the raw text from the AI assistant.

```typescript
{
  // Parsed from the final YAML block
  control: {
    projectId: string,
    uuid: string, // UUID v4
    gitCommitMsg?: string,
    promptSummary?: string,
  },
  // Parsed from the code blocks
  operations: FileOperation[],
  // All text outside of code blocks and the YAML block
  reasoning: string[],
}
```

### `StateFile`

The complete record of a transaction, serialized to YAML and stored in `.relaycode/`.

```typescript
{
  uuid: string,
  projectId: string,
  createdAt: string, // ISO 8601 datetime
  gitCommitMsg?: string,
  promptSummary?: string,
  reasoning: string[],
  operations: FileOperation[],
  // A map of filePath -> content before the transaction
  snapshot: Record<string, string | null>,
  approved: boolean,
}
```

## 5. LLM Response Format Specification

This is the contract that the AI assistant must follow for its output to be machine-readable by `relaycode`.

---

You are an expert AI programmer. To modify a file, you MUST use a code block with a specified patch strategy.

**Syntax:**
```typescript // filePath {patchStrategy}
... content ...
```
- `filePath`: The path to the file. **If the path contains spaces, it MUST be enclosed in double quotes.**
- `patchStrategy`: (Optional) One of `new-unified`, `multi-search-replace`. If omitted, the entire file is replaced (this is the `replace` strategy).

**Examples:**
```typescript // src/components/Button.tsx
...
```
```typescript // "src/components/My Component.tsx" new-unified
...
```

### Strategy 1: Advanced Unified Diff (`new-unified`)

Use for most changes, like refactoring, adding features, and fixing bugs. It's resilient to minor changes in the source file.

**Diff Format:**
1.  **File Headers**: Start with `--- {filePath}` and `+++ {filePath}`.
2.  **Hunk Header**: Use `@@ ... @@`. Exact line numbers are not needed.
3.  **Context Lines**: Include 2-3 unchanged lines before and after your change for context.
4.  **Changes**: Mark additions with `+` and removals with `-`. Maintain indentation.

**Example:**
```diff
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
```

### Strategy 2: Multi-Search-Replace (`multi-search-replace`)

Use for precise, surgical replacements. The `SEARCH` block must be an exact match of the content in the file.

**Diff Format:**
Repeat this block for each replacement.
```diff
<<<<<<< SEARCH
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
```

### Other Operations

-   **Creating a file**: Use the default `replace` strategy (omit the strategy name) and provide the full file content.
-   **Deleting a file**:
    ```typescript // path/to/file.ts
    //TODO: delete this file
    ```
-   **Renaming/Moving a file**:
    ```json // rename-file
    {
      "from": "src/old/path/to/file.ts",
      "to": "src/new/path/to/file.ts"
    }
    ```

### Final Steps

1.  Add your step-by-step reasoning in plain text before each code block.
2.  ALWAYS add the following YAML block at the very end of your response. Use the exact projectId shown here. Generate a new random uuid for each response.

    ```yaml
    projectId: (your project's id, e.g., 'my-app')
    uuid: (generate a random uuid)
    changeSummary:
      - edit: src/main.ts
      - new: src/components/Button.tsx
      - delete: src/utils/old-helper.ts
    promptSummary: "A detailed summary of my request."
    gitCommitMsg: "feat: A concise, imperative git commit message."
    ```
---

## 6. CLI API

*   `relay init`
    *   **Description**: Initializes `relaycode` in the current project.
    *   **Action**: Creates a `relaycode.config.ts` file, a `.relaycode` state directory, and adds `.relaycode/` to the `.gitignore` file.

*   `relay watch`
    *   **Description**: Starts the clipboard watcher and displays the system prompt for the user's LLM.
    *   **Options**: `-y, --yes`: Skips all confirmation prompts for incoming patches.
    *   **Action**: Monitors the clipboard for valid patches. When one is found, it triggers the full transaction workflow. Also watches the config file for changes and reloads automatically.

*   `relay apply <filePath>`
    *   **Description**: Applies a patch from a specified file instead of the clipboard.
    *   **Arguments**: `filePath`: The path to the file containing the patch.
    *   **Options**: `-y, --yes`: Skips confirmation prompts.
    *   **Action**: Reads the content of the file and processes it as if it came from the clipboard.

*   `relay log`
    *   **Description**: Displays a log of all committed transactions, most recent first.
    *   **Action**: Reads all `.yml` files from the `.relaycode` directory, parses them, and prints a formatted summary of each one.

*   `relay revert [uuid_or_index]`
    *   **Description**: Reverts a previously applied transaction.
    *   **Arguments**: `uuid_or_index` (optional): The UUID of the transaction or its index (e.g., `1` for the latest, `2` for the second latest). Defaults to `1`.
    *   **Options**: `-y, --yes`: Skips confirmation prompts.
    *   **Action**: Finds the specified transaction, generates a set of inverse operations, and processes them as a new transaction. For example, a `delete` becomes a `write` using content from the original snapshot.

*   `relay git commit`
    *   **Description**: Finds the latest transaction and uses its `gitCommitMsg` to perform a `git add .` and `git commit`.
    *   **Options**: `-y, --yes`: Skips confirmation prompts.
    *   **Action**: A convenience wrapper for staging and committing changes after a successful transaction.

## 7. File System Layout

All state is stored within a `.relaycode` directory in the project root.

*   `.relaycode/`
    *   `{uuid}.pending.yml`: A temporary file created at the start of a transaction. It is deleted on rollback or renamed on commit.
    *   `{uuid}.yml`: The permanent, committed record of a successful transaction.
    *   `undone/`: A directory reserved for storing undone/reverted transaction files.
    *   `fallbacks/windows/clipboard_x86_64.exe`: A fallback executable for Windows clipboard access, ensuring functionality even if `clipboardy`'s native bindings fail.

## 8. Error Handling and Rollbacks

`relaycode` is designed to be atomic. A patch is either fully applied and committed, or it is fully rolled back, leaving the project untouched.

1.  **Snapshot**: Before any modifications, `executor.createSnapshot` is called to store the current state of all files that will be affected by the operations. This includes `null` for files that are about to be created.
2.  **Pending State**: A `{uuid}.pending.yml` file, which includes the snapshot, is written. This ensures that even if the process crashes mid-operation, the means to recover exist (though auto-recovery is not yet implemented).
3.  **Failure Trigger**: An error can be triggered at multiple points:
    *   `applyOperations` fails (e.g., patch cannot be applied).
    *   A `preCommand` or `postCommand` returns a non-zero exit code.
    *   The user rejects the changes at the manual approval prompt.
4.  **Rollback**: When a failure is triggered, `transaction.rollbackTransaction` is called.
    *   `executor.restoreSnapshot` iterates through the snapshot and writes the original content back to each file.
    *   For files that were created (`null` in the snapshot), it deletes them. It also cleans up any empty parent directories created during the transaction.
    *   Finally, `state.deletePendingState` removes the `.pending.yml` file.

This ensures that the user's working directory is always in a consistent state.
