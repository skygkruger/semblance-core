// Contact Store Tests — SQLite storage for contacts with dedup and email lookup.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import { ContactStore } from '../../../packages/core/knowledge/contacts/contact-store.js';
import { ContactIngestionPipeline } from '../../../packages/core/knowledge/contacts/contact-ingestion.js';
import { createMockContactsAdapter } from '../../../packages/core/platform/desktop-contacts.js';
import type { DeviceContact } from '../../../packages/core/platform/types.js';

let db: Database.Database;
let store: ContactStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new ContactStore(db as unknown as DatabaseHandle);
});

describe('ContactStore', () => {
  it('creates tables on initialization', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('contacts');
    expect(tableNames).toContain('contact_email_map');
  });

  it('inserts a contact with ct_ prefixed nanoid', () => {
    const result = store.insertContact({
      displayName: 'Sarah Chen',
      givenName: 'Sarah',
      familyName: 'Chen',
      emails: ['sarah@acme.com'],
      organization: 'Acme Corp',
    });

    expect(result.id).toMatch(/^ct_/);
    expect(result.deduplicated).toBe(false);

    const contact = store.getContact(result.id);
    expect(contact).not.toBeNull();
    expect(contact!.displayName).toBe('Sarah Chen');
    expect(contact!.emails).toEqual(['sarah@acme.com']);
  });

  it('deduplicates by device_contact_id', () => {
    const first = store.insertContact({
      deviceContactId: 'dc-001',
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com'],
    });

    const second = store.insertContact({
      deviceContactId: 'dc-001',
      displayName: 'Sarah Updated',
      emails: ['sarah@acme.com'],
    });

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('returns null for non-existent contact', () => {
    const contact = store.getContact('ct_nonexistent');
    expect(contact).toBeNull();
  });

  it('finds contacts by email via denormalized map', () => {
    store.insertContact({
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com', 'sarah.chen@personal.com'],
    });

    // Exact email lookup
    const byWork = store.findByEmail('sarah@acme.com');
    expect(byWork).toHaveLength(1);
    expect(byWork[0]!.displayName).toBe('Sarah Chen');

    // Case-insensitive
    const byPersonal = store.findByEmail('SARAH.CHEN@PERSONAL.COM');
    expect(byPersonal).toHaveLength(1);
  });

  it('finds contacts by partial name match', () => {
    store.insertContact({ displayName: 'Sarah Chen', givenName: 'Sarah', familyName: 'Chen' });
    store.insertContact({ displayName: 'Alex Rivera', givenName: 'Alex', familyName: 'Rivera' });

    const results = store.findByName('Chen');
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe('Sarah Chen');

    // Partial first name
    const byFirst = store.findByName('Ale');
    expect(byFirst).toHaveLength(1);
    expect(byFirst[0]!.displayName).toBe('Alex Rivera');
  });

  it('updates contact while preserving unchanged fields', () => {
    const { id } = store.insertContact({
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com'],
      organization: 'Acme Corp',
      birthday: '1990-03-15',
    });

    store.updateContact(id, { organization: 'New Corp', tags: ['important'] });

    const updated = store.getContact(id)!;
    expect(updated.organization).toBe('New Corp');
    expect(updated.tags).toEqual(['important']);
    // Unchanged fields preserved
    expect(updated.displayName).toBe('Sarah Chen');
    expect(updated.birthday).toBe('1990-03-15');
    expect(updated.emails).toEqual(['sarah@acme.com']);
  });

  it('ingestion pipeline imports contacts from device', async () => {
    const sampleContacts: DeviceContact[] = [
      {
        deviceContactId: 'dc-001',
        displayName: 'Sarah Chen',
        givenName: 'Sarah',
        familyName: 'Chen',
        emails: [{ label: 'work', value: 'sarah@acme.com' }],
        phones: [{ label: 'mobile', value: '+1-555-0100' }],
        organization: 'Acme Corp',
        jobTitle: 'Engineer',
        birthday: '1990-03-15',
        addresses: [],
        thumbnailPath: '',
      },
      {
        deviceContactId: 'dc-002',
        displayName: 'Alex Rivera',
        givenName: 'Alex',
        familyName: 'Rivera',
        emails: [{ label: 'work', value: 'alex@startup.io' }],
        phones: [],
        organization: 'Startup Inc',
        jobTitle: 'CEO',
        birthday: '',
        addresses: [],
        thumbnailPath: '',
      },
    ];

    const adapter = createMockContactsAdapter({
      contacts: sampleContacts,
      permission: 'authorized',
    });

    const pipeline = new ContactIngestionPipeline({
      contactsAdapter: adapter,
      contactStore: store,
    });

    const result = await pipeline.ingestFromDevice();
    expect(result.total).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    // Verify contacts are in store
    const stats = store.getStats();
    expect(stats.totalContacts).toBe(2);

    // Re-ingest — should update, not duplicate
    const result2 = await pipeline.ingestFromDevice();
    expect(result2.updated).toBe(2);
    expect(result2.imported).toBe(0);

    // Still only 2 contacts
    expect(store.getStats().totalContacts).toBe(2);
  });
});
