// Desktop KeychainStore — Tauri stronghold-backed implementation.
//
// Uses the same Tauri invoke pattern as KeychainKeyStorage in
// packages/gateway/credentials/key-storage.ts but for individual credential values.
//
// The tracking table (keychain_entries) in a lightweight SQLite DB enables:
// 1. clear() — iterate all entries for a service prefix and delete from keychain
// 2. Disconnect cleanup — remove all entries for a specific connector

import type { KeychainStore } from '@semblance/core';
import type Database from 'better-sqlite3';

const CREATE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS keychain_entries (
    service TEXT NOT NULL,
    account TEXT NOT NULL,
    PRIMARY KEY (service, account)
  );
`;

export class DesktopKeychainStore implements KeychainStore {
  private invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  private trackingDb: Database.Database;

  constructor(
    tauriInvoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>,
    trackingDb: Database.Database,
  ) {
    this.invoke = tauriInvoke;
    this.trackingDb = trackingDb;
    this.trackingDb.exec(CREATE_TRACKING_TABLE);
  }

  async set(service: string, account: string, value: string): Promise<void> {
    await this.invoke('plugin:stronghold|set_record', {
      service,
      account,
      value,
    });

    // Track the entry for clear() and disconnect cleanup
    this.trackingDb.prepare(`
      INSERT OR REPLACE INTO keychain_entries (service, account) VALUES (?, ?)
    `).run(service, account);
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const result = await this.invoke('plugin:stronghold|get_record', {
        service,
        account,
      }) as string | null;
      return result;
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      await this.invoke('plugin:stronghold|delete_record', {
        service,
        account,
      });
    } catch {
      // Entry might not exist — that's fine
    }

    this.trackingDb.prepare(
      'DELETE FROM keychain_entries WHERE service = ? AND account = ?'
    ).run(service, account);
  }

  async clear(servicePrefix: string): Promise<void> {
    const rows = this.trackingDb.prepare(
      'SELECT service, account FROM keychain_entries WHERE service LIKE ?'
    ).all(`${servicePrefix}%`) as Array<{ service: string; account: string }>;

    for (const row of rows) {
      try {
        await this.invoke('plugin:stronghold|delete_record', {
          service: row.service,
          account: row.account,
        });
      } catch {
        // Best-effort cleanup
      }
    }

    this.trackingDb.prepare(
      'DELETE FROM keychain_entries WHERE service LIKE ?'
    ).run(`${servicePrefix}%`);
  }
}
