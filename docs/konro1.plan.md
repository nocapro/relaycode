### **File: `docs/konro-integration-plan.md`**

# Concise Plan: Integrate Konro for State Management

## 1. Objective

Replace RelayCode's manual file-based state management with the `konro` library to simplify logic, improve type safety, and increase maintainability.

## 2. Core Strategy

1.  **Add Dependency:** Add `konro` to `package.json`.
2.  **Define Schema:** Create `src/core/db.ts` to define a `konro` schema for `transactions`, mirroring the old `StateFile` structure. A new `status` field will replace the `.pending.yml` file-based state.
3.  **Configure Adapter:** In `src/core/db.ts`, create a `konro` file adapter using `on-demand` mode with a `perRecord` strategy, pointing to the existing `.relaycode/transactions` directory to maintain the current file structure.
4.  **Refactor State Module:** Rewrite `src/core/state.ts` to use the new `konro` `db` context. All direct file system operations (`fs.rename`, `fs.readFile`) will be replaced with database queries (`db.transactions.update`, `db.transactions.query`).
5.  **Update Types:** Deprecate the `zod`-based `StateFile` in `src/types.ts` and replace it with the type automatically inferred from the `konro` schema.
6.  **Clean Up:** Update consumer files (`src/core/transaction.ts`, command files) to use the new API and remove obsolete path-helper functions from `src/core/config.ts`.

## 3. File-by-File Change Plan

| File | Action | Justification |
| :--- | :--- | :--- |
| **`package.json`** | Add `konro` as a production dependency. | Makes the library available for the new state layer. |
| **`src/core/db.ts` (New)** | <ul><li>Define `konro` schema for `transactions`.</li><li>Configure `on-demand`, `perRecord` YAML adapter.</li><li>Export a `getDb(cwd)` function to provide the `db` context.</li></ul> | Centralizes all database setup and provides a single access point. |
| **`src/core/state.ts`** | <ul><li>Rewrite all functions to use the `konro` `db` object.</li><li>`commitState`: Becomes `db.transactions.update({ status: 'committed' })`.</li><li>`readAllStateFiles`: Becomes `db.transactions.query().all()`.</li></ul> | Abstracts raw file I/O into declarative, type-safe database operations. |
| **`src/types.ts`** | <ul><li>Remove `StateFileSchema` (Zod definition).</li><li>Export a new `Transaction` type inferred from the `konro` schema.</li></ul> | Establishes the `konro` schema as the single source of truth for types. |
| **`src/core/transaction.ts`**<br>**`src/commands/*.ts`** | <ul><li>Update calls to `state.ts` functions.</li><li>Replace `StateFile` type hints with the new `Transaction` type.</li></ul> | Ensures consumers of the state layer are compatible with the new API. |
| **`src/core/config.ts`** | Remove obsolete path helpers like `getStateFilePath` and `getUndoneStateFilePath`. | The `konro` adapter now manages individual record file paths internally. |
