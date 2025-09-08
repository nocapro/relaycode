===

multi project multi relay config

####

  beside insertion and deletion stats, also add difference

####

custom instruction with template {}

####

CRUD Aggregating transactions data

#### DONE

implement konro

#### DONE

on multiple before git commit, there are

####

beside rename, add move feature and shell feature... oh for rename and move add example for yaml guide.

####

on failed roll back transaction, we should save the path operations for pruning the context

##########################

#### 8. Live TUI Dashboard
The `watch` command is silent until it finds something. A persistent UI provides confidence and status awareness.

*   **What:** Running `relay watch` or `relay ghost` could open a persistent terminal user interface (TUI) dashboard (e.g., using `blessed.js`).
*   **How it Works:** The dashboard would be a split-pane view showing:
    *   **Top-Left:** `relaycode` status (e.g., "Watching clipboard...", "Processing patch...", "Awaiting approval...").
    *   **Top-Right:** The output of the last linter/test run.
    *   **Bottom:** A scrolling log of recent transactions and events.
*   **Why it's a MUST HAVE:** It dramatically improves the user experience by providing constant, real-time feedback. It makes the tool feel more like an active, integrated part of the developer's environment rather than a background process.

#### 10. Sandboxed Operation & Security Permissions
Executing shell commands or modifying the file system is inherently risky. Trust requires security.

*   **What:** A robust, explicit permissions model for all potentially dangerous operations.
*   **How it Works:** The `relay.config.ts` file becomes the source of truth for permissions.
    ```typescript
    export default defineConfig({
      // ...
      permissions: {
        allowShellCommands: ['npm', 'git', 'npx jest'], // Whitelist of allowed executables
        allowFileSystemWrites: ['src/**', 'test/**'], // Glob patterns for allowed write locations
        allowNetworkAccess: ['api.github.com'], // Whitelist of allowed domains
      }
    });
    ```
    Any operation attempting to violate these rules is blocked by default and requires explicit opt-in.
*   **Why it's a MUST HAVE:** Security is non-negotiable. For `relaycode` to be adopted in any professional or enterprise setting, it must provide strong, clear guarantees about what it can and cannot do. This builds the fundamental trust necessary for widespread adoption.


### 5. Sharable Team Configuration

*   **Problem:** `relaycode` is currently a single-player tool. The transaction history and configuration are local. Teams cannot easily share configurations or enforce team-wide standards.
*   **Proposal:** Allow the `relay.config.ts` to import and extend a shared configuration.
    *   **Shared Config:** A team creates a separate npm package (e.g., `@my-org/relay-config`) that exports a base configuration.
    *   **Project Config:** A developer's local `relay.config.ts` can then import and extend it.
        ```typescript
        // relay.config.ts
        import { defineConfig } from 'relaycode';
        import baseConfig from '@my-org/relay-config';

        export default defineConfig({
          ...baseConfig,
          projectId: 'my-specific-project', // Override specific properties
          patch: {
            ...baseConfig.patch,
            preCommand: 'echo "Running project-specific pre-command"'
          }
        });
        ```
*   **Benefit:** This is the first and most critical step toward making `relaycode` team-ready. It allows for centralized management of linters, commands, approval modes, and API keys, ensuring every developer on the team is working with the same standards and guardrails.

---

#### 4. The "Next Step" Suggester
*   **The Problem:** After completing a task, the developer has to manually decide what's next. The project plan lives outside the development environment.
*   **The Proposal:** After a transaction is successfully committed, `relaycode` can make an intelligent suggestion for the next logical step.
    *   It sends the context of the last transaction (`promptSummary`, `reasoning`, changed files) to the LLM.
    *   The prompt is: "A developer just completed the task '{promptSummary}'. Based on the changes made, what are three likely next steps? For each, provide a `relay ghost` command to start it."
    *   The output would be:
        ```
        Next step suggestions:
        1. Write unit tests for the new 'UserService'.
           => relay ghost "write comprehensive unit tests for src/services/UserService.ts"
        2. Create a UI component to display the user profile data.
           => relay ghost "create a new React component at src/components/UserProfile.tsx that fetches and displays user data using UserService"
        3. Add the new 'UserService' to the dependency injection container.
           => relay ghost "register the new UserService in the main DI container at src/di.ts"
        ```
*   **The Benefit:** This reduces cognitive load and keeps development momentum high. It acts like an AI-powered project manager, constantly guiding the developer towards the most logical next piece of work.

### 2. Project-Specific Guardrails (The "Rulebook")

*   **The Problem:** An LLM might repeatedly make the same mistake specific to a project's conventions (e.g., using a deprecated function, not following a specific import order, using `px` instead of `rem`). The developer has to correct this manually every time.
*   **The Proposal:** Introduce a `.relay/rules.md` file in the project.
    *   Developers can add plain-English rules to this file, for example:
        *   `"All new components must use CSS Modules, not inline styles."`
        *   `"Do not use the 'any' type in TypeScript."`
        *   `"Always use the 'logger.info()' utility instead of 'console.log()'."`
    *   The `relay prompt` command (Idea #1) would automatically inject these rules into the system prompt, prefixing them with "IMPORTANT: You must adhere to the following project-specific rules:".
*   **The Benefit:** This creates a persistent, project-specific "memory" for the LLM. It allows teams to enforce coding standards and best practices automatically, improving code quality and consistency across all AI-generated changes.

---

#### 4. Interactive Patch Staging (The "Human-in-the-Loop" Editor)

*   **The Problem:** Sometimes a patch is 90% correct, but has one or two small errors. The current all-or-nothing model forces the developer to reject the entire patch, go back to the LLM, and ask for a minor fix. This breaks the flow.
*   **The Proposal:** In manual approval mode, if the user presses `e` (for edit) instead of `y` or `n`, `relaycode` will:
    1.  Generate a temporary patch file (`.patch`).
    2.  Open this file in the user's default editor (`$EDITOR`).
    3.  The developer can now **directly edit the diff**, removing incorrect lines, fixing typos, or tweaking the code.
    4.  Upon saving and closing the editor, `relaycode` will apply the **modified** patch and proceed with the transaction.
*   **The Benefit:** This is the ultimate form of developer empowerment. It combines the speed of AI generation with the precision of human oversight, allowing for fine-grained corrections without breaking the workflow. It transforms `relaycode` from a simple patch applier into an interactive staging tool.

---

#### 5. Team-Centric Features & Shared State

*   **The Problem:** `relaycode` is currently a single-player tool. The transaction history and configuration are local. Teams cannot easily share configurations or see a collective history of AI-driven changes.
*   **The Proposal:** Add a new configuration section for team collaboration.
    *   **Shared Config:** Allow the `relay.config.ts` to `import` a shared configuration from a URL or a separate package, making it easy to enforce team-wide standards for `linter`, `preCommand`, etc.
    *   **Remote State Storage:** Introduce a `state.storage` option in the config.
        *   `"local"` (default): As it is now.
        *   `"git"`: `relaycode` would commit the `.relay/transactions` directory to a dedicated, orphaned branch (e.g., `relay-state`). This creates a shared, auditable history of all AI changes across the team, enabling the `relay stats` command to provide team-wide insights.


Excellent! You're clearly thinking about how to evolve `relaycode` beyond its current state. Here are more ideas, categorized into themes, that push the boundaries from a "developer assistant" to an "autonomous agent" and an "integrated development platform."

---

### Theme 1: Towards Autonomous Operation

These ideas reduce the developer's role from a constant "pilot" to an "air traffic controller," only intervening when necessary.

#### 1. Multi-Step Transaction Chains
*   **The Problem:** Comx`plex tasks (e.g., "add a new API endpoint, create a service to call it, and a UI component to display the data") are too large for a single, reliable patch.
*   **The Proposal:** Allow the LLM to output a *plan* of sequential, dependent transactions.
    *   **Syntax:** The YAML block could include a `plan` array.
        ```yaml
        plan:
          - description: "Add 'axios' dependency to package.json"
            patch: ...
          - description: "Create a new API service at 'src/services/api.ts'"
            patch: ...
          - description: "Update 'src/components/DataDisplay.tsx' to use the new service"
            patch: ...
        ```
    *   **Execution:** `relaycode` would execute each step one by one. After each step, it runs the `linter` and `postCommand`. If a step fails, it rolls back *only that step* and uses the "Automated Correction Prompting" logic to ask the LLM for a fix *for that specific step*, providing the context of the successful previous steps.
*   **The Benefit:** Unlocks the ability to reliably automate entire feature implementations, not just small code changes. It creates a robust, self-correcting workflow for complex tasks.


#### 3. Proactive Dependency & Environment Management
*   **The Problem:** An LLM might add code that requires a new dependency or an environment variable but forget to mention it.
*   **The Proposal:** Before applying a patch, `relaycode` statically analyzes the diff.
    *   If it sees `import ... from 'new-library'`, it checks `package.json`. If missing, it prompts: "This patch requires 'new-library'. Install it? (Y/n)". If yes, it runs the install and adds it to the transaction snapshot.
    *   If it sees `process.env.NEW_API_KEY`, it checks for a `.env` file and prompts: "This patch uses a new environment variable 'NEW_API_KEY'. Please add it to your .env file before continuing."
*   **The Benefit:** The tool anticipates and prevents entire classes of runtime errors, making the development process smoother and more resilient.

---

### Theme 2: Deep Codebase Intelligence

These ideas transform the transaction log from a simple history into a rich, queryable database for project insights.

#### 4. Semantic Log Search (`relay search`)
*   **The Problem:** `relay log` is chronological. Finding a specific change requires scrolling or knowing the UUID.
*   **The Proposal:** A new `relay search <query>` command that uses an LLM to search the transaction history.
    *   `relay search "when did we add the analytics tracking"`
    *   `relay search "show me all changes to the auth system"`
    *   **Execution:** The command would collect all `promptSummary` and `reasoning` fields from the transaction logs, feed them to an LLM, and ask it to return the UUIDs of the most relevant transactions.
*   **The Benefit:** Turns your transaction history into a semantic, natural-language-searchable knowledge base of your project's evolution.

#### 5. Codebase Archeology and Blame (`relay blame <file>`)
*   **The Problem:** `git blame` tells you *who* last touched a line, but not *why*.
*   **The Proposal:** An enhanced `relay blame <file>` command.
    *   For each line in the file, it would find the last `relaycode` transaction that modified it.
    *   It would then display the line alongside the `uuid`, `promptSummary`, and a snippet of the `reasoning` for that change.
*   **The Benefit:** Provides deep, intent-based context for every line of AI-generated code. It answers the "why was this code written?" question far better than Git alone can.

---


#### VERIFY

min max file changes instruction for llm in single transaction configurable through config

####

multiple gitCommitMsg config

####

retry certain part of yaml transaction

####

relay git commit -i -y : context initial git commit prompt. when we have many git unstaged/uncommited of relay yaml... by default, we should take the earliest yaml commit message

#### VERIFY

insertion and deletion count in yaml transaction

####

relay.config file: save .relay state to git


#### make the codebase highly radically significantly DRY for super less code. all without causing features breaks and regressions

#### all-or-nothing vs

#### Automated Correction Prompting (The "Feedback Loop")

*   **Problem:** When a patch fails the linter or tests, the developer must manually copy the error message, switch back to the LLM, and construct a new prompt to ask for a fix. This is a slow and repetitive part of the workflow.
*   **Proposal:**
    1.  When a transaction fails (`postCommand` error, linter failure), `relaycode` doesn't just roll back. It enters a "correction" state.
    2.  It automatically captures the `stdout` and `stderr` from the failed command.
    3.  It then constructs a new, optimized prompt and copies it to the clipboard for the user.
        *   The prompt would be structured like: "The following patch was attempted but failed. **Reasoning:** `{original reasoning}`. **Patch:** `{original patch}`. **Error:** `{captured error log}`. Please analyze the error and provide a corrected patch."
    4.  The developer's next action is simply to paste this perfectly-formed correction prompt into the LLM.
*   **Benefit:** This closes the feedback loop between the tool and the LLM, making the process of fixing faulty patches nearly instantaneous and removing tedious manual work for the developer.

#### Analytics & Project Insights (`relay stats`)

*   **Problem:** The transaction history in the `.relaycode` directory is a rich dataset of the project's evolution via AI, but it's currently unused.
*   **Proposal:** Create a `relay stats` command that analyzes the transaction log to provide insights.
    1.  **Code Hotspots:** Identify which files are most frequently modified by the LLM. This can indicate areas of the codebase that are complex, brittle, or ripe for a major refactor.
    2.  **AI Reliability Score:** Calculate metrics like:
        *   Transaction success rate (committed vs. rolled back).
        *   Approval rate (manual approvals vs. rejections).
        *   Average error count post-apply.
    3.  **Strategy Effectiveness:** Show which patch strategies (`replace`, `new-unified`, etc.) are most commonly used and which ones lead to the most successful commits.
    *   **Output:** This could generate a simple terminal report or even a `stats.html` file with charts, giving the team a dashboard to understand how AI is impacting their codebase.

#### Plugin Architecture
*   **Problem:** All functionality is currently hard-coded. Adding new features or a different diffing engine requires modifying the core.
*   **Proposal:**
    *   Refactor the core logic to emit events (e.g., `onPatchReceived`, `beforeApply`, `afterCommit`, `onRollback`).
    *   Create a plugin system where a user can install a package (e.g., `relay-plugin-slack`) and add it to their config.
    *   The plugin would register listeners for these events. The Slack plugin could listen for `afterCommit` and `onRollback` to send notifications. A custom diffing plugin could register a new patch strategy.

#### Intelligent Pre-Command Execution
*   **Problem:** The `preCommand` runs for every transaction, which might be unnecessary.
*   **Proposal:**
    *   Allow the `preCommand` in the config to be an object that maps file extensions to commands.
        ```json
        "preCommand": {
          "*.ts": "bun check",
          "*.py": "python -m mypy ."
        }
        ```
    *   Before running a transaction, `relaycode` would inspect the file extensions of the affected files and only run the relevant commands.

#### Interactive Log and Enhanced Undo/Redo
*   **Problem:** `undo` only reverts the very last transaction. The `log` command is read-only.
*   **Proposal:**
    1.  **Interactive `log`:** Enhance the `log` command to show a numbered list of recent transactions.
    2.  **Targeted `undo`:** Allow `undo` to take a transaction UUID or the number from the interactive log (`relay undo <uuid>` or `relay undo 3`).
    3.  **`redo` Command:** Since the `undo` command cleverly moves the undone transaction to a `undone/` directory, you can easily implement a `redo` command. It would find the latest file in `undone/`, move it back to the main state directory, and re-apply the snapshot from *before* that transaction (which is stored in its `snapshot` property).


#### Partial Patch Application
*   **Problem:** Sometimes an LLM response contains multiple, independent changes in different files. One change might be good, while another has a bug. Currently, it's all-or-nothing.
*   **Proposal:** In manual approval mode, allow the user to select which file operations from a patch to apply.
    *   When approval is requested, list each file operation with a checkbox (using a library like `inquirer`).
    *   The user can select the operations they want.
    *   The transaction is then processed with only the approved operations, and the state file is saved accordingly.

#### Improve Windows Clipboard Handling
*   **Problem:** The `src/core/clipboard.ts` file contains custom logic to copy a Windows executable to a local `fallbacks` directory. This can be fragile, might be flagged by antivirus software, and adds complexity.
*   **Proposal:**
    *   Investigate if newer versions of `clipboardy` or alternative cross-platform clipboard libraries have improved native Windows support, potentially removing the need for the bundled `.exe`.
    *   If the executable is still necessary, consider adding it to the `files` array in `package.json` and using a more robust method to locate it within the `node_modules` directory rather than copying it.



#### ✅ Apply Patch from File (`relay apply <path-to-patch-file>`)
-   **What:** A new command to process a patch saved in a local file instead of watching the clipboard.
-   **Why:**
    1.  **Decouples from Clipboard:** Enables use cases where copying/pasting is inconvenient (e.g., long-term storage of patches, scripted automation).
    2.  **Testability:** Makes it vastly easier to write reliable end-to-end tests for the entire transaction pipeline.
    3.  **Offline Use:** Allows developers to save an LLM response and apply it later.




#### New Operation: Shell Command Execution
-   **What:** Introduce a new code block type for executing arbitrary shell commands as part of a transaction.
-   **Why:** Unlocks a new class of automation. The LLM could not only provide code but also perform related setup tasks, such as installing a dependency (`npm install new-package`), running a database migration, or scaffolding a new component with a CLI.
-   **Syntax Idea:**
    ```sh // {run-command}
    npm install zod
    ```
-   **Implementation:** This would require careful security considerations. It should be off by default and enabled via a config flag (`allowShellCommands: true`) with a prominent warning. The snapshot/rollback logic would need to handle this new operation type (e.g., by attempting to run a corresponding "undo" command if provided).




#### Per-Directory Configuration Overrides
-   **What:** Allow specifying configuration overrides for certain file paths or globs within `relaycode.config.json`.
-   **Why:** A single global configuration is often insufficient for a large monorepo. A team might want a stricter `linter` and `approval: 'no'` for core library code (`packages/core/**`) but a more lenient policy for documentation (`docs/**`).
-   **Syntax Idea:**
    ```json
    {
      "projectId": "my-monorepo",
      "linter": "bun test",
      "overrides": [
        {
          "include": ["packages/core/**/*.ts"],
          "linter": "bun tsc --noEmit --strictest",
          "approval": "no"
        },
        {
          "include": ["docs/**/*.md"],
          "linter": ""
        }
      ]
    }
    ```
