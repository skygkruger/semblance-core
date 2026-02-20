// Credential Store — Secure local storage for service credentials.
// Passwords are encrypted at rest using AES-256-GCM.
// This is a Gateway concern — the Core never sees raw credentials.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { ServiceCredential, ServiceType, ConnectionTestResult } from './types.js';
import { encryptPassword, decryptPassword, getEncryptionKey } from './encryption.js';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS service_credentials (
    id TEXT PRIMARY KEY,
    service_type TEXT NOT NULL CHECK (service_type IN ('email', 'calendar')),
    protocol TEXT NOT NULL CHECK (protocol IN ('imap', 'smtp', 'caldav')),
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    use_tls INTEGER NOT NULL DEFAULT 1,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_verified_at TEXT
  );
`;

const CREATE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_credential_type ON service_credentials(service_type);
`;

interface CredentialRow {
  id: string;
  service_type: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  use_tls: number;
  display_name: string;
  created_at: string;
  last_verified_at: string | null;
}

function rowToCredential(row: CredentialRow): ServiceCredential {
  return {
    id: row.id,
    serviceType: row.service_type as ServiceCredential['serviceType'],
    protocol: row.protocol as ServiceCredential['protocol'],
    host: row.host,
    port: row.port,
    username: row.username,
    encryptedPassword: row.encrypted_password,
    useTLS: row.use_tls === 1,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastVerifiedAt: row.last_verified_at,
  };
}

export class CredentialStore {
  private db: Database.Database;
  private encryptionKey: Buffer;

  constructor(db: Database.Database, encryptionKeyPath?: string) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLE);
    this.db.exec(CREATE_INDEX);
    this.encryptionKey = getEncryptionKey(encryptionKeyPath);
  }

  /**
   * Add a new credential. The password is encrypted before storage.
   */
  add(input: {
    serviceType: ServiceCredential['serviceType'];
    protocol: ServiceCredential['protocol'];
    host: string;
    port: number;
    username: string;
    password: string;
    useTLS: boolean;
    displayName: string;
  }): ServiceCredential {
    const id = nanoid();
    const createdAt = new Date().toISOString();
    const encryptedPw = encryptPassword(this.encryptionKey, input.password);

    this.db.prepare(`
      INSERT INTO service_credentials (id, service_type, protocol, host, port, username, encrypted_password, use_tls, display_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.serviceType,
      input.protocol,
      input.host,
      input.port,
      input.username,
      encryptedPw,
      input.useTLS ? 1 : 0,
      input.displayName,
      createdAt,
    );

    return {
      id,
      serviceType: input.serviceType,
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      username: input.username,
      encryptedPassword: encryptedPw,
      useTLS: input.useTLS,
      displayName: input.displayName,
      createdAt,
      lastVerifiedAt: null,
    };
  }

  /**
   * Get a credential by ID.
   */
  get(id: string): ServiceCredential | null {
    const row = this.db.prepare(
      'SELECT * FROM service_credentials WHERE id = ?'
    ).get(id) as CredentialRow | undefined;

    return row ? rowToCredential(row) : null;
  }

  /**
   * Get all credentials for a specific service type.
   */
  getByType(serviceType: ServiceType): ServiceCredential[] {
    const rows = this.db.prepare(
      'SELECT * FROM service_credentials WHERE service_type = ? ORDER BY created_at ASC'
    ).all(serviceType) as CredentialRow[];

    return rows.map(rowToCredential);
  }

  /**
   * Get all credentials.
   */
  getAll(): ServiceCredential[] {
    const rows = this.db.prepare(
      'SELECT * FROM service_credentials ORDER BY created_at ASC'
    ).all() as CredentialRow[];

    return rows.map(rowToCredential);
  }

  /**
   * Update specific fields of a credential.
   */
  update(id: string, updates: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    useTLS?: boolean;
    displayName?: string;
    lastVerifiedAt?: string | null;
  }): ServiceCredential {
    const existing = this.get(id);
    if (!existing) throw new Error(`Credential not found: ${id}`);

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.host !== undefined) { fields.push('host = ?'); values.push(updates.host); }
    if (updates.port !== undefined) { fields.push('port = ?'); values.push(updates.port); }
    if (updates.username !== undefined) { fields.push('username = ?'); values.push(updates.username); }
    if (updates.password !== undefined) {
      fields.push('encrypted_password = ?');
      values.push(encryptPassword(this.encryptionKey, updates.password));
    }
    if (updates.useTLS !== undefined) { fields.push('use_tls = ?'); values.push(updates.useTLS ? 1 : 0); }
    if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName); }
    if (updates.lastVerifiedAt !== undefined) { fields.push('last_verified_at = ?'); values.push(updates.lastVerifiedAt); }

    if (fields.length === 0) return existing;

    values.push(id);
    this.db.prepare(
      `UPDATE service_credentials SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values);

    return this.get(id)!;
  }

  /**
   * Remove a credential.
   */
  remove(id: string): void {
    this.db.prepare('DELETE FROM service_credentials WHERE id = ?').run(id);
  }

  /**
   * Decrypt the password for a stored credential.
   * Used internally by adapters — never expose decrypted passwords to the frontend.
   */
  decryptPassword(credential: ServiceCredential): string {
    return decryptPassword(this.encryptionKey, credential.encryptedPassword);
  }

  /**
   * Test connection for a credential.
   * Delegates to the appropriate adapter's testConnection method.
   * This is a placeholder — actual testing is done by the adapters.
   */
  async testConnection(_id: string): Promise<ConnectionTestResult> {
    // Actual implementation wired by the adapter layer
    return { success: false, error: 'Connection testing not yet wired' };
  }
}
