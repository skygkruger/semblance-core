// Entity Resolver Tests — Resolution priority: email → name+org → fuzzy → new.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactStore } from '../../../packages/core/knowledge/contacts/contact-store.js';
import { ContactEntityResolver, levenshteinDistance } from '../../../packages/core/knowledge/contacts/entity-resolver.js';
import { DocumentStore } from '../../../packages/core/knowledge/document-store.js';

let db: Database.Database;
let contactStore: ContactStore;
let documentStore: DocumentStore;
let resolver: ContactEntityResolver;

beforeEach(() => {
  db = new Database(':memory:');
  contactStore = new ContactStore(db);
  documentStore = new DocumentStore(db);
  resolver = new ContactEntityResolver({ contactStore, documentStore });
});

describe('ContactEntityResolver', () => {
  it('resolves via email match with high confidence', () => {
    // Create an entity with email in its name/aliases
    documentStore.insertEntity({
      name: 'sarah@acme.com',
      type: 'person',
      aliases: ['Sarah Chen'],
    });

    const { id } = contactStore.insertContact({
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com'],
    });
    const contact = contactStore.getContact(id)!;

    const result = resolver.resolve(contact);
    expect(result.confidence).toBe('high');
    expect(result.matchType).toBe('email');
    expect(result.matchedEntityId).not.toBeNull();
    expect(result.needsConfirmation).toBe(false);
  });

  it('resolves via name + org match with high confidence', () => {
    documentStore.insertEntity({
      name: 'Sarah Chen',
      type: 'person',
      metadata: { organization: 'Acme Corp' },
    });

    const { id } = contactStore.insertContact({
      displayName: 'Sarah Chen',
      emails: ['unknown@new.com'],
      organization: 'Acme Corp',
    });
    const contact = contactStore.getContact(id)!;

    const result = resolver.resolve(contact);
    expect(result.confidence).toBe('high');
    expect(result.matchType).toBe('name_org');
    expect(result.needsConfirmation).toBe(false);
  });

  it('resolves via fuzzy name with medium confidence + needsConfirmation', () => {
    documentStore.insertEntity({
      name: 'Sara Chen',  // Missing 'h' — Levenshtein distance = 1
      type: 'person',
    });

    const { id } = contactStore.insertContact({
      displayName: 'Sarah Chen',
      emails: ['notmatched@other.com'],
    });
    const contact = contactStore.getContact(id)!;

    const result = resolver.resolve(contact);
    expect(result.confidence).toBe('medium');
    expect(result.matchType).toBe('fuzzy_name');
    expect(result.needsConfirmation).toBe(true);
  });

  it('returns new entity when no match found', () => {
    const { id } = contactStore.insertContact({
      displayName: 'Completely Unknown',
      emails: ['unknown@nowhere.com'],
    });
    const contact = contactStore.getContact(id)!;

    const result = resolver.resolve(contact);
    expect(result.matchedEntityId).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.matchType).toBe('new');
    expect(result.needsConfirmation).toBe(false);
  });

  it('deduplicates contacts with same device_contact_id on re-resolve', () => {
    const first = contactStore.insertContact({
      deviceContactId: 'dc-001',
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com'],
    });

    const second = contactStore.insertContact({
      deviceContactId: 'dc-001',
      displayName: 'Sarah Chen Updated',
      emails: ['sarah@acme.com'],
    });

    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('levenshteinDistance is correct for test cases', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
    expect(levenshteinDistance('abc', 'abd')).toBe(1);
    expect(levenshteinDistance('abc', 'ab')).toBe(1);
    expect(levenshteinDistance('abc', 'abcd')).toBe(1);
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('Sarah', 'Sara')).toBe(1);
    // Case insensitive
    expect(levenshteinDistance('ABC', 'abc')).toBe(0);
  });

  it('linkToExistingEntities merges entity IDs preserving existing', () => {
    const { id } = contactStore.insertContact({
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com'],
    });

    contactStore.updateContact(id, { emailEntityIds: ['ent_1'] });

    resolver.linkToExistingEntities(id, {
      emailEntityIds: ['ent_2', 'ent_1'],  // ent_1 already exists — should dedup
      calendarEntityIds: ['cal_1'],
    });

    const contact = contactStore.getContact(id)!;
    expect(contact.emailEntityIds).toEqual(['ent_1', 'ent_2']);
    expect(contact.calendarEntityIds).toEqual(['cal_1']);
  });

  it('resolves multiple email matches by taking first match', () => {
    documentStore.insertEntity({ name: 'sarah@acme.com', type: 'person' });
    documentStore.insertEntity({ name: 'sarah.chen@personal.com', type: 'person' });

    const { id } = contactStore.insertContact({
      displayName: 'Sarah Chen',
      emails: ['sarah@acme.com', 'sarah.chen@personal.com'],
    });
    const contact = contactStore.getContact(id)!;

    const result = resolver.resolve(contact);
    expect(result.confidence).toBe('high');
    expect(result.matchType).toBe('email');
    expect(result.matchedEntityId).not.toBeNull();
  });
});
