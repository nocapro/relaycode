#### ✅ DONE: add version to relay
#### ✅ DONE: Transaction rolleed back still not really making all affected files to original state especially the failed file.
#### ✅ DONE: shorhands commands not working, also commands without -- not working.
#### ✅ DONE: ms took should be shown before asking approval
#### ✅ DONE: system notification should fired on matched project id, not on valid patch format
#### ✅ DONE: it still asking for approval on approval off in config setup
#### ✅ DONE uuid that has already in undone should not be reprocess

#### ✅ DONE: History and Targeted Revert (`relay log` & `relay revert <uuid>`)
-   **What:**
    -   `relay log`: A command to list all committed transactions from the `.relaycode` directory, showing UUID, timestamp, and reasoning/change summary.
    -   `relay revert <uuid>`: An extension of `undo` that allows reverting a *specific* past transaction by its UUID.
-   **Why:** Provides a complete audit trail of AI-driven changes made via Relaycode, functioning as a lightweight, operation-specific version control system. This is crucial for tracking how a codebase evolved and for surgically undoing specific changes without affecting subsequent ones.


#### ✅ DONE : Undo Last Transaction (`relay undo`)
-   **What:** A new CLI command, `relay undo`, that reverts the last successfully committed transaction.
-   **Why:** Provides a critical safety net. If a developer accepts a change and only later realizes it was a mistake, this offers a one-command escape hatch without needing to manually revert files or rely on Git.
-   **Implementation:** The command would find the most recent `.yml` file in the `.relaycode` directory, read its `snapshot` data, and call the existing `restoreSnapshot` function. The corresponding `.yml` file would then be deleted or moved to an `undone/` subdirectory.

#### ✅ DONE: New Operation: File Rename/Move
-   **What:** Add a dedicated `rename` operation.
-   **Why:** While a rename can be accomplished with a `delete` and a `write`, a dedicated operation is cleaner and more explicit. It allows the state management and snapshot system to track file identity more accurately, leading to more robust rollbacks.
-   **Syntax Idea:**
    ```json // {rename-file}
    {
      "from": "src/old-name.ts",
      "to": "src/new-name.ts"
    }
    ```


#### ✅ DONE: System-Level Notifications
-   **What:** Use a cross-platform library (like `node-notifier`) to send system notifications at key moments.
-   **Why:** The `watch` command requires the developer to keep an eye on the terminal. System notifications provide crucial feedback even when the terminal is not in focus.
    -   **On new patch detected:** "Relaycode: New patch detected for project `my-app`."
    -   **On manual approval required:** "Relaycode: Action required to approve changes for `my-app`."
    -   **On success/failure:** "Relaycode: Patch `uuid` applied successfully." or "Relaycode: Patch `uuid` failed and was rolled back."


#### ✅ DONE Automatic Patch Strategy Detection
-   **What:** If a patch strategy is omitted in a code block, Relaycode could inspect its content to infer the strategy.
-   **Why:** Reduces the verbosity and "brittleness" of the LLM prompt. The LLM can focus on generating the correct content, not just the correct syntax.
-   **Heuristics:**
    -   If the content starts with `--- a/` and `+++ b/` and contains `@@ ... @@`, treat it as `new-unified`.
    -   If it contains `<<<<<<< SEARCH`, treat it as `multi-search-replace`.
    -   Otherwise, default to `replace`.


#### ✅ DONE:
1. change config naming from relaycode.config.json/ts to relay.config.json/ts
2. change .relaycode dir to .relay
3. all yaml transaction should be in .relay/transactions/{uuid}.yaml also undone in .relay/transactions/undone

#### ✅ DONE: separate file system ops in another file for differentiate concerns

#### ✅ DONE: should be no type of any/unknown

#### ✅ DONE: add -y tag in `relay git commit y` also add y to more necessary another commands

#### VERIFY: useful action buttons in system notifications


#### DONE: do not fire notification on skipped uuid

Starting clipboard watcher (polling every 2000ms)
New clipboard content detected. Attempting to parse...
Valid patch detected for project 'relaycode'. Processing...
Skipping patch: uuid 'a6311de1-b844-4861-9c8e-a9d70de792f4' has already been processed.


#### ✅ DONE: relay git commit

#### ✅ DONE: make sure clipboard is working in linux

#### ✅ DONE: should be abble to parse yaml without codefence

#### ✅ DONE: user prompt summary in yaml for .relaycode log

#### ✅ DONE: words level chalk

#### ✅ DONE: make the codebase highly DRY for super less code. refactor algorithm to be more efficient. all without causing features breaks and regressions

#### ✅ DONE: made many changes , see in command `relay log` . then make sure the program is programmatic api friendly. because I think too many un exposed api necessary

#### ✅ DONE: should not patch write codefenced code which without path info. because sometimes it is for example

#### ✅ DONE: beside json, should also can produce relay.config.ts for best auto intellisense linting

#### ✅ DONE: make relay.config.json content proper. like categorize objects

#### ✅ DONE: watch config can be configurable to on or off in relaycode.config.json because watch looping happens when tying to patch relaycode.config.json

#### ✅ DONE: implement **What:** Introduce a configuration option to enable Git-aware operations. When enabled, each transaction would automatically create a new branch.
- `autoGitBranch`:  true false for on off
    -   `gitBranchPrefix`: user can customize wether it is {gitCommitMsg} or it is {uuid} .
    -   **On Successful transaction:** `git checkout -b relay/gitCommitMsg`.

#### ✅ DONE: some cli aliases just doesnt work like relaycode -v etc

#### ✅ DONE: do not show reasoning in relay log cli command. replace by showing promptSummary

#### ✅ DONE: this field in .relaycode log should be placed below created date
gitCommitMsg:
promptSummary:
