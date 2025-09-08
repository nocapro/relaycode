
# REQUIREMENT: `relaycode`

`relaycode` is a developer assistant that lives in your terminal, automating the tedious and error-prone process of applying code changes delivered by Large Language Models (LLMs). It acts as a smart, safe, and reversible "patching" tool that works directly from your clipboard.

### 🚀 The Core Concept

Instead of manually creating files, copying and pasting code snippets, and managing changes from an LLM response, you simply:
*   [ ] Run `relay watch` in your project's terminal.
*   [ ] Copy the entire response from your configured LLM.
*   [ ] `relaycode` automatically detects, validates, and applies the changes. It intelligently decides whether to auto-approve the patch or ask for your confirmation based on code quality.

---

### ⚙️ Installation & Setup

#### `relay --init`

This command initializes `relaycode` in your project. It creates the necessary configuration, sets up the state directory, updates `.gitignore`, and most importantly, provides you with the exact instructions for your LLM.

*   [ ] **Project ID Detection**: When creating `relaycode.config.json`, the `projectId` is automatically set. `relaycode` first tries to read the `name` field from a `package.json` file in the project root. If `package.json` is not found, it defaults to using the name of the project's root directory.

##### The LLM System Prompt Instructions

[ ] The `relay --init` command will output the following text. You **must** set this as a system prompt or custom instruction for your LLM to ensure compatibility.

```plaintext
✅ relaycode has been initialized for this project.

IMPORTANT: For relaycode to work, you must configure your AI assistant.
Copy the entire text below and paste it into your LLM's "System Prompt"
or "Custom Instructions" section.
---------------------------------------------------------------------------

Code changes rules 1-6:

1. Make sure to isolate every file's code block with:
    ```typescript // {filePath}
    // START

    {content}

    // END
    ```

2. Only write new or affected files. Ignore unaffected files in the codebase.

3. Always write the FULL source code for each file. Do not use placeholders or comments like "... rest of the code".

4. Add your step-by-step reasoning in plain text before each code block as you progress.

5. If you need to delete a file, use this exact format:
    ```typescript // {filePath}
    //TODO: delete this file
    ```

6. ALWAYS add the following YAML block at the very end of your response. Use the exact projectId shown here. Generate a new random uuid for each response.

    ```yaml
    projectId: your-project-name
    uuid: (generate a random uuid)
    patchStrategy: 
    changeSummary:
      - edit: src/main.ts
      - new: src/components/Button.tsx
      - delete: src/utils/old-helper.ts
      - .... (so on)
    ```
---------------------------------------------------------------------------
You are now ready to run 'relay watch' in your terminal.
```

#### `relay watch`

This is the main command that runs the "always-on" clipboard monitoring service.

---

### 🔧 Configuration (`relaycode.config.json`)

[ ] All behavior is controlled by this file.

```json
{
  "projectId": "your-project-name",
  "clipboardPollInterval": 2000,
  "approval": "yes",
  "approvalOnErrorCount": 0,
  "linter": "bun tsc --noEmit",
  "preCommand": "",
  "postCommand": ""
}
```

---

### ✨ Data Processing: From Clipboard to Clean Code

This section details how `relaycode` parses the raw text from the clipboard and transforms it into clean, actionable operations. This is the "magic" that bridges the LLM's formatted output and your actual source files.

The parser performs four main tasks on the clipboard content:

*   [ ] **Process Code Blocks for Writing**:
    *   [ ] It finds each fenced code block: ` ```...``` `.
    *   [ ] It reads the file path from the comment on the opening line: `// {filePath}`.
    *   [ ] It looks for the `// START` and `// END` markers inside the block.
    *   [ ] **The content *between* these two markers is extracted as the clean code.**
    *   [ ] The markers themselves (`// START`, `// END`) and the file path comment (`// {filePath}`) are **completely stripped** and are not written to the final file.

*   [ ] **Process Code Blocks for Deletion**:
    *   [ ] If the parser finds a code block where the *entire content* is the special directive `//TODO: delete this file`, it registers a `delete` operation for the associated `{filePath}`. This block's content is never written anywhere.

*   [ ] **Capture Reasoning**:
    *   [ ] Any and all text that is **not** inside a fenced code block and **not** part of the final YAML block is collected. This unstructured text becomes the `reasoning` array in the state file, providing human-readable context for the change.

*   [ ] **Parse Control YAML**:
    *   [ ] The final `yaml` block is parsed to extract the critical control metadata: `projectId`, `uuid`, and `changeSummary`. This data is used for validation and logging. The YAML block itself is then discarded.

[ ] A key feature of the execution step is **automatic directory creation**. If a file operation targets `src/new/feature/component.ts` and the `new/feature` directories do not exist, `relaycode` will create them automatically.

---

### 🧠 The Transactional Workflow

`relaycode` is built to be crash-safe by relying entirely on the filesystem for its state.

*   [ ] **Detect & Validate**: The `watch` process scans the clipboard. When it finds a patch with a matching `projectId`, it checks the `.relaycode/` directory to ensure the patch's `uuid` is not a duplicate.

*   [ ] **Stage (Create `.pending.yml`)**: Before touching a single project file, `relaycode` runs the parser described above. It then:
    *   [ ] Runs the `preCommand`.
    *   [ ] Runs the initial `linter` check to get a baseline error count.
    *   [ ] **Takes a Snapshot**: It records the original state of every file that will be affected.
    *   [ ] **Commits the Plan**: It writes the full plan—including parsed operations, AI reasoning, and the "before" snapshot—to a temporary state file: `.relaycode/{uuid}.pending.yml`.

*   [ ] **Execute**: The tool reads the clean operations from the `.pending.yml` file and applies them to the project's source code.

*   [ ] **Verify & Decide**:
    *   [ ] Runs the `postCommand`.
    *   [ ] Runs the final `linter` check.
    *   [ ] Based on configuration (`approval`, `approvalOnErrorCount`), it decides to either **auto-approve** the change or **ask the user for manual approval**.

*   [ ] **Commit or Rollback**:
    *   [ ] **On Approval**: The transaction is finalized by renaming the state file: `.relaycode/{uuid}.pending.yml` → `.relaycode/{uuid}.yml`.
    *   [ ] **On Rejection/Failure**: The tool uses the snapshot in the `.pending.yml` file to restore every file to its exact original state. Afterwards, the `.pending.yml` file is deleted, leaving the project pristine.

---

### 📂 State Management (`.relaycode/` directory)

[ ]  This directory is the single source of truth. Each successfully applied patch gets its own YAML file, serving as a permanent, human-readable log of the transaction, complete with the snapshot needed for potential manual reversions.