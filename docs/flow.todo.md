lib user reporting this, so please fix the problem also guardrail with e2e test cases. give me transaction in two phase. now give me the first phase


Pre-flight summary:
Lines changed: +25, -0 (25 total)
Checks completed in 111.28ms
  - Final linter error count: 0
Manual approval mode is enabled.
Notification timed out or was dismissed. Please use the terminal to respond.
Changes applied. Do you want to approve and commit them? (y/N)
y
Rolling back changes: ENOENT: no such file or directory, rename '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json.1757341782787.tmp' -> '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json'
Rolling back changes: ENOENT: no such file or directory, rename '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json.1757341782787.tmp' -> '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json'
  - Files restored to original state.
  - Files restored to original state.
Rolling back changes: ENOENT: no such file or directory, rename '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json.1757341782805.tmp' -> '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json'
Fatal: Could not clean up pending state for e6d1c44e-128f-4edc-b6a2-61d0f8ff5d56: ENOENT: no such file or directory, rename '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json.1757341782805.tmp' -> '/home/realme-book/Project/code/relaycode/.relay/db/transactions/_meta.json'
--------------------------------------------------
Watching for next patch...
  - Files restored to original state.
↩️ Transaction a6972e42-7360-449e-b2d2-8255df93a623 rolled back.
--------------------------------------------------
Watching for next patch...
↩️ Transaction d1965a39-2d1e-450f-a316-f682f939330a rolled back.
--------------------------------------------------
Watching for next patch...

===

1. bug: after rolled back transaction, stopping the relay watch, then start relay watch again, the same transaction from clipboard got applied again

rolled back transaction should be marked as rolled back in status

2. default db format should be yaml, not json.
3. the correct transaction path should be .relay/transaction not .relay/db/transaction
4. you should guardrails above behaviours using e2e test cases

give me transaction in three phase. now give me the first phase

===

create path sanitizer feature, example

packages/relaycode-core/src/patch.ts:131:64 - error TS2339: Property 'error' does not exist on type 'never'.

131     if (firstError) return { success: false, error: firstError.error };
                                                                   ~~~~~

src/commands/revert.ts:98:74 - error TS2322: Type 'string | undefined' is not assignable to type 'string'.
  Type 'undefined' is not assignable to type 'string'.

98             inverse_operations.push({ type: 'write', path: snapshotPath, content, patchStrategy: 'replace' });
                                                                            ~~~~~~~

src/core/transaction.ts:74:53 - error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.

74         else fsPromises.push(writeFileContent(path, newContent, cwd));
                                                       ~~~~~~~~~~


Found 3 errors.

error: "tsc" exited with code 1 (SIGHUP)

===

make the codebase radically DRY less code no redundancy without causing regression or fail tests

===

beside insertion and deletion stats, also add difference count

===

update system prompt based on latest multi-diff-apply

===

   ```yaml
   projectId: test-project
   uuid: 267e8262-f32c-4672-bd69-c838d26f5607
   changeSummary: [{"new":"file1.ts"}]
   gitCommitMsg: "feat: first commit"
   ```

   that is look like a json than yaml. refactor

=== DONE

on multiple transactionsbefore git commit, user want relay git commit , but should auto merge all commit message into one from many transactions. also add test cases about that git commit

===

split relaycode test fixtures to multiple files just like in apply-multi-diff... also add more cases to battle test

===

refactor relaycode , because apply-multi-diff is only have 2 strategy and no new unified or something naming, only StandardDiff and SearchReplace.. see its readme.md

===

refactor relaycode to use relaycode-core , and relaycode-core should use apply-multi-diff. which one first? relaycode-core first todo?

give me transaction in 3 phase. now give me the first phase

===

understand docs/separation.report.md well, then execute the implementation of separating relaycoder core to another npm package.

===

analayse about `separating relaycoder core to another npm package` . then give me the concise report. do not give me any code.
