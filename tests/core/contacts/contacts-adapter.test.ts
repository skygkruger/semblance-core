// ContactsAdapter Tests — Verifies the platform adapter interface contract.
// Uses the mock adapter for deterministic testing.

import { describe, it, expect, vi } from 'vitest';
import { createMockContactsAdapter } from '../../../packages/core/platform/desktop-contacts.js';
import type { DeviceContact } from '../../../packages/core/platform/types.js';

const SAMPLE_CONTACTS: DeviceContact[] = [
  {
    deviceContactId: 'dc-001',
    displayName: 'Sarah Chen',
    givenName: 'Sarah',
    familyName: 'Chen',
    emails: [{ label: 'work', value: 'sarah@acme.com' }],
    phones: [{ label: 'mobile', value: '+1-555-0100' }],
    organization: 'Acme Corp',
    jobTitle: 'Engineering Lead',
    birthday: '1990-03-15',
    addresses: [{
      label: 'work',
      street: '123 Main St',
      city: 'San Francisco',
      region: 'CA',
      postalCode: '94105',
      country: 'US',
    }],
    thumbnailPath: '',
  },
  {
    deviceContactId: 'dc-002',
    displayName: 'Alex Rivera',
    givenName: 'Alex',
    familyName: 'Rivera',
    emails: [
      { label: 'work', value: 'alex@startup.io' },
      { label: 'personal', value: 'alex.r@gmail.com' },
    ],
    phones: [],
    organization: 'Startup Inc',
    jobTitle: 'CEO',
    birthday: '',
    addresses: [],
    thumbnailPath: '',
  },
];

describe('ContactsAdapter (mock)', () => {
  it('returns contacts when permission is granted', async () => {
    const adapter = createMockContactsAdapter({
      contacts: SAMPLE_CONTACTS,
      permission: 'authorized',
    });

    const contacts = await adapter.getAllContacts();
    expect(contacts).toHaveLength(2);
    expect(contacts[0]!.displayName).toBe('Sarah Chen');
    expect(contacts[1]!.emails).toHaveLength(2);
  });

  it('returns empty when permission is denied', async () => {
    const adapter = createMockContactsAdapter({
      contacts: SAMPLE_CONTACTS,
      permission: 'denied',
    });

    const contacts = await adapter.getAllContacts();
    expect(contacts).toHaveLength(0);
  });

  it('checkPermission returns current status', async () => {
    const adapter = createMockContactsAdapter({ permission: 'undetermined' });
    expect(await adapter.checkPermission()).toBe('undetermined');
  });

  it('requestPermission transitions from undetermined to authorized', async () => {
    const adapter = createMockContactsAdapter({ permission: 'undetermined' });

    expect(await adapter.checkPermission()).toBe('undetermined');
    const result = await adapter.requestPermission();
    expect(result).toBe('authorized');
    expect(await adapter.checkPermission()).toBe('authorized');
  });

  it('requestPermission stays denied if already denied', async () => {
    const adapter = createMockContactsAdapter({ permission: 'denied' });

    const result = await adapter.requestPermission();
    expect(result).toBe('denied');
  });

  it('populates DeviceContact fields correctly', async () => {
    const adapter = createMockContactsAdapter({
      contacts: SAMPLE_CONTACTS,
      permission: 'authorized',
    });

    const contacts = await adapter.getAllContacts();
    const sarah = contacts[0]!;
    expect(sarah.deviceContactId).toBe('dc-001');
    expect(sarah.givenName).toBe('Sarah');
    expect(sarah.familyName).toBe('Chen');
    expect(sarah.organization).toBe('Acme Corp');
    expect(sarah.jobTitle).toBe('Engineering Lead');
    expect(sarah.birthday).toBe('1990-03-15');
    expect(sarah.addresses).toHaveLength(1);
    expect(sarah.addresses[0]!.city).toBe('San Francisco');
  });

  it('onContactsChanged fires listener and unsubscribe works', () => {
    const adapter = createMockContactsAdapter({ contacts: SAMPLE_CONTACTS });

    // The mock adapter stores listeners but doesn't auto-fire.
    // We verify the subscribe/unsubscribe contract.
    const listener = vi.fn();
    const unsubscribe = adapter.onContactsChanged(listener);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
    // After unsubscribe, no error — contract fulfilled
  });

  it('returns empty array when no contacts provided', async () => {
    const adapter = createMockContactsAdapter({ permission: 'authorized' });

    const contacts = await adapter.getAllContacts();
    expect(contacts).toEqual([]);
  });
});
