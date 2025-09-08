Code changes rules

1. make sure to isolate every files code block with ```typescript // {filePath} ...{content} ```
2. only write new/affected files changes of a codebase. ignore unnaffected
3. Always write full source code per file
4. if you need to delete file, use ```typescript // {filePath} ↵ //TODO: delete this file ```

_______________________

1. the name should be relaycode
2. well CLI ing.. is tiring.

so

I want the program is as simply installed globally.
then, when programmer opening project in editor and open terminal, 
they simply type , 

`relay --init`

it will auto; 
    2.1. create relaycode.config.json for the project
    2.2. auto prepare initial state on .relaycode dir (for state management especially )
    ```
the config contain
    - projectId : autofill by taking project root dir name
    - approval : yes/no
    - approvalOnErrorCount: for approval yes, how many linter error addition needed to ask for approval 
    - preCommand :
    - postCommand : 
    - linter : custom command, like  `bun tsc -b --noEmit`. if empty, then no need linter checking
    - clipboardPoolInterval :
    ```
    2.3 the program tell user to fill their llm system prompt with following

    ```
    Code changes rules 1-6

1. make sure to isolate every files code block with
  ```typescript // {filePath} 
  ↵
    // START
    ↵
  {content}
  ↵
    // END
  ```
2. only write new/affected files changes of a codebase. ignore unnaffected
3. Always write full source code per file
4. add {your step reasoning} before code block as you progresses
5. if you need to delete file, use 

```typescript // {filePath} 
↵ 
//TODO: delete this file 
↵
```
6. always add below yaml at the end of your response

```yaml
projectId: todo-app <- use this exatcly
uuid: (random uuid)
changeSummary:
  - edit src/main.ts
  - edit src/main.tsx
  - new src/main.ts
  - delete src/main.ts
  - .... (so on)
```
    
    ```

after 2.1 & 2.2 above, the program always watching clipboard for trigger content that contains this yaml schema 

```yaml
projectId: projectname
uuid: a8098c1a-f86e-11da-bd17-00112444be1e
changeSummary:
  - edit src/main.ts
  - edit src/main.tsx
  - new src/main.ts
  - delete src/main.ts
```

if triggered, then applying changes automatically
so the user doesnt need to write md file. 

- the apply rule are follows;
    1. if uuid based on .relaycode says has ever been applied. then it skip
    2. if contain `//TODO: delete this file ` it really delete the file automatically
    3. also it auto delete //START line and //END line and // {filePath} so the file code clean
    4. if user decide to revert. then everything revert at previous state based on .relaycode


 I want the program keep ongoing . I also want the .relaycode files in yaml format along with  snapshots and {your step reasoning}, with readable summary at beginning of files. no daemon please


 ________________________________________________


 create the relaycode project using above requirements by following Code changes rules 887 and
- use bun.sh
- e2e type safety
- HOF
- immutability
- no any/unknown type.


_____________________________________________

which are from below requirement has not met?

________________________________________________

1. while addressing fail tests, always have a mindset that there must be main program core error to fix rather than make test less strict!!
2. Test cases should be isolated and clean no left over even on sigterm
3. Test should use bun:test describe,it,afterAll,beforeAll,afterEach,beforeEach without mock
4. test cases should fully verify implementation
5. Test cases should match expected requirements
6. Do not create test of tricks, simulation, stub, mock, etc. you should produce code of real algorithm
7. Do not create any new file for helper,script etc. just do what prompted.
8. test files should only be located outside src at test/unit or test/e2e
9. test should use/modify test/test.util.ts for reusability


______________________________________________

add more tests to cover below make sure to follow TEST RULE 2352 and Code changes rules 887

Based on the requirements for `relaycode`, here is a comprehensive list of test items that should be covered.

### `relay --init` Command Tests
- Should create `relaycode.config.json` with correct default values.
- Should correctly detect `projectId` from `package.json`.
- Should fall back to directory name for `projectId` if `package.json` is not found.
- Should create the `.relaycode` state directory.
- Should create a `.gitignore` file and add `.relaycode/` if one doesn't exist.
- Should append `.relaycode/` to an existing `.gitignore` file.
- Should not add a duplicate `.relaycode/` entry to `.gitignore`.
- Should output the correct system prompt instructions, including the detected `projectId`.

### `relay watch` Core Workflow Tests
- Should detect and process a valid patch from the clipboard.
- Should ignore clipboard content that does not contain a valid patch format.
- Should ignore patches with a non-matching `projectId`.
- Should ignore patches with a duplicate `uuid` that has already been processed.
- Should correctly create new files as specified.
- Should correctly modify existing files.
- Should correctly delete files.
- Should automatically create necessary parent directories for new files.
- Should store reasoning, operations, and snapshot in the final state `.yml` file.

### Transactional and Rollback Tests
- Should create a `.pending.yml` file during the staging phase.
- Should successfully rename `.pending.yml` to `.yml` upon successful approval.
- Should restore all modified files to their original state on user rejection.
- Should delete any newly created files on user rejection.
- Should clean up newly created empty directories on user rejection.
- Should not delete directories that contained other files prior to the transaction.
- Should delete the `.pending.yml` file after a successful rollback.
- Should trigger a rollback if the `linter` fails and manual approval is denied.
- Should trigger a rollback if a `postCommand` fails.

### Configuration (`relaycode.config.json`) Tests
- Should auto-approve a change when `approval` is "yes" and linter conditions are met.
- Should always require manual approval when `approval` is "no".
- Should auto-approve if linter errors do not exceed `approvalOnErrorCount`.
- Should require manual approval if linter errors exceed `approvalOnErrorCount`.
- Should correctly execute `preCommand` before taking a snapshot or applying changes.
- A failing `preCommand` should abort the transaction before any files are touched.
- Should correctly execute `postCommand` after applying changes but before final commit.
- Should skip linter checks if the `linter` command is an empty string.

### Parser and Data Processing Tests
- Should correctly extract code content between `// START` and `// END` markers.
- Should strip `// {filePath}`, `// START`, and `// END` markers from the final file content.
- Should correctly identify the `//TODO: delete this file` directive for deletion operations.
- Should collect all text outside of code blocks and the final YAML block as `reasoning`.
- Should correctly parse `projectId`, `uuid`, and `changeSummary` from the final YAML block.
- Should handle file paths with spaces, dots, and special characters.
- Should handle empty content within a code block.
- Should gracefully ignore malformed code blocks (e.g., missing markers).
- Should gracefully ignore malformed or missing final YAML block.

### Error Handling and Crash Safety Tests
- Should handle filesystem permission errors during file write or directory creation.
- Should continue watching after encountering and rejecting an invalid patch.
- On startup, should ignore any orphaned `.pending.yml` files from a previous crashed session.


____________________________________________________

before applying, should compare parsed file with llm summary of changeSummary (filecount, what files) if not match, changeSummary from llm is the single source of truth for verification if the program confused why there are another invalid codeblock


_____________________________________________


that relay is using whole text applier strategy right? what if we supercharge it with multipe strategy with that above diff-apply api lib?? (no need to recreate, just import lib of (bun add diff-apply))

so the llm can give  patchStrategy value on every fenced codes  ```typescript // {filePath} {patchStrategy}

_________________________________________________

why ```typescript // {src/components/UserProfile.tsx} new-unified contains curly {} in path? should be without it

___________________________________________


implement. 

#### New Operation: File Rename/Move
-   **What:** Add a dedicated `rename` operation.
-   **Why:** While a rename can be accomplished with a `delete` and a `write`, a dedicated operation is cleaner and more explicit. It allows the state management and snapshot system to track file identity more accurately, leading to more robust rollbacks.
-   **Syntax Idea:**


-   **Renaming/Moving a file**:
    \`\`\`typescript // path/to/old-file.ts
    //TODO: rename to path/to/new-file.ts
    \`\`\`
    \`\`\`typescript // "path/to/My Old Component.ts"
    //TODO: rename to "path/to/My New Component.ts"
    \`\`\`


    ________________________________

    PS C:\Users\Realme Book\project\diff-apply> bun add -g relaycode
bun add v1.2.16 (631e6748)

installed relaycode@1.0.2 with binaries:
 - relay

67 packages installed [6.69s]
PS C:\Users\Realme Book\project\diff-apply> relay
Usage: relay [options] [command]

A developer assistant that automates applying code changes from LLMs.

Options:
  -h, --help      display help for command

Commands:
  init            Initializes relaycode in the current project.
  watch           Starts watching the clipboard for code changes to apply.
  help [command]  display help for command
PS C:\Users\Realme Book\project\diff-apply> relay init
Initializing relaycode in this project...
node:path:478
      validateString(arg, 'path');
      ^

TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received an instance of Object    
    at Object.join (node:path:478:7)
    at findConfig (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:11032:27)
    at Command.initCommand (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:11699:24)
    at Command.listener [as _actionHandler] (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:866:20)
    at file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:1334:67
    at Command._chainOrCall (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:1269:14)
    at Command._parseCommand (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:1334:29)
    at file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:1203:29
    at Command._chainOrCall (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:1269:14)
    at Command._dispatchSubcommand (file:///C:/Users/Realme%20Book/.bun/install/global/node_modules/relaycode/dist/cli.js:1199:27) {
  code: 'ERR_INVALID_ARG_TYPE'
}

Node.js v22.14.0


________________________________________

implement preferred strategy add to json config. including `replace` strategy, default is let llm decide. this config will affect init system prompt to give to llm, so we safe certain tokens by letting llm know only the strategy given. the prompt should be given at relay watch.

so now, the relay init only show instructions and guides to adjust config.json then ask user to relay watch . so relay init, not showing prompt at all 

______________________________________

while relay watch is running, user modifying config will trigger refresh on relay watch

___________________________________________

add test cases about below features to verify implementation

- relay undo
- relay apply
- relay log
- relay revert
- File Rename/Move
- Automatic Patch Strategy Detection:  Relaycode could inspect its content to infer the strategy.

__________________________________________________

add test cases about relay undo to verify implementation