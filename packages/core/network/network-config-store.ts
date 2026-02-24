// Network Config Store — SQLite CRUD for Semblance Network configuration.
// 4 tables: network_config, sharing_relationships, sharing_offers, shared_context_cache.
// CRITICAL: No networking imports. Pure SQLite operations.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type {
  NetworkConfig,
  SharingRelationship,
  SharingOffer,
  SharingCategory,
  RelationshipStatus,
} from './types.js';

// ─── SQLite Schema ────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS network_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    sync_frequency_hours INTEGER NOT NULL DEFAULT 4,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sharing_relationships (
    id TEXT PRIMARY KEY,
    local_user_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    peer_display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    outbound_categories TEXT NOT NULL DEFAULT '[]',
    inbound_categories TEXT NOT NULL DEFAULT '[]',
    initiated_by TEXT NOT NULL,
    consent_granted_at TEXT,
    last_sync_at TEXT,
    consent_attestation_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sharing_offers (
    id TEXT PRIMARY KEY,
    from_device_id TEXT NOT NULL,
    from_display_name TEXT NOT NULL,
    offered_categories TEXT NOT NULL,
    requested_categories TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    initiator_key_half TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shared_context_cache (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    category TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    structured_data TEXT,
    received_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_scc_peer_category
    ON shared_context_cache(peer_id, category);
`;

// ─── Row types ────────────────────────────────────────────────────────────────

interface RelationshipRow {
  id: string;
  local_user_id: string;
  peer_id: string;
  peer_display_name: string;
  status: string;
  outbound_categories: string;
  inbound_categories: string;
  initiated_by: string;
  consent_granted_at: string | null;
  last_sync_at: string | null;
  consent_attestation_json: string | null;
  created_at: string;
  updated_at: string;
}

interface OfferRow {
  id: string;
  from_device_id: string;
  from_display_name: string;
  offered_categories: string;
  requested_categories: string;
  expires_at: string;
  signature: string;
  status: string;
  initiator_key_half: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToRelationship(row: RelationshipRow): SharingRelationship {
  return {
    id: row.id,
    localUserId: row.local_user_id,
    peerId: row.peer_id,
    peerDisplayName: row.peer_display_name,
    status: row.status as RelationshipStatus,
    outboundCategories: JSON.parse(row.outbound_categories) as SharingCategory[],
    inboundCategories: JSON.parse(row.inbound_categories) as SharingCategory[],
    initiatedBy: row.initiated_by as 'local' | 'peer',
    consentGrantedAt: row.consent_granted_at,
    lastSyncAt: row.last_sync_at,
    consentAttestationJson: row.consent_attestation_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOffer(row: OfferRow): SharingOffer {
  return {
    id: row.id,
    fromDeviceId: row.from_device_id,
    fromDisplayName: row.from_display_name,
    offeredCategories: JSON.parse(row.offered_categories) as SharingCategory[],
    requestedCategories: JSON.parse(row.requested_categories) as SharingCategory[],
    expiresAt: row.expires_at,
    signature: row.signature,
    status: row.status as SharingOffer['status'],
    initiatorKeyHalf: row.initiator_key_half ?? undefined,
    createdAt: row.created_at,
  };
}

// ─── Network Config Store ─────────────────────────────────────────────────────

export class NetworkConfigStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.initSchema();
  }

  /**
   * Initialize all 4 tables. Safe to call multiple times.
   */
  initSchema(): void {
    this.db.exec(CREATE_TABLES);
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  /**
   * Get the global network config. Creates default if not exists.
   */
  getConfig(): NetworkConfig {
    const row = this.db.prepare(
      'SELECT enabled, sync_frequency_hours, updated_at FROM network_config WHERE id = 1'
    ).get() as { enabled: number; sync_frequency_hours: number; updated_at: string } | undefined;

    if (!row) {
      const now = new Date().toISOString();
      this.db.prepare(
        'INSERT INTO network_config (id, enabled, sync_frequency_hours, updated_at) VALUES (1, 0, 4, ?)'
      ).run(now);
      return { enabled: false, syncFrequencyHours: 4, updatedAt: now };
    }

    return {
      enabled: row.enabled === 1,
      syncFrequencyHours: row.sync_frequency_hours,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update network config.
   */
  updateConfig(updates: Partial<Pick<NetworkConfig, 'enabled' | 'syncFrequencyHours'>>): NetworkConfig {
    // Ensure config exists
    this.getConfig();

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.syncFrequencyHours !== undefined) {
      fields.push('sync_frequency_hours = ?');
      values.push(updates.syncFrequencyHours);
    }

    this.db.prepare(
      `UPDATE network_config SET ${fields.join(', ')} WHERE id = 1`
    ).run(...values);

    return this.getConfig();
  }

  // ─── Relationships ────────────────────────────────────────────────────────

  /**
   * Create a new sharing relationship.
   */
  createRelationship(params: {
    localUserId: string;
    peerId: string;
    peerDisplayName: string;
    initiatedBy: 'local' | 'peer';
    outboundCategories?: SharingCategory[];
    inboundCategories?: SharingCategory[];
    consentAttestationJson?: string;
  }): SharingRelationship {
    const id = `sr_${nanoid()}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO sharing_relationships (
        id, local_user_id, peer_id, peer_display_name, status,
        outbound_categories, inbound_categories, initiated_by,
        consent_granted_at, consent_attestation_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.localUserId,
      params.peerId,
      params.peerDisplayName,
      JSON.stringify(params.outboundCategories ?? []),
      JSON.stringify(params.inboundCategories ?? []),
      params.initiatedBy,
      now,
      params.consentAttestationJson ?? null,
      now,
      now,
    );

    return this.getRelationship(id)!;
  }

  /**
   * Get a relationship by ID.
   */
  getRelationship(id: string): SharingRelationship | null {
    const row = this.db.prepare(
      'SELECT * FROM sharing_relationships WHERE id = ?'
    ).get(id) as RelationshipRow | undefined;
    return row ? rowToRelationship(row) : null;
  }

  /**
   * Get a relationship by peer ID.
   */
  getRelationshipByPeer(peerId: string): SharingRelationship | null {
    const row = this.db.prepare(
      'SELECT * FROM sharing_relationships WHERE peer_id = ? AND status != ?'
    ).get(peerId, 'revoked') as RelationshipRow | undefined;
    return row ? rowToRelationship(row) : null;
  }

  /**
   * Get all active relationships.
   */
  getActiveRelationships(): SharingRelationship[] {
    const rows = this.db.prepare(
      "SELECT * FROM sharing_relationships WHERE status = 'active' ORDER BY updated_at DESC"
    ).all() as RelationshipRow[];
    return rows.map(rowToRelationship);
  }

  /**
   * Update relationship status.
   */
  updateRelationshipStatus(id: string, status: RelationshipStatus): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE sharing_relationships SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, now, id);
  }

  /**
   * Update outbound categories for a relationship.
   */
  updateOutboundCategories(id: string, categories: SharingCategory[]): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE sharing_relationships SET outbound_categories = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(categories), now, id);
  }

  /**
   * Update inbound categories for a relationship.
   */
  updateInboundCategories(id: string, categories: SharingCategory[]): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE sharing_relationships SET inbound_categories = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(categories), now, id);
  }

  /**
   * Update the last sync timestamp for a relationship.
   */
  updateLastSync(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE sharing_relationships SET last_sync_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, id);
  }

  // ─── Offers ───────────────────────────────────────────────────────────────

  /**
   * Store a sharing offer.
   */
  createOffer(offer: SharingOffer): void {
    this.db.prepare(`
      INSERT INTO sharing_offers (
        id, from_device_id, from_display_name, offered_categories,
        requested_categories, expires_at, signature, status, initiator_key_half, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      offer.id,
      offer.fromDeviceId,
      offer.fromDisplayName,
      JSON.stringify(offer.offeredCategories),
      JSON.stringify(offer.requestedCategories),
      offer.expiresAt,
      offer.signature,
      offer.status,
      offer.initiatorKeyHalf ?? null,
      offer.createdAt,
    );
  }

  /**
   * Get an offer by ID.
   */
  getOffer(id: string): SharingOffer | null {
    const row = this.db.prepare(
      'SELECT * FROM sharing_offers WHERE id = ?'
    ).get(id) as OfferRow | undefined;
    return row ? rowToOffer(row) : null;
  }

  /**
   * Get all pending offers (not expired).
   */
  getPendingOffers(): SharingOffer[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      "SELECT * FROM sharing_offers WHERE status = 'pending' AND expires_at > ? ORDER BY created_at DESC"
    ).all(now) as OfferRow[];
    return rows.map(rowToOffer);
  }

  /**
   * Update offer status.
   */
  updateOfferStatus(id: string, status: SharingOffer['status']): void {
    this.db.prepare(
      'UPDATE sharing_offers SET status = ? WHERE id = ?'
    ).run(status, id);
  }

  /**
   * Expire all offers past their expiration time.
   */
  expireOffers(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      "UPDATE sharing_offers SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?"
    ).run(now);
    return result.changes;
  }
}
