As an expert AI programmer, I've analyzed your request to improve the transaction approval workflow and reduce terminal noise. I'll implement a more interactive and user-friendly process. Here's my plan:

1.  **Interactive Approvals**: I will modify the `watch` command's behavior. Instead of placing new patches into a pending queue, it will now prompt you for immediate approval (`yes`/`no`) for each transaction. This applies even when using bulk clipboard mode, where the "bulk" aspect will now refer to gathering patches, not deferring their approval.

2.  **Enhanced `approve-all` Command**: I will overhaul the `approve-all` command to be interactive. It will now present each pending transaction one by one, showing its details and asking for your approval. This allows you to approve or reject specific transactions. A `--yes` flag will be available to preserve the old behavior of approving all transactions at once.

3.  **Quieter Operation**: I'll reduce the noise in the terminal during watch mode by changing the frequent "New clipboard content detected" and "Ignoring" messages from informational logs to debug logs, so they won't appear by default.

4.  **Clearer Feedback**: Upon successful approval of a transaction, I will now display the file path to the newly created transaction record, giving you better visibility into where the state is stored.

Here are the code modifications to achieve this:

### 1. Make `approve-all` Interactive

I'll start by updating the `approve-all` command to accept a `--yes` flag and pass it to the core transaction logic.

```typescript // src/commands/approve-all.ts standard-diff
--- src/commands/approve-all.ts
+++ src/commands/approve-all.ts
@@ -2,8 +2,8 @@
 import { approveAllPendingTransactions } from '../core/transaction';
 import { logger } from '../utils/logger';

-export const approveAllCommand = async (_options: {}) => {
+export const approveAllCommand = async (options: { yes?: boolean }) => {
   const config = await loadConfigOrExit();
-  logger.info('Checking for pending transactions...');
-  await approveAllPendingTransactions(config, process.cwd());
+  logger.info('Reviewing pending transactions...');
+  await approveAllPendingTransactions(config, process.cwd(), options.yes);
 };

```

### 2. Reduce Terminal Noise in Watch Mode

Next, I'll adjust the log levels for the clipboard watcher to make it less verbose during normal operation.

```typescript // src/commands/watch.ts standard-diff
--- src/commands/watch.ts
+++ src/commands/watch.ts
@@ -29,12 +29,12 @@
     };

     const watcherCallback = (content: string) => {
-      logger.info('New clipboard content detected. Attempting to parse...');
+      logger.debug('New clipboard content detected. Attempting to parse...');
       const parsedResponse = parseLLMResponse(content);

       if (!parsedResponse) {
-        logger.info('Clipboard content is not a valid relaycode patch. Ignoring.');
+        logger.debug('Clipboard content is not a valid relaycode patch. Ignoring.');
         return;
       }

```

### 3. Display Transaction File Path on Approval

I will modify the database logic to retrieve and return the path of the transaction file when it's committed.

```typescript // src/core/state.ts standard-diff
--- src/core/state.ts
+++ src/core/state.ts
@@ -2,6 +2,7 @@
 import { logger } from '../utils/logger';
 import { getDb, toStateFile, fromStateFile } from './db';
 import { promises as fs } from 'fs';
+import path from 'path';
 import { getStateDirectory } from './config';

 export const isRevertTransaction = (state: StateFile): boolean => {
@@ -28,15 +29,23 @@
   // ...
 };

-export const commitState = async (cwd: string, uuid: string): Promise<void> => {
+export const commitState = async (cwd: string, uuid: string): Promise<string | null> => {
   const db = getDb(cwd);
   // Also update status from 'pending' to 'committed'
-  await db.update('transactions').set({ status: 'committed' }).where({ uuid });
+  const updated = await db.update('transactions').set({ status: 'committed' }).where({ uuid });
+
+  if (updated.length > 0) {
+    const record = updated[0] as { id: number };
+    const stateDir = getStateDirectory(cwd);
+    // Path construction based on konro's per-record strategy. The double 'transactions' is intentional.
+    // <stateDir>/<dbName>/<tableName>/<recordId>.json
+    const filePath = path.join(stateDir, 'transactions', 'transactions', `${record.id}.json`);
+    return filePath;
+  }
+  return null;
 };

 export const markTransactionsAsGitCommitted = async (cwd: string, uuids: string[]): Promise<void> => {

```

### 4. Implement Core Logic for New Approval Flow

Finally, I'll update the main transaction processing file. This change removes the automatic "pending" status for watched patches, makes `approveAllPendingTransactions` interactive, and refactors bulk processing to use the new interactive approval for each patch.

```typescript // src/core/transaction.ts standard-diff
--- src/core/transaction.ts
+++ src/core/transaction.ts
@@ -148,9 +148,13 @@
   }

   if (approved) {
-    await commitState(cwd, stateFile.uuid);
-    logger.info(`✅ Transaction approved and committed.`);
+    const stateFilePath = await commitState(cwd, stateFile.uuid);
+    logger.info(chalk.green(`✅ Transaction approved and committed.`));
+    if (stateFilePath) {
+      logger.info(`   State file: ${chalk.gray(path.relative(cwd, stateFilePath))}`);
+    }

     if (config.approve.autoGitAdd) {
       await handleAutoGitAdd(config, stateFile, cwd);
@@ -194,22 +198,7 @@
     // Log summary before asking for approval
     logCompletionSummary(parsedResponse.uuid, startTime, operations);

-    // Store transaction as pending for bulk approval
-    if (config.watcher.bulk.enabled) {
-      logger.info(`Transaction ${parsedResponse.uuid} is pending approval.`);
-      await writePendingState(cwd, stateFile);
-      logPendingApprovalMessage();
-      return;
-    }
-
-    // Only ask for individual approval if not in bulk mode
     const { approved } = await handleApproval({
       reason: 'Do you want to apply this patch?',
       stateFile,
@@ -244,55 +233,47 @@
   return pendingTransactionCount;
 };

-export const approveAllPendingTransactions = async (config: Config, cwd: string = process.cwd()): Promise<void> => {
+export const approveAllPendingTransactions = async (config: Config, cwd: string = process.cwd(), yes: boolean = false): Promise<void> => {
   const db = getDb(cwd);
   const pendingStates = (await db.query().from('transactions').where({ status: 'pending' }).all()).map(toStateFile);

   if (pendingStates.length === 0) {
     logger.info('No pending transactions to approve.');
     return;
   }

-  logger.info(`Found ${pendingStates.length} pending transaction(s). Approving all...`);
-
-  for (const tx of pendingStates) {
-    logger.info(`Approving transaction ${tx.uuid}...`);
-    // Re-process the patch, but with `yes: true` to auto-approve everything.
-    await processPatch(config, tx, { cwd, yes: true });
-    // This will re-apply, re-check, and then commit.
+  if (yes) {
+    logger.info(`Found ${pendingStates.length} pending transaction(s). Approving all...`);
+    for (const tx of pendingStates) {
+      await processPatch(config, tx, { cwd, yes: true });
+    }
+    return;
+  }
+
+  logger.info(`Found ${pendingStates.length} pending transaction(s) for review.`);
+  const prompter = createConfirmationHandler({});
+  for (const tx of pendingStates) {
+    logger.info(chalk.cyan(`\n${'-'.repeat(50)}`));
+    const details = formatTransactionDetails(tx, { showOperations: true, showReasoning: true, showSpacing: true });
+    details.forEach(line => logger.info(line));
+
+    const approve = await prompter('Do you want to approve this transaction?');
+    if (approve) {
+      logger.info(`Approving transaction ${tx.uuid}...`);
+      await processPatch(config, tx, { cwd, yes: true });
+    } else {
+      await deletePendingState(cwd, tx.uuid);
+      logger.info(`Transaction ${tx.uuid} was rejected and removed.`);
+    }
   }
 };

 export const processPatchesBulk = async (config: Config, parsedResponses: ParsedLLMResponse[], options?: ProcessPatchOptions): Promise<void> => {
-  const cwd = options?.cwd ?? process.cwd();
-
-  // Filter out invalid patches
-  const validResponses = parsedResponses.filter(r => {
-    if (r.projectId !== config.projectId) {
-      logger.debug(`Ignoring patch for project '${r.projectId}' because it doesn't match current project '${config.projectId}'.`);
-      return false;
-    }
-    return true;
-  });
-
-  if (validResponses.length === 0) {
-    return;
-  }
-
-  logger.info(`Processing ${validResponses.length} patch(es) in bulk...`);
-
-  // Process all patches sequentially but with bulk approval
-  for (const parsedResponse of validResponses) {
-    // For bulk processing, we want to skip individual approvals
-    // and handle approval at the end
-    await _processPatch(config, parsedResponse, { ...options, cwd, skipIndividualApproval: true });
-  }
-
-  // Ask for bulk approval at the end
-  const pendingCount = getPendingTransactionCount(cwd);
-  if (pendingCount > 0) {
-    logger.info(chalk.cyan('--------------------------------------------------'));
-    logPendingApprovalMessage();
+  // In bulk mode, process each patch individually, which will trigger individual approvals.
+  // The "bulk" aspect is about clipboard gathering, not approval.
+  for (const parsedResponse of parsedResponses) {
+    await processPatch(config, parsedResponse, options);
   }
 };

 const handleAutoGitBranch = async (config: Config, stateFile: StateFile, cwd: string): Promise<void> => {

```

These changes will provide a much more interactive and streamlined workflow, directly addressing your feedback.

```yaml
projectId: relaycode
uuid: d892d77d-784f-4d2c-800d-525996f8c7e0
changeSummary:
  - edit: src/commands/approve-all.ts
  - edit: src/commands/watch.ts
  - edit: src/core/state.ts
  - edit: src/core/transaction.ts
promptSummary: The user wants to change the transaction approval flow to be interactive for every transaction, make the terminal output less noisy, and see the path to the transaction file upon approval. They also want the 'approve-all' command to allow for approving specific pending transactions.
gitCommitMsg: >-
  feat(workflow): Overhaul transaction approval to be interactive

  This commit revamps the transaction approval process to be more interactive and user-friendly, and reduces terminal noise.

  - All new transactions from the watcher now prompt for immediate yes/no approval, rather than being queued as pending.
  - The `approve-all` command is now interactive by default, allowing users to review and approve/reject each pending transaction individually. The `--yes` flag can be used to approve all without prompting.
  - Terminal output from the clipboard watcher is now less verbose by default.
  - Upon approving a transaction, the path to its state file is now logged to the console.
```
