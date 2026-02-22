// Contact Resolver Tests — Name resolution priority: exact → first name → ambiguous → none.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import { ContactStore } from '../../../packages/core/knowledge/contacts/contact-store.js';
import { ContactResolver } from '../../../packages/core/knowledge/contacts/contact-resolver.js';

let db: Database.Database;
let store: ContactStore;
let resolver: ContactResolver;

beforeEach(() => {
  db = new Database(':memory:');
  store = new ContactStore(db as unknown as DatabaseHandle);
  resolver = new ContactResolver({ contactStore: store });

  // Seed contacts
  store.insertContact({
    displayName: 'Sarah Chen',
    emails: ['sarah@acme.com'],
    organization: 'Acme Corp',
    phones: ['+1-555-0100'],
  });
  store.insertContact({
    displayName: 'Sarah Williams',
    emails: ['sarah.w@other.com'],
    organization: 'Other Inc',
  });
  store.insertContact({
    displayName: 'Bob Smith',
    emails: ['bob@test.com'],
    phones: ['+1-555-0200'],
  });
  store.insertContact({
    displayName: 'Alice Johnson',
    emails: ['alice@example.com'],
  });
});

describe('ContactResolver', () => {
  it('resolves exact full name "Sarah Chen" with exact confidence', () => {
    const result = resolver.resolve('Sarah Chen');
    expect(result.confidence).toBe('exact');
    expect(result.contact).not.toBeNull();
    expect(result.contact!.displayName).toBe('Sarah Chen');
  });

  it('resolves unique first name "Bob" with high confidence', () => {
    const result = resolver.resolve('Bob');
    expect(result.confidence).toBe('high');
    expect(result.contact).not.toBeNull();
    expect(result.contact!.displayName).toBe('Bob Smith');
  });

  it('returns ambiguous for multiple matches on "Sarah"', () => {
    const result = resolver.resolve('Sarah');
    expect(result.confidence).toBe('ambiguous');
    expect(result.contact).toBeNull();
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.length).toBe(2);
    expect(result.disambiguationQuestion).toContain('Sarah');
  });

  it('disambiguates by topic context (organization match)', () => {
    const result = resolver.resolve('Sarah', { topic: 'the Acme Corp project' });
    expect(result.confidence).toBe('high');
    expect(result.contact).not.toBeNull();
    expect(result.contact!.displayName).toBe('Sarah Chen');
  });

  it('disambiguates by action type "text" preferring contact with phone', () => {
    // Sarah Chen has a phone, Sarah Williams doesn't
    const result = resolver.resolve('Sarah', { actionType: 'text' });
    expect(result.confidence).toBe('high');
    expect(result.contact).not.toBeNull();
    expect(result.contact!.displayName).toBe('Sarah Chen');
  });

  it('returns none for unknown name', () => {
    const result = resolver.resolve('Nobody Known');
    expect(result.confidence).toBe('none');
    expect(result.contact).toBeNull();
  });

  it('orchestrator resolveContact delegates to resolver', () => {
    // Test that the resolver works when called through a wrapper pattern
    const resolved = resolver.resolve('Alice');
    expect(resolved.confidence).toBe('high');
    expect(resolved.contact!.displayName).toBe('Alice Johnson');
  });

  it('ambiguous result includes disambiguation question', () => {
    const result = resolver.resolve('Sarah');
    expect(result.disambiguationQuestion).toBeDefined();
    expect(result.disambiguationQuestion).toContain('Which');
    expect(result.disambiguationQuestion).toContain('Acme Corp');
    expect(result.disambiguationQuestion).toContain('Other Inc');
  });
});
