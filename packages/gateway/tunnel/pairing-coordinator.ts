// Pairing Coordinator — Device pairing flow for the VERIDIAN compute mesh.
//
// First-time setup: Desktop generates QR code → Mobile scans → Both register
// with Headscale → WireGuard tunnel established. Permanent pairing.
// Re-connection is automatic after first pairing.

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export interface PairedDevice {
  deviceId: string;
  displayName: string;
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android';
  meshIp: string;
  publicKey: string;
  lastSeenAt: string;
  online: boolean;
  pairedAt: string;
}

export interface PairingQRPayload {
  headscaleServer: string;
  preAuthKey: string;
  deviceId: string;
  publicKey: string;
  displayName: string;
  platform: string;
  tunnelPort: number;
}

interface PairingCodeRow {
  code: string;
  qr_payload_json: string;
  expires_at: string;
}

interface PairedDeviceRow {
  device_id: string;
  display_name: string;
  platform: string;
  mesh_ip: string;
  public_key: string;
  last_seen_at: string;
  paired_at: string;
}

/**
 * PairingCoordinator manages the device pairing lifecycle.
 */
export class PairingCoordinator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  /**
   * Generate a pairing code and QR payload for display on the initiating device.
   */
  async generatePairingCode(params: {
    headscaleServer: string;
    preAuthKey: string;
    deviceId: string;
    publicKey: string;
    displayName: string;
    platform: string;
    tunnelPort?: number;
  }): Promise<{ code: string; qrPayload: string; expiresAt: string }> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const qrPayload: PairingQRPayload = {
      headscaleServer: params.headscaleServer,
      preAuthKey: params.preAuthKey,
      deviceId: params.deviceId,
      publicKey: params.publicKey,
      displayName: params.displayName,
      platform: params.platform,
      tunnelPort: params.tunnelPort ?? 51821,
    };

    const qrPayloadJson = JSON.stringify(qrPayload);

    this.db.prepare(`
      INSERT OR REPLACE INTO tunnel_pairing_codes (code, qr_payload_json, expires_at)
      VALUES (?, ?, ?)
    `).run(code, qrPayloadJson, expiresAt);

    return { code, qrPayload: qrPayloadJson, expiresAt };
  }

  /**
   * Verify a pairing code entered on the accepting device.
   */
  async verifyPairingCode(code: string): Promise<PairingQRPayload | null> {
    const row = this.db.prepare(
      'SELECT * FROM tunnel_pairing_codes WHERE code = ? AND expires_at > ?'
    ).get(code, new Date().toISOString()) as PairingCodeRow | undefined;

    if (!row) return null;

    // One-time use — delete the code
    this.db.prepare('DELETE FROM tunnel_pairing_codes WHERE code = ?').run(code);

    return JSON.parse(row.qr_payload_json) as PairingQRPayload;
  }

  /**
   * Complete pairing: register the remote device as a paired peer.
   */
  async completePairing(peer: {
    deviceId: string;
    displayName: string;
    platform: string;
    meshIp: string;
    publicKey: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO paired_devices (device_id, display_name, platform, mesh_ip, public_key, last_seen_at, paired_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(peer.deviceId, peer.displayName, peer.platform, peer.meshIp, peer.publicKey, now, now);
  }

  /**
   * List all paired devices.
   */
  async listPairedDevices(): Promise<PairedDevice[]> {
    const rows = this.db.prepare(
      'SELECT * FROM paired_devices ORDER BY last_seen_at DESC'
    ).all() as PairedDeviceRow[];

    return rows.map(r => ({
      deviceId: r.device_id,
      displayName: r.display_name,
      platform: r.platform as PairedDevice['platform'],
      meshIp: r.mesh_ip,
      publicKey: r.public_key,
      lastSeenAt: r.last_seen_at,
      online: false, // Updated by WireGuard heartbeat
      pairedAt: r.paired_at,
    }));
  }

  /**
   * Get a specific paired device.
   */
  async getPairedDevice(deviceId: string): Promise<PairedDevice | null> {
    const row = this.db.prepare(
      'SELECT * FROM paired_devices WHERE device_id = ?'
    ).get(deviceId) as PairedDeviceRow | undefined;

    if (!row) return null;

    return {
      deviceId: row.device_id,
      displayName: row.display_name,
      platform: row.platform as PairedDevice['platform'],
      meshIp: row.mesh_ip,
      publicKey: row.public_key,
      lastSeenAt: row.last_seen_at,
      online: false,
      pairedAt: row.paired_at,
    };
  }

  /**
   * Unpair a device.
   */
  async unpairDevice(deviceId: string): Promise<void> {
    this.db.prepare('DELETE FROM paired_devices WHERE device_id = ?').run(deviceId);
  }

  /**
   * Update last-seen timestamp for a paired device.
   */
  updateLastSeen(deviceId: string): void {
    this.db.prepare(
      'UPDATE paired_devices SET last_seen_at = ? WHERE device_id = ?'
    ).run(new Date().toISOString(), deviceId);
  }

  /**
   * Get the number of paired devices.
   */
  getPairedCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM paired_devices').get() as { count: number };
    return row.count;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tunnel_pairing_codes (
        code TEXT PRIMARY KEY,
        qr_payload_json TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paired_devices (
        device_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        mesh_ip TEXT NOT NULL,
        public_key TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        paired_at TEXT NOT NULL
      )
    `);
  }
}
