// Contact Store — SQLite storage for contacts with denormalized email lookup.
// Follows DocumentStore pattern: nanoid IDs with `ct_` prefix, JSON arrays as TEXT,
// WAL mode, ISO timestamps.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../../platform/types.js';
import { nanoid } from 'nanoid';
import type {
  ContactEntity,
  ContactAddress,
  CommunicationFrequency,
  RelationshipType,
} from './contact-types.js';

// ─── SQLite Schema ────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    device_contact_id TEXT UNIQUE,
    display_name TEXT NOT NULL,
    given_name TEXT,
    family_name TEXT,
    emails TEXT NOT NULL DEFAULT '[]',
    phones TEXT NOT NULL DEFAULT '[]',
    organization TEXT,
    job_title TEXT,
    birthday TEXT,
    addresses TEXT DEFAULT '[]',
    relationship_type TEXT DEFAULT 'unknown',
    communication_frequency TEXT DEFAULT '{}',
    last_contact_date TEXT,
    first_contact_date TEXT,
    interaction_count INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    email_entity_ids TEXT DEFAULT '[]',
    calendar_entity_ids TEXT DEFAULT '[]',
    document_entity_ids TEXT DEFAULT '[]',
    source TEXT DEFAULT 'device',
    merged_from TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name);
  CREATE INDEX IF NOT EXISTS idx_contacts_relationship_type ON contacts(relationship_type);
  CREATE INDEX IF NOT EXISTS idx_contacts_last_contact_date ON contacts(last_contact_date);
  CREATE INDEX IF NOT EXISTS idx_contacts_organization ON contacts(organization);

  CREATE TABLE IF NOT EXISTS contact_email_map (
    email TEXT NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    PRIMARY KEY (email, contact_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cem_email ON contact_email_map(email);
`;

// ─── Row types ────────────────────────────────────────────────────────────────

interface ContactRow {
  id: string;
  device_contact_id: string | null;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  emails: string;
  phones: string;
  organization: string | null;
  job_title: string | null;
  birthday: string | null;
  addresses: string;
  relationship_type: string;
  communication_frequency: string;
  last_contact_date: string | null;
  first_contact_date: string | null;
  interaction_count: number;
  tags: string;
  email_entity_ids: string;
  calendar_entity_ids: string;
  document_entity_ids: string;
  source: string;
  merged_from: string;
  created_at: string;
  updated_at: string;
}

function rowToContact(row: ContactRow): ContactEntity {
  return {
    id: row.id,
    deviceContactId: row.device_contact_id,
    displayName: row.display_name,
    givenName: row.given_name ?? '',
    familyName: row.family_name ?? '',
    emails: JSON.parse(row.emails) as string[],
    phones: JSON.parse(row.phones) as string[],
    organization: row.organization ?? '',
    jobTitle: row.job_title ?? '',
    birthday: row.birthday ?? '',
    addresses: JSON.parse(row.addresses) as ContactAddress[],
    relationshipType: row.relationship_type as RelationshipType,
    communicationFrequency: row.communication_frequency && row.communication_frequency !== '{}'
      ? JSON.parse(row.communication_frequency) as CommunicationFrequency
      : null,
    lastContactDate: row.last_contact_date,
    firstContactDate: row.first_contact_date,
    interactionCount: row.interaction_count,
    tags: JSON.parse(row.tags) as string[],
    emailEntityIds: JSON.parse(row.email_entity_ids) as string[],
    calendarEntityIds: JSON.parse(row.calendar_entity_ids) as string[],
    documentEntityIds: JSON.parse(row.document_entity_ids) as string[],
    source: row.source as ContactEntity['source'],
    mergedFrom: JSON.parse(row.merged_from) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Contact Store ────────────────────────────────────────────────────────────

export class ContactStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Insert a new contact. Returns the generated ID.
   * If a contact with the same device_contact_id already exists, returns existing ID (dedup).
   */
  insertContact(params: {
    deviceContactId?: string;
    displayName: string;
    givenName?: string;
    familyName?: string;
    emails?: string[];
    phones?: string[];
    organization?: string;
    jobTitle?: string;
    birthday?: string;
    addresses?: ContactAddress[];
    source?: ContactEntity['source'];
  }): { id: string; deduplicated: boolean } {
    // Dedup by device_contact_id
    if (params.deviceContactId) {
      const existing = this.db.prepare(
        'SELECT id FROM contacts WHERE device_contact_id = ?'
      ).get(params.deviceContactId) as { id: string } | undefined;

      if (existing) {
        return { id: existing.id, deduplicated: true };
      }
    }

    const id = `ct_${nanoid()}`;
    const now = new Date().toISOString();
    const emails = params.emails ?? [];

    this.db.prepare(`
      INSERT INTO contacts (
        id, device_contact_id, display_name, given_name, family_name,
        emails, phones, organization, job_title, birthday, addresses,
        source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.deviceContactId ?? null,
      params.displayName,
      params.givenName ?? null,
      params.familyName ?? null,
      JSON.stringify(emails),
      JSON.stringify(params.phones ?? []),
      params.organization ?? null,
      params.jobTitle ?? null,
      params.birthday ?? null,
      JSON.stringify(params.addresses ?? []),
      params.source ?? 'device',
      now,
      now,
    );

    // Update email map
    for (const email of emails) {
      this.db.prepare(
        'INSERT OR IGNORE INTO contact_email_map (email, contact_id) VALUES (?, ?)'
      ).run(email.toLowerCase(), id);
    }

    return { id, deduplicated: false };
  }

  /** Get a contact by ID. */
  getContact(id: string): ContactEntity | null {
    const row = this.db.prepare(
      'SELECT * FROM contacts WHERE id = ?'
    ).get(id) as ContactRow | undefined;
    return row ? rowToContact(row) : null;
  }

  /** Find contacts by email address (O(1) via denormalized map). */
  findByEmail(email: string): ContactEntity[] {
    const rows = this.db.prepare(`
      SELECT c.* FROM contacts c
      INNER JOIN contact_email_map m ON c.id = m.contact_id
      WHERE m.email = ?
    `).all(email.toLowerCase()) as ContactRow[];
    return rows.map(rowToContact);
  }

  /** Find contacts by name (partial match, case-insensitive). */
  findByName(name: string): ContactEntity[] {
    const rows = this.db.prepare(
      'SELECT * FROM contacts WHERE display_name LIKE ? OR given_name LIKE ? OR family_name LIKE ?'
    ).all(`%${name}%`, `%${name}%`, `%${name}%`) as ContactRow[];
    return rows.map(rowToContact);
  }

  /** Update an existing contact. Only provided fields are updated. */
  updateContact(id: string, updates: Partial<{
    displayName: string;
    givenName: string;
    familyName: string;
    emails: string[];
    phones: string[];
    organization: string;
    jobTitle: string;
    birthday: string;
    addresses: ContactAddress[];
    relationshipType: RelationshipType;
    communicationFrequency: CommunicationFrequency;
    lastContactDate: string;
    firstContactDate: string;
    interactionCount: number;
    tags: string[];
    emailEntityIds: string[];
    calendarEntityIds: string[];
    documentEntityIds: string[];
    mergedFrom: string[];
  }>): boolean {
    const existing = this.getContact(id);
    if (!existing) return false;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName); }
    if (updates.givenName !== undefined) { fields.push('given_name = ?'); values.push(updates.givenName); }
    if (updates.familyName !== undefined) { fields.push('family_name = ?'); values.push(updates.familyName); }
    if (updates.emails !== undefined) { fields.push('emails = ?'); values.push(JSON.stringify(updates.emails)); }
    if (updates.phones !== undefined) { fields.push('phones = ?'); values.push(JSON.stringify(updates.phones)); }
    if (updates.organization !== undefined) { fields.push('organization = ?'); values.push(updates.organization); }
    if (updates.jobTitle !== undefined) { fields.push('job_title = ?'); values.push(updates.jobTitle); }
    if (updates.birthday !== undefined) { fields.push('birthday = ?'); values.push(updates.birthday); }
    if (updates.addresses !== undefined) { fields.push('addresses = ?'); values.push(JSON.stringify(updates.addresses)); }
    if (updates.relationshipType !== undefined) { fields.push('relationship_type = ?'); values.push(updates.relationshipType); }
    if (updates.communicationFrequency !== undefined) { fields.push('communication_frequency = ?'); values.push(JSON.stringify(updates.communicationFrequency)); }
    if (updates.lastContactDate !== undefined) { fields.push('last_contact_date = ?'); values.push(updates.lastContactDate); }
    if (updates.firstContactDate !== undefined) { fields.push('first_contact_date = ?'); values.push(updates.firstContactDate); }
    if (updates.interactionCount !== undefined) { fields.push('interaction_count = ?'); values.push(updates.interactionCount); }
    if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
    if (updates.emailEntityIds !== undefined) { fields.push('email_entity_ids = ?'); values.push(JSON.stringify(updates.emailEntityIds)); }
    if (updates.calendarEntityIds !== undefined) { fields.push('calendar_entity_ids = ?'); values.push(JSON.stringify(updates.calendarEntityIds)); }
    if (updates.documentEntityIds !== undefined) { fields.push('document_entity_ids = ?'); values.push(JSON.stringify(updates.documentEntityIds)); }
    if (updates.mergedFrom !== undefined) { fields.push('merged_from = ?'); values.push(JSON.stringify(updates.mergedFrom)); }

    values.push(id);

    this.db.prepare(
      `UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values);

    // Update email map if emails changed
    if (updates.emails !== undefined) {
      this.db.prepare('DELETE FROM contact_email_map WHERE contact_id = ?').run(id);
      for (const email of updates.emails) {
        this.db.prepare(
          'INSERT OR IGNORE INTO contact_email_map (email, contact_id) VALUES (?, ?)'
        ).run(email.toLowerCase(), id);
      }
    }

    return true;
  }

  /** Delete a contact and its email map entries. */
  deleteContact(id: string): boolean {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM contact_email_map WHERE contact_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
      return result.changes > 0;
    });
    return transaction();
  }

  /** List contacts with optional pagination and sorting. */
  listContacts(options?: {
    limit?: number;
    offset?: number;
    sortBy?: 'display_name' | 'last_contact_date' | 'interaction_count';
    sortOrder?: 'ASC' | 'DESC';
  }): ContactEntity[] {
    const sortBy = options?.sortBy ?? 'display_name';
    const sortOrder = options?.sortOrder ?? 'ASC';
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM contacts ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    ).all(limit, offset) as ContactRow[];
    return rows.map(rowToContact);
  }

  /** Search contacts by text (name, org, email). */
  searchContacts(query: string, limit: number = 20): ContactEntity[] {
    const rows = this.db.prepare(`
      SELECT * FROM contacts
      WHERE display_name LIKE ? OR organization LIKE ? OR emails LIKE ?
      ORDER BY display_name ASC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as ContactRow[];
    return rows.map(rowToContact);
  }

  /** Get contact statistics. */
  getStats(): {
    totalContacts: number;
    byRelationshipType: Record<string, number>;
    withBirthday: number;
    withOrganization: number;
  } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM contacts'
    ).get() as { count: number };

    const typeCounts = this.db.prepare(
      'SELECT relationship_type, COUNT(*) as count FROM contacts GROUP BY relationship_type'
    ).all() as { relationship_type: string; count: number }[];

    const byRelationshipType: Record<string, number> = {};
    for (const row of typeCounts) {
      byRelationshipType[row.relationship_type] = row.count;
    }

    const withBirthday = this.db.prepare(
      "SELECT COUNT(*) as count FROM contacts WHERE birthday IS NOT NULL AND birthday != ''"
    ).get() as { count: number };

    const withOrganization = this.db.prepare(
      "SELECT COUNT(*) as count FROM contacts WHERE organization IS NOT NULL AND organization != ''"
    ).get() as { count: number };

    return {
      totalContacts: total.count,
      byRelationshipType,
      withBirthday: withBirthday.count,
      withOrganization: withOrganization.count,
    };
  }
}
