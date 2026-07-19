import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import Database from 'better-sqlite3';
import { createEventLog, type VaultEventLog } from '../event-log/index.js';
import { createVaultFileIngestHooks, type VaultFileIngestHooks } from '../ingest/file-ingest.js';
import { VaultChatGroundingImpl, type VaultChatGrounding } from '../chat/vault-chat-grounding.js';

const LOCAL_PRINCIPAL_ID = 'principal-local-sidecar';
const ROOT_KEY_FILENAME = 'root.key';

export interface BootstrapLocalVaultOptions {
  /** Base Semblance data directory (vault stored under `<dataDir>/vault`). */
  dataDir: string;
  deviceId?: string;
  principalId?: string;
  membershipEpoch?: number;
}

export interface LocalVaultBootstrap {
  eventLog: VaultEventLog;
  fileIngestHooks: VaultFileIngestHooks;
  chatGrounding: VaultChatGrounding;
  close: () => void;
}

function loadOrCreateRootKey(vaultDir: string): Buffer {
  const keyPath = join(vaultDir, ROOT_KEY_FILENAME);
  if (existsSync(keyPath)) {
    const existing = readFileSync(keyPath);
    if (existing.length === 32) {
      return existing;
    }
  }

  const rootKey = randomBytes(32);
  writeFileSync(keyPath, rootKey, { mode: 0o600 });
  return rootKey;
}

/**
 * Lightweight process-local vault bootstrap for sidecar / SemblanceCore wiring.
 * Opens encrypted event log under the data directory and exposes ingest + chat hooks.
 */
export function bootstrapLocalVault(options: BootstrapLocalVaultOptions): LocalVaultBootstrap {
  const vaultDir = join(options.dataDir, 'vault');
  if (!existsSync(vaultDir)) {
    mkdirSync(vaultDir, { recursive: true });
  }

  const rootKey = loadOrCreateRootKey(vaultDir);
  const dbPath = join(vaultDir, 'vault-events.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const eventLog = createEventLog({
    db,
    rootKey,
    writerId: createHash('sha256').update(`writer:${hostname()}:${process.pid}`).digest('hex').slice(0, 16),
  });

  const deviceId = options.deviceId ?? hostname();
  const principalId = options.principalId ?? LOCAL_PRINCIPAL_ID;
  const membershipEpoch = options.membershipEpoch ?? 1;

  const fileIngestHooks = createVaultFileIngestHooks({
    eventLog,
    deviceId,
    membershipEpoch,
  });

  const chatGrounding = new VaultChatGroundingImpl({
    eventLog,
    principalId,
    deviceId,
  });

  return {
    eventLog,
    fileIngestHooks,
    chatGrounding,
    close: () => {
      eventLog.close();
      db.close();
    },
  };
}
