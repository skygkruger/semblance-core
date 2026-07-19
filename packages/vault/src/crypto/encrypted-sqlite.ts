import type Database from 'better-sqlite3';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HKDF_INFO = 'semblance-vault-encrypted-sqlite-v1';

const CREATE_BLOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS vault_encrypted_blobs (
    blob_key TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function deriveStorageKey(rootKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      rootKey,
      Buffer.from('semblance-vault-sqlite-store', 'utf-8'),
      HKDF_INFO,
      KEY_LENGTH,
    ),
  );
}

function encryptBlob(storageKey: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, storageKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptBlob(storageKey: Buffer, ciphertext: Buffer): Buffer {
  if (ciphertext.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted blob: too short');
  }

  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(AES_ALGORITHM, storageKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export class EncryptedSqliteStore {
  private readonly storageKey: Buffer;
  private readonly upsertStmt: Database.Statement;
  private readonly selectStmt: Database.Statement;

  constructor(
    private readonly db: Database.Database,
    rootKey: Buffer,
  ) {
    this.storageKey = deriveStorageKey(rootKey);
    this.db.exec(CREATE_BLOBS_TABLE);
    this.upsertStmt = this.db.prepare(`
      INSERT INTO vault_encrypted_blobs (blob_key, ciphertext)
      VALUES (?, ?)
      ON CONFLICT(blob_key) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        created_at = datetime('now')
    `);
    this.selectStmt = this.db.prepare(
      'SELECT ciphertext FROM vault_encrypted_blobs WHERE blob_key = ?',
    );
  }

  put(blobKey: string, plaintext: Buffer): void {
    const ciphertext = encryptBlob(this.storageKey, plaintext);
    this.upsertStmt.run(blobKey, ciphertext);
  }

  get(blobKey: string): Buffer | undefined {
    const row = this.selectStmt.get(blobKey) as { ciphertext: Buffer } | undefined;
    if (!row) {
      return undefined;
    }
    return decryptBlob(this.storageKey, row.ciphertext);
  }
}

export const VAULT_EVENT_LOG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS vault_event_log (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    data_domain TEXT NOT NULL,
    device_id TEXT NOT NULL,
    membership_epoch INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    source_refs_json TEXT NOT NULL,
    sensitivity TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_ciphertext TEXT NOT NULL,
    signature TEXT NOT NULL,
    chain_hash TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vault_event_log_occurred_at
    ON vault_event_log(occurred_at);

  CREATE TABLE IF NOT EXISTS vault_writer_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    holder_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vault_event_log_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    event_count INTEGER NOT NULL,
    tip_chain_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export function initializeVaultEventLogSchema(db: Database.Database): void {
  db.exec(VAULT_EVENT_LOG_SCHEMA);
}
