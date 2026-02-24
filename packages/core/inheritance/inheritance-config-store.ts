// Inheritance Config Store — SQLite-backed CRUD for all inheritance protocol data.
// 5 tables: config (singleton), trusted parties, actions, notification templates, activations.
// CRITICAL: No networking imports. All data local-only.

import type { DatabaseHandle } from '../platform/types.js';
import type {
  InheritanceConfig,
  TrustedParty,
  InheritanceAction,
  InheritanceActionCategory,
  NotificationTemplate,
  Activation,
  ActivationState,
} from './types.js';

// ─── Row types for SQLite queries ────────────────────────────────────────────

interface ConfigRow {
  time_lock_hours: number;
  require_step_confirmation: number;
  require_all_parties_for_deletion: number;
  last_reviewed_at: string | null;
}

interface PartyRow {
  id: string;
  name: string;
  email: string;
  relationship: string;
  passphrase_hash: string;
  created_at: string;
  updated_at: string;
}

interface ActionRow {
  id: string;
  party_id: string;
  category: string;
  sequence_order: number;
  action_type: string;
  payload_json: string;
  label: string;
  requires_deletion_consensus: number;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  party_id: string;
  action_id: string;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  body: string;
  last_reviewed_at: string;
  created_at: string;
  updated_at: string;
}

interface ActivationRow {
  id: string;
  party_id: string;
  state: string;
  activated_at: string;
  time_lock_expires_at: string | null;
  actions_total: number;
  actions_completed: number;
  current_action_id: string | null;
  requires_step_confirmation: number;
  cancelled_at: string | null;
  completed_at: string | null;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS inheritance_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    time_lock_hours INTEGER NOT NULL DEFAULT 72,
    require_step_confirmation INTEGER NOT NULL DEFAULT 1,
    require_all_parties_for_deletion INTEGER NOT NULL DEFAULT 1,
    last_reviewed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS inheritance_trusted_parties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    relationship TEXT NOT NULL,
    passphrase_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inheritance_actions (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('notification','account-action','data-sharing','preservation')),
    sequence_order INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    label TEXT NOT NULL,
    requires_deletion_consensus INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES inheritance_trusted_parties(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inheritance_notification_templates (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    last_reviewed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES inheritance_trusted_parties(id) ON DELETE CASCADE,
    FOREIGN KEY (action_id) REFERENCES inheritance_actions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inheritance_activations (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'inactive',
    activated_at TEXT NOT NULL,
    time_lock_expires_at TEXT,
    actions_total INTEGER NOT NULL DEFAULT 0,
    actions_completed INTEGER NOT NULL DEFAULT 0,
    current_action_id TEXT,
    requires_step_confirmation INTEGER NOT NULL DEFAULT 1,
    cancelled_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (party_id) REFERENCES inheritance_trusted_parties(id)
  );
`;

// ─── Store ───────────────────────────────────────────────────────────────────

export class InheritanceConfigStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
  }

  /**
   * Initialize schema and seed default config row.
   */
  initSchema(): void {
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(CREATE_TABLES);

    // Seed singleton config row if not present
    const existing = this.db.prepare('SELECT id FROM inheritance_config WHERE id = 1').get();
    if (!existing) {
      this.db.prepare(
        'INSERT INTO inheritance_config (id, time_lock_hours, require_step_confirmation, require_all_parties_for_deletion) VALUES (1, 72, 1, 1)',
      ).run();
    }
  }

  // ─── Config ──────────────────────────────────────────────────────────────

  getConfig(): InheritanceConfig {
    const row = this.db.prepare('SELECT * FROM inheritance_config WHERE id = 1').get() as ConfigRow;
    return {
      timeLockHours: row.time_lock_hours,
      requireStepConfirmation: row.require_step_confirmation === 1,
      requireAllPartiesForDeletion: row.require_all_parties_for_deletion === 1,
      lastReviewedAt: row.last_reviewed_at,
    };
  }

  updateConfig(updates: Partial<InheritanceConfig>): InheritanceConfig {
    const current = this.getConfig();
    const merged = { ...current, ...updates };

    this.db.prepare(`
      UPDATE inheritance_config SET
        time_lock_hours = ?,
        require_step_confirmation = ?,
        require_all_parties_for_deletion = ?,
        last_reviewed_at = ?
      WHERE id = 1
    `).run(
      merged.timeLockHours,
      merged.requireStepConfirmation ? 1 : 0,
      merged.requireAllPartiesForDeletion ? 1 : 0,
      merged.lastReviewedAt,
    );

    return merged;
  }

  // ─── Trusted Parties ─────────────────────────────────────────────────────

  insertParty(party: TrustedParty): void {
    this.db.prepare(`
      INSERT INTO inheritance_trusted_parties (id, name, email, relationship, passphrase_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      party.id, party.name, party.email, party.relationship,
      party.passphraseHash, party.createdAt, party.updatedAt,
    );
  }

  getParty(id: string): TrustedParty | null {
    const row = this.db.prepare('SELECT * FROM inheritance_trusted_parties WHERE id = ?').get(id) as PartyRow | undefined;
    if (!row) return null;
    return this.mapPartyRow(row);
  }

  getAllParties(): TrustedParty[] {
    const rows = this.db.prepare('SELECT * FROM inheritance_trusted_parties ORDER BY created_at ASC').all() as PartyRow[];
    return rows.map((r) => this.mapPartyRow(r));
  }

  updateParty(id: string, updates: Partial<Pick<TrustedParty, 'name' | 'email' | 'relationship'>>): TrustedParty | null {
    const existing = this.getParty(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = updates.name ?? existing.name;
    const email = updates.email ?? existing.email;
    const relationship = updates.relationship ?? existing.relationship;

    this.db.prepare(`
      UPDATE inheritance_trusted_parties SET name = ?, email = ?, relationship = ?, updated_at = ? WHERE id = ?
    `).run(name, email, relationship, now, id);

    return { ...existing, name, email, relationship, updatedAt: now };
  }

  removeParty(id: string): boolean {
    const result = this.db.prepare('DELETE FROM inheritance_trusted_parties WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  insertAction(action: InheritanceAction): void {
    this.db.prepare(`
      INSERT INTO inheritance_actions (id, party_id, category, sequence_order, action_type, payload_json, label, requires_deletion_consensus, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      action.id, action.partyId, action.category, action.sequenceOrder,
      action.actionType, JSON.stringify(action.payload), action.label,
      action.requiresDeletionConsensus ? 1 : 0, action.createdAt, action.updatedAt,
    );
  }

  getActionsForParty(partyId: string): InheritanceAction[] {
    const rows = this.db.prepare(
      'SELECT * FROM inheritance_actions WHERE party_id = ? ORDER BY sequence_order ASC',
    ).all(partyId) as ActionRow[];
    return rows.map((r) => this.mapActionRow(r));
  }

  getAction(id: string): InheritanceAction | null {
    const row = this.db.prepare('SELECT * FROM inheritance_actions WHERE id = ?').get(id) as ActionRow | undefined;
    if (!row) return null;
    return this.mapActionRow(row);
  }

  getAllActions(): InheritanceAction[] {
    const rows = this.db.prepare('SELECT * FROM inheritance_actions ORDER BY party_id, sequence_order ASC').all() as ActionRow[];
    return rows.map((r) => this.mapActionRow(r));
  }

  // ─── Notification Templates ──────────────────────────────────────────────

  insertTemplate(template: NotificationTemplate): void {
    this.db.prepare(`
      INSERT INTO inheritance_notification_templates (id, party_id, action_id, recipient_name, recipient_email, subject, body, last_reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      template.id, template.partyId, template.actionId,
      template.recipientName, template.recipientEmail,
      template.subject, template.body,
      template.lastReviewedAt, template.createdAt, template.updatedAt,
    );
  }

  getTemplatesForParty(partyId: string): NotificationTemplate[] {
    const rows = this.db.prepare(
      'SELECT * FROM inheritance_notification_templates WHERE party_id = ? ORDER BY created_at ASC',
    ).all(partyId) as TemplateRow[];
    return rows.map((r) => this.mapTemplateRow(r));
  }

  getTemplateForAction(actionId: string): NotificationTemplate | null {
    const row = this.db.prepare(
      'SELECT * FROM inheritance_notification_templates WHERE action_id = ?',
    ).get(actionId) as TemplateRow | undefined;
    if (!row) return null;
    return this.mapTemplateRow(row);
  }

  getAllTemplates(): NotificationTemplate[] {
    const rows = this.db.prepare('SELECT * FROM inheritance_notification_templates ORDER BY created_at ASC').all() as TemplateRow[];
    return rows.map((r) => this.mapTemplateRow(r));
  }

  // ─── Activations ─────────────────────────────────────────────────────────

  insertActivation(activation: Activation): void {
    this.db.prepare(`
      INSERT INTO inheritance_activations (id, party_id, state, activated_at, time_lock_expires_at, actions_total, actions_completed, current_action_id, requires_step_confirmation, cancelled_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      activation.id, activation.partyId, activation.state,
      activation.activatedAt, activation.timeLockExpiresAt,
      activation.actionsTotal, activation.actionsCompleted,
      activation.currentActionId, activation.requiresStepConfirmation ? 1 : 0,
      activation.cancelledAt, activation.completedAt,
    );
  }

  getActivation(id: string): Activation | null {
    const row = this.db.prepare('SELECT * FROM inheritance_activations WHERE id = ?').get(id) as ActivationRow | undefined;
    if (!row) return null;
    return this.mapActivationRow(row);
  }

  updateActivation(id: string, updates: Partial<Activation>): Activation | null {
    const existing = this.getActivation(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates, id };

    this.db.prepare(`
      UPDATE inheritance_activations SET
        state = ?, activated_at = ?, time_lock_expires_at = ?,
        actions_total = ?, actions_completed = ?, current_action_id = ?,
        requires_step_confirmation = ?, cancelled_at = ?, completed_at = ?
      WHERE id = ?
    `).run(
      merged.state, merged.activatedAt, merged.timeLockExpiresAt,
      merged.actionsTotal, merged.actionsCompleted, merged.currentActionId,
      merged.requiresStepConfirmation ? 1 : 0, merged.cancelledAt, merged.completedAt,
      id,
    );

    return merged;
  }

  getActiveActivations(): Activation[] {
    const rows = this.db.prepare(
      "SELECT * FROM inheritance_activations WHERE state NOT IN ('inactive', 'completed', 'cancelled') ORDER BY activated_at ASC",
    ).all() as ActivationRow[];
    return rows.map((r) => this.mapActivationRow(r));
  }

  getActivationsForParty(partyId: string): Activation[] {
    const rows = this.db.prepare(
      'SELECT * FROM inheritance_activations WHERE party_id = ? ORDER BY activated_at DESC',
    ).all(partyId) as ActivationRow[];
    return rows.map((r) => this.mapActivationRow(r));
  }

  // ─── Row Mappers ─────────────────────────────────────────────────────────

  private mapPartyRow(row: PartyRow): TrustedParty {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      relationship: row.relationship,
      passphraseHash: row.passphrase_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapActionRow(row: ActionRow): InheritanceAction {
    return {
      id: row.id,
      partyId: row.party_id,
      category: row.category as InheritanceActionCategory,
      sequenceOrder: row.sequence_order,
      actionType: row.action_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      label: row.label,
      requiresDeletionConsensus: row.requires_deletion_consensus === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTemplateRow(row: TemplateRow): NotificationTemplate {
    return {
      id: row.id,
      partyId: row.party_id,
      actionId: row.action_id,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      body: row.body,
      lastReviewedAt: row.last_reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapActivationRow(row: ActivationRow): Activation {
    return {
      id: row.id,
      partyId: row.party_id,
      state: row.state as ActivationState,
      activatedAt: row.activated_at,
      timeLockExpiresAt: row.time_lock_expires_at,
      actionsTotal: row.actions_total,
      actionsCompleted: row.actions_completed,
      currentActionId: row.current_action_id,
      requiresStepConfirmation: row.requires_step_confirmation === 1,
      cancelledAt: row.cancelled_at,
      completedAt: row.completed_at,
    };
  }
}
