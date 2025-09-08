import { konro } from 'konro';
import type { FileOperation, FileSnapshot, StateFile } from 'relaycode-core';
import path from 'path';
import { getStateDirectory } from './config';
import type { OnDemandDbContext } from 'konro';

export const relaySchema = konro.createSchema({
  tables: {
    transactions: {
      id: konro.id(),
      uuid: konro.string({ unique: true }),
      projectId: konro.string(),
      createdAt: konro.string(), // store as ISO string
      linesAdded: konro.number({ optional: true }),
      linesRemoved: konro.number({ optional: true }),
      linesDifference: konro.number({ optional: true }),
      gitCommitMsg: konro.string({ optional: true }),
      gitCommittedAt: konro.string({ optional: true }), // ISO string timestamp when included in git commit
      promptSummary: konro.string({ optional: true }),
      reasoning: konro.object<string[]>(),
      operations: konro.object<FileOperation[]>(),
      snapshot: konro.object<FileSnapshot>(),
      approved: konro.boolean(),
      status: konro.string(), // 'pending', 'committed', 'undone'
    },
  },
  relations: () => ({}),
});

export type RelaySchema = typeof relaySchema;
// This is the type inferred by konro for a base record.
export type TransactionRecord = RelaySchema['base']['transactions'];

// We need to convert between TransactionRecord and StateFile because StateFile is a Zod-validated type
// and TransactionRecord is konro's inferred type. They should be structurally identical.
// This function also handles type casting for complex object types.
export function toStateFile(record: TransactionRecord): StateFile {
  return record as unknown as StateFile;
}

export function fromStateFile(stateFile: StateFile): Omit<TransactionRecord, 'id' | 'status'> {
  return {
    ...stateFile,
    linesAdded: stateFile.linesAdded ?? null,
    linesRemoved: stateFile.linesRemoved ?? null,
    linesDifference: stateFile.linesDifference ?? null,
    gitCommitMsg: stateFile.gitCommitMsg ?? null,
    gitCommittedAt: (stateFile as any).gitCommittedAt ?? null,
    promptSummary: stateFile.promptSummary ?? null,
  };
}

const dbInstances = new Map<string, OnDemandDbContext<RelaySchema>>();

export function getDb(cwd: string): OnDemandDbContext<RelaySchema> {
  const resolvedCwd = path.resolve(cwd);
  const existingInstance = dbInstances.get(resolvedCwd);
  if (existingInstance) {
    return existingInstance;
  }

  const dbDir = path.join(getStateDirectory(resolvedCwd), 'transactions');

  const adapter = konro.createFileAdapter({
    format: 'yaml',
    perRecord: { dir: dbDir },
    mode: 'on-demand',
  });

  const db = konro.createDatabase({ schema: relaySchema, adapter });
  const newInstance = db as OnDemandDbContext<RelaySchema>;
  dbInstances.set(resolvedCwd, newInstance);
  return newInstance;
}