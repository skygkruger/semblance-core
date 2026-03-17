// Pairing Manager — DM pairing codes for unknown channel senders.
// Unknown senders receive a 6-digit time-limited code.
// User approves in the app. Approved contacts stored in config.db.

import Database from 'better-sqlite3';

interface PairingCode {
  channelId: string;
  senderId: string;
  code: string;
  expiresAt: string;
}

/**
 * PairingManager handles DM security for channel adapters.
 * No message from an unapproved sender reaches the AI Core.
 */
export class PairingManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  /**
   * Generate a 6-digit pairing code for an unknown sender.
   * Valid for 10 minutes.
   */
  generateCode(channelId: string, senderId: string): string {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO pairing_codes (channel_id, sender_id, code, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(channelId, senderId, code, expiresAt);

    return code;
  }

  /**
   * Verify a pairing code. Returns true if valid and not expired.
   */
  verifyCode(channelId: string, senderId: string, code: string): boolean {
    const row = this.db.prepare(
      'SELECT * FROM pairing_codes WHERE channel_id = ? AND sender_id = ? AND code = ?'
    ).get(channelId, senderId, code) as PairingCode | undefined;

    if (!row) return false;
    if (new Date(row.expiresAt) < new Date()) {
      // Expired — clean up
      this.db.prepare('DELETE FROM pairing_codes WHERE channel_id = ? AND sender_id = ?').run(channelId, senderId);
      return false;
    }

    // Code valid — remove it (one-time use)
    this.db.prepare('DELETE FROM pairing_codes WHERE channel_id = ? AND sender_id = ?').run(channelId, senderId);
    return true;
  }

  /**
   * Approve a contact — adds to the approved contacts table.
   */
  approveContact(channelId: string, senderId: string, displayName?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO approved_contacts (channel_id, sender_id, display_name, approved_at)
      VALUES (?, ?, ?, ?)
    `).run(channelId, senderId, displayName ?? null, now);
  }

  /**
   * Check if a sender is approved for a channel.
   */
  isApproved(channelId: string, senderId: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM approved_contacts WHERE channel_id = ? AND sender_id = ?'
    ).get(channelId, senderId);
    return row !== undefined;
  }

  /**
   * Revoke a previously approved contact.
   */
  revokeContact(channelId: string, senderId: string): void {
    this.db.prepare(
      'DELETE FROM approved_contacts WHERE channel_id = ? AND sender_id = ?'
    ).run(channelId, senderId);
  }

  /**
   * List all pending pairing requests (not yet approved).
   */
  listPending(): Array<{ channelId: string; senderId: string; expiresAt: string }> {
    const rows = this.db.prepare(
      'SELECT channel_id, sender_id, expires_at FROM pairing_codes WHERE expires_at > ? ORDER BY expires_at DESC'
    ).all(new Date().toISOString()) as Array<{ channel_id: string; sender_id: string; expires_at: string }>;
    return rows.map(r => ({ channelId: r.channel_id, senderId: r.sender_id, expiresAt: r.expires_at }));
  }

  /**
   * List all approved contacts.
   */
  listApproved(): Array<{ channelId: string; senderId: string; displayName: string | null; approvedAt: string }> {
    const rows = this.db.prepare(
      'SELECT channel_id, sender_id, display_name, approved_at FROM approved_contacts ORDER BY approved_at DESC'
    ).all() as Array<{ channel_id: string; sender_id: string; display_name: string | null; approved_at: string }>;
    return rows.map(r => ({
      channelId: r.channel_id,
      senderId: r.sender_id,
      displayName: r.display_name,
      approvedAt: r.approved_at,
    }));
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pairing_codes (
        channel_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, sender_id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approved_contacts (
        channel_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        display_name TEXT,
        approved_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, sender_id)
      )
    `);
  }
}
