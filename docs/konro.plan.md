Here is a detailed plan report outlining the changes required to integrate the `konro` library into the `relaycode` project.

***

### **File: `docs/konro-integration-plan.md`**

# Plan: Integrate Konro for State Management in RelayCode

## 1. Objective

The primary objective is to replace RelayCode's custom, file-system-based state management logic with the `konro` library. Currently, transaction state is managed through direct file I/O operations (reading, writing, renaming YAML files) in `src/core/state.ts`. This will be migrated to use `konro`'s type-safe, on-demand database context.

This migration will:
- **Simplify State Logic:** Abstract away raw file system and serialization/deserialization logic.
- **Improve Type Safety:** Leverage `konro`'s schema-driven type inference for state objects, replacing the manual `zod` schema.
- **Enhance Maintainability:** Centralize data access patterns through a unified `db` object.
- **Provide Flexibility:** Open the door for future state management strategies (e.g., single-file DB) supported by `konro`.

## 2. Core Strategy

1.  **Introduce Konro:** Add `konro` as a project dependency.
2.  **Define Schema:** Create a new file, `src/core/db.ts`, to define a `konro` schema that mirrors the existing `StateFile` structure. The primary data table will be `transactions`.
3.  **Configure Adapter:** In `src/core/db.ts`, configure a `konro` file adapter to use the `on-demand` mode with a `perRecord` strategy, pointing to the existing `.relaycode/transactions` directory. This ensures compatibility with the current "one file per transaction" model.
4.  **Create DB Context:** Instantiate and export a `db` object from `src/core/db.ts`. This object will serve as the single interface for all transaction data operations.
5.  **Refactor Core Logic:**
    -   Rewrite all functions in `src/core/state.ts` to use the new `db` object's methods (`query`, `insert`, `update`).
    -   The concept of `pending` and `committed` files will be replaced by a `status` field in the `transactions` table.
6.  **Update Consumers:** Modify `src/core/transaction.ts` and command files (`src/commands/*.ts`) to use the new, simplified API from `src/core/state.ts`.
7.  **Deprecate Old Types:** Replace the `zod`-based `StateFile` type with the auto-inferred type from the `konro` schema for improved static analysis and type safety.

## 3. Migration for Existing Users

This is a breaking change for the internal storage format. A migration path must be provided for users with existing `relaycode` transaction histories.

-   A one-time migration script should be implemented.
-   On first run of the updated CLI, the script would detect the old `.yml` file format.
-   It would then read each file, parse its content, and use `db.transactions.insert()` to save it in the new `konro`-managed format (which remains one YAML file per record but may have slight formatting differences).
-   Old files could be archived or deleted after successful migration.

*(This plan focuses on the implementation and does not include the migration script itself.)*

## 4. Detailed Change Plan

The following files outline the specific changes required for each part of the codebase.

---

### **File: `docs/changes/01-project-setup.md`**

#### **Target: `package.json`**

**Change:** Add `konro` as a production dependency.

**Justification:** This makes the `konro` library available to the application for building the new state management layer. `js-yaml` remains a dependency as it is still used in `src/core/parser.ts` to parse LLM responses.

**Actions:**
1.  Add `"konro": "latest"` to the `dependencies` section of `package.json`.
2.  Run `bun install` or `npm install` to update the lockfile.

---

### **File: `docs/changes/02-database-context.md`**

#### **Target: `src/core/db.ts` (New File)**

**Change:** Create a new file to encapsulate all `konro` setup and export a singleton `db` context.

**Justification:** This isolates the `konro` implementation details, providing a clean, dedicated module for database schema, adapter configuration, and context creation. It prevents cluttering other core files like `config.ts` or `state.ts`.

**Actions:**
1.  **Create File:** `src/core/db.ts`.
2.  **Import `konro`:** Import `createSchema`, `createFileAdapter`, `createDatabase`, and column helpers from `konro`.
3.  **Define Schema:**
    -   Create a `transactionSchema` using `konro.createSchema`.
    -   Define one table named `transactions`.
    -   Translate the fields from the `zod` `StateFileSchema` in `src/types.ts` into `konro` column definitions.
        -   `uuid`: `konro.uuid()` (will serve as the primary key).
        -   `timestamp`: `konro.date()`.
        -   `operations`: `konro.object<FileOperation[]>()`.
        -   `snapshot`: `konro.object<FileSnapshot>()`.
        -   `status`: `konro.string()` (new field to replace the `.pending.yml` file-based state). It will hold values like `'pending'`, `'approved'`, or `'committed'`.
        -   `revertsTransactionUuid`: `konro.string({ optional: true })`.
        -   Map all other fields accordingly (`reasoning`, `source`, `summary`, etc.).
4.  **Create `getDb` Function:**
    -   Create a function `getDb(cwd: string)` that can be called to get a configured `db` instance for a specific project directory.
    -   Inside this function, call `createFileAdapter` with the following configuration:
        -   `mode: 'on-demand'`
        -   `perRecord: { dir: getTransactionsDirectory(cwd) }` (using the helper from `config.ts`).
        -   `format: 'yaml'`
    -   Call `createDatabase` with the schema and the newly created adapter.
    -   Return the `db` context. This function can cache the `db` instance per `cwd`.

---

### **File: `docs/changes/03-refactor-types.md`**

#### **Target: `src/types.ts`**

**Change:** Replace the Zod-based `StateFile` schema and type with the inferred type from the new `konro` schema.

**Justification:** Using the inferred type from `konro` (`db.schema.types.transactions`) makes it the single source of truth. This eliminates the need to maintain a parallel `zod` definition and ensures that the application's types are always perfectly in sync with the database schema.

**Actions:**
1.  Import the type of the `db` object from the new `src/core/db.ts`.
2.  Define a new exported type: `export type Transaction = KonroSchema['types']['transactions'];` (using `typeof db.schema` for inference).
3.  Remove the `StateFileSchema` and the `export type StateFile = z.infer<typeof StateFileSchema>;`.
4.  Perform a project-wide search for `StateFile` and replace it with the new `Transaction` type.

---

### **File: `docs/changes/04-refactor-state-management.md`**

#### **Target: `src/core/state.ts`**

**Change:** Rewrite the entire file to act as a high-level repository layer over the `konro` db context. All direct `fs` and `yaml` operations will be removed.

**Justification:** This is the core of the refactoring effort. It replaces fragile, manual file manipulation with robust, declarative database queries. The new implementation will be simpler, more readable, and less prone to race conditions or errors.

**Actions:**
1.  **Import `getDb`:** Import the `getDb` function from `src/core/db.ts`.
2.  **Rewrite Functions:**
    -   `readAllStateFiles(cwd, options)`: Becomes `(await getDb(cwd).transactions.query().all())`, with additional client-side filtering based on the `options`.
    -   `findLatestStateFile(cwd, options)`: Will use `readAllStateFiles`, sort the results by `timestamp` descending, and return the first element.
    -   `findStateFileByIdentifier(cwd, identifier)`:
        -   If `identifier` is a UUID: `return await getDb(cwd).transactions.query().where({ uuid: identifier }).first();`.
        -   If `identifier` is a number (sequence): `readAllStateFiles`, sort by date, and pick the nth element.
    -   `hasBeenProcessed(cwd, uuid)`: Becomes `const tx = await getDb(cwd).transactions.query().where({ uuid }).first(); return !!tx;`. The logic no longer needs to distinguish between committed and undone files, as `konro` will simply read whatever file exists for that UUID.
    -   `readStateFile(cwd, uuid)`: Becomes `return await getDb(cwd).transactions.query().where({ uuid }).first();`.
3.  **Replace File-Based Status Logic:**
    -   `writePendingState(cwd, state)`: Becomes `await getDb(cwd).transactions.insert({ ...state, status: 'pending' });`.
    -   `commitState(cwd, uuid)`: Becomes `await getDb(cwd).transactions.update({ status: 'committed' }).where({ uuid });`. The concept of renaming a file is replaced by updating a record's field.
    -   `deletePendingState(cwd, uuid)`: Becomes `await getDb(cwd).transactions.delete().where({ uuid });`.

---

### **File: `docs/changes/05-refactor-transaction-logic.md`**

#### **Target: `src/core/transaction.ts`**

**Change:** Update calls made to the old `state.ts` functions to align with the newly refactored versions.

**Justification:** `transaction.ts` is a primary consumer of the state management layer. Its calls must be updated to reflect the new data-centric (rather than file-centric) approach.

**Actions:**
1.  **Modify `processPatch`:**
    -   Replace the call to `writePendingState` with the new version. The `stateFile` object being passed will now include `status: 'pending'`.
    -   The logic that updates the state file after approval (`await writePendingState(cwd, stateFile)`) should be changed to an `update` call: `await db.transactions.update({ approved: true }).where({ uuid: stateFile.uuid });`.
    -   The call to `commitState` should be updated. It no longer performs a file rename but an update to the `status` field.
    -   The call to `deletePendingState` in rollback/error scenarios must be updated.

---

### **File: `docs/changes/06-refactor-configuration.md`**

#### **Target: `src/core/config.ts`**

**Change:** Remove obsolete file path helper functions.

**Justification:** `konro` now manages the specific file paths for each record internally. The `relaycode` application only needs to know the path to the parent `transactions` directory. The functions for constructing individual pending, committed, or undone file paths are no longer needed, simplifying the config module.

**Actions:**
1.  **Review and Remove:**
    -   Delete `getStateFilePath(cwd, uuid, isPending)`.
    -   Delete `getUndoneStateFilePath(cwd, uuid)`.
2.  **Retain:**
    -   Keep `getTransactionsDirectory(cwd)`, as it's required to configure the `konro` adapter.
    -   Keep all other functions related to finding and parsing the `relaycode.config.json` file.

---

### **File: `docs/changes/07-update-commands.md`**

#### **Targets: `src/commands/log.ts`, `src/commands/revert.ts`, `src/commands/git-commit.ts`**

**Change:** Ensure all commands that interact with transaction history use the refactored `state.ts` module correctly.

**Justification:** The command layer is the user-facing entry point. While most logic is abstracted in `core` modules, it's crucial to verify that these top-level consumers are compatible with the changes, especially regarding the new `Transaction` type.

**Actions:**
1.  **`log.ts`:** The `logCommand` uses `readAllStateFiles`. Verify that the loop processing the transactions works correctly with the new `Transaction` objects returned.
2.  **`revert.ts`:** This command heavily uses `findStateFileByIdentifier` and `readAllStateFiles`. Ensure that its logic for identifying the transaction to revert is still sound.
3.  **`git-commit.ts`:** This command uses `findLatestStateFile`. Confirm that it correctly receives the latest transaction object.
4.  **General:** In all command files, replace any remaining usages of the old `StateFile` type with the new `Transaction` type.
