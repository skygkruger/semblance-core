import type Database from 'better-sqlite3';
import { initializeVaultEventLogSchema } from '../crypto/encrypted-sqlite.js';
import { createVaultEventLogReader, type VaultEventLogReader, type VaultEventReadGuard } from './reader.js';
import { verifyVaultEventLogIntegrity, type VaultEventIntegrityReport } from './integrity.js';
import { createVaultEventLogWriter, type VaultEventLogWriter } from './writer.js';

export interface VaultEventLogOptions {
  db: Database.Database;
  rootKey: Buffer;
  writerId?: string;
  guard?: VaultEventReadGuard;
}

export interface VaultEventLog {
  writer: VaultEventLogWriter;
  reader: VaultEventLogReader;
  verifyIntegrity: () => VaultEventIntegrityReport;
  close: () => void;
}

export function createEventLog(options: VaultEventLogOptions): VaultEventLog {
  initializeVaultEventLogSchema(options.db);

  const writer = createVaultEventLogWriter({
    db: options.db,
    rootKey: options.rootKey,
    writerId: options.writerId,
  });

  const reader = createVaultEventLogReader({
    db: options.db,
    rootKey: options.rootKey,
    guard: options.guard,
  });

  return {
    writer,
    reader,
    verifyIntegrity: () => verifyVaultEventLogIntegrity(options.db, options.rootKey),
    close: () => {
      writer.release();
    },
  };
}
