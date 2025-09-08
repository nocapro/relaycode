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
