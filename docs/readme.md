Excellent! Creating a comprehensive `README.md` is a great way to make a project accessible and easy to use. Based on my analysis of your codebase, I will now generate a detailed README file that covers the project's purpose, features, installation, usage, and configuration.

I will create a new file `README.md` in the project root.

```typescript // README.md
# RelayCode

![npm version](https://img.shields.io/npm/v/relaycode.svg)
![Build Status](https://img.shields.io/github/actions/workflow/status/relaycoder/relaycode/main.yml)
![License](https://img.shields.io/npm/l/relaycode)

RelayCode is a powerful CLI developer assistant that automates applying code changes from Large Language Models (LLMs) directly to your local codebase. Stop manually copying and pasting snippets, and start applying complex, multi-file changes with a single, safe, and revertible command.

## Key Features

-   **Automated Clipboard Monitoring**: Runs in the background and instantly detects LLM-formatted responses on your clipboard.
-   **Transactional & Revertible**: Every operation is logged as a transaction. Easily view history (`relay log`) and undo any change (`relay revert`) if something goes wrong.
-   **Multi-File & Multi-Operation**: Handles creating, deleting, renaming, and patching multiple files in a single, atomic operation.
-   **Advanced Patching Strategies**:
    -   `replace`: Overwrites the entire file.
    -   `new-unified`: Applies `git`-style diffs, resilient to minor source file changes.
    -   `multi-search-replace`: Performs precise, surgical replacements for targeted changes.
-   **Safety First**: Perform pre-flight checks (e.g., run a linter) before applying changes and run tests automatically after a successful patch.
-   **Git Integration**: Automatically create new branches and commit changes for seamless integration with your version control workflow.
-   **Desktop Notifications**: Get native desktop notifications to approve or reject changes without switching to your terminal.
-   **Highly Configurable**: Tailor RelayCode to your needs with a `relaycode.config.ts` file. Configure auto-approvals, notifications, custom commands, and more.

## Installation

To get started, install RelayCode globally using your favorite package manager.

```bash
npm install -g relaycode
```

Or, if you use Bun:

```bash
bun install -g relaycode
```

## Getting Started

1.  **Initialize Your Project**

    Navigate to your project's root directory and run:

    ```bash
    relay init
    ```

    This command creates two things:
    -   A `.relaycode` directory to store transaction history.
    -   A `relaycode.config.ts` file with default settings for you to customize.

    You should commit `relaycode.config.ts` to your repository and add `.relaycode/` to your `.gitignore` file (don't worry, `init` does this for you).

2.  **Start the Watcher**

    Open a terminal, `cd` into your project, and run:

    ```bash
    relay watch
    ```

    RelayCode is now monitoring your clipboard for formatted code changes.

3.  **Copy & Apply**

    Go to your favorite LLM and ask it to make some code changes. **Crucially, you must instruct the LLM to format its response according to the RelayCode specification (see below).**

    Once you copy the entire response, RelayCode will instantly detect it, show you a summary of the proposed changes, and ask for your approval before touching any files.

## LLM Response Format

To work with RelayCode, your LLM's output must be structured with special code blocks and a concluding YAML block.

> **Pro Tip:** The `relay watch` command prints a sample system prompt you can use to instruct your LLM on how to generate compatible responses.

A valid response consists of one or more file operations followed by exactly one control block.

### File Operations

#### 1. Create or Replace a File (`replace`)

Use a standard Markdown code block with the file path in the header. If the patch strategy is omitted, it defaults to `replace`.

````markdown
```typescript // src/components/Button.tsx
export const Button = () => {
  return <button>Click Me</button>;
};
```
````

#### 2. Patch a File (`new-unified`)

Provide a `git`-style unified diff. This is robust against small changes in the source file and is the recommended strategy for most modifications.

````diff
```diff // src/utils/helpers.ts new-unified
--- src/utils/helpers.ts
+++ src/utils/helpers.ts
@@ -1,5 +1,6 @@
 function calculateTotal(items: number[]): number {
-  return items.reduce((sum, item) => sum + item, 0);
+  const total = items.reduce((sum, item) => sum + item, 0);
+  return total * 1.05; // Add 5% tax
 }
```
````

#### 3. Precise Patching (`multi-search-replace`)

For surgical changes, use `multi-search-replace`. This allows multiple, independent search-and-replace blocks for a single file. The `SEARCH` block must be an *exact* match of the content in the file.

````typescript
```typescript // src/config.ts multi-search-replace
<<<<<<< SEARCH
const API_URL = 'https://api.example.com';
=======
const API_URL = 'https://api.staging.example.com';
>>>>>>> REPLACE
<<<<<<< SEARCH
export const TIMEOUT = 5000;
=======
export const TIMEOUT = 10000;
>>>>>>> REPLACE
```
````

#### 4. Deleting a File

To delete a file, use the special `//TODO: delete this file` marker inside a code block.

````typescript
```typescript // src/old-styles.css
//TODO: delete this file
```
````

#### 5. Renaming a File

Use a `json` code block with the `rename-file` path.

````json
```json // rename-file
{
  "from": "src/utils/helpers.ts",
  "to": "src/utils/core-helpers.ts"
}
```
````

### Control Block

Every response **must** end with a YAML control block. This block contains essential metadata for the transaction.

```yaml
projectId: your-project-id-from-config
uuid: (generate a random uuid)
changeSummary:
  - edit: src/config.ts
  - rename: "src/utils/helpers.ts -> src/utils/core-helpers.ts"
promptSummary: "A brief summary of the user's request to the LLM."
gitCommitMsg: "feat: Update API endpoint and increase request timeout"
```

## Commands

| Command                     | Alias | Description                                                               |
| --------------------------- | ----- | ------------------------------------------------------------------------- |
| `relay init`                | -     | Initializes RelayCode in the current project directory.                   |
| `relay watch`               | -     | Starts the clipboard watcher to apply patches automatically.              |
| `relay apply <file>`        | -     | Applies a patch from a local file instead of the clipboard.               |
| `relay log`                 | -     | Displays a log of all past transactions (applied and reverted).           |
| `relay revert [id\|uuid]`   | -     | Reverts a transaction. If no ID is given, reverts the latest one.         |
| `relay git-commit`          | -     | Commits the changes from the last transaction using its `gitCommitMsg`. |

**Common Options:**

-   `-y, --yes`: Automatically approve prompts (e.g., `relay watch -y`).

## Configuration

You can configure RelayCode's behavior by editing the `relaycode.config.ts` file. This provides type-safety and auto-completion if you have TypeScript set up.

Here is an example with all available options:

```typescript
import { defineConfig } from 'relaycode';

export default defineConfig({
  // A unique identifier for your project.
  projectId: 'my-awesome-project',

  watcher: {
    // How often to check the clipboard, in milliseconds.
    pollInterval: 1000,
    // The patch strategy to recommend to the LLM in the system prompt.
    preferredStrategy: 'new-unified',
  },

  notifications: {
    // Master switch for all desktop notifications.
    enabled: true,
    // Notify when a patch is successfully applied.
    success: true,
    // Notify when a patch application fails.
    failure: true,
    // Notify as soon as a valid patch is detected on the clipboard.
    patchDetected: true,
  },

  approval: {
    // 'manual': Always ask for confirmation in the terminal.
    // 'auto': Apply changes immediately without confirmation.
    // 'notification': Use desktop notification actions (Approve/Reject).
    mode: 'manual',
    // Timeout for notification-based approval, in seconds.
    timeout: 30,
  },

  // Shell commands to run at different stages of the process.
  commands: {
    // Run before applying a patch. If it fails (non-zero exit code), the patch is aborted.
    // Example: 'bun run lint'
    pre: '',
    // Run after a patch is successfully applied.
    // Example: 'bun run test'
    post: '',
  },

  git: {
    // Automatically commit changes after a patch is successfully applied.
    // Uses the 'gitCommitMsg' from the LLM response.
    autoCommit: false,

    autoBranch: {
      // Automatically create and switch to a new branch for each patch.
      enabled: false,
      // A pattern for the new branch name. Use {summary} as a placeholder
      // for a slugified version of the 'promptSummary'.
      pattern: 'ai/{summary}',
    },
  },
});
```

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
```

---
```yaml
projectId: relaycode
uuid: a3d36b7f-b631-4a4b-84a1-77864f14187e
changeSummary:
  - new: README.md
promptSummary: "create the most comprehensive readme.md"
gitCommitMsg: "docs: Create comprehensive README.md"
```
