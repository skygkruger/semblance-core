// Mobile Contacts Bridge — React Native adapter wrapping react-native-contacts.
//
// Permission flow: check → request → getAllContacts.
// Returns empty on denied permission. Never throws on permission denial.
//
// CRITICAL: No network imports. Contact data stays on device.

import type { ContactsAdapter, DeviceContact, ContactField, ContactAddress } from '@semblance/core/platform/types';

/**
 * Shape of a contact as returned by react-native-contacts.
 * Defined here to avoid importing the library at type level.
 */
interface RNContact {
  recordID: string;
  displayName: string;
  givenName: string;
  familyName: string;
  emailAddresses: Array<{ label: string; email: string }>;
  phoneNumbers: Array<{ label: string; number: string }>;
  company: string;
  jobTitle: string;
  birthday: { year?: number; month: number; day: number } | null;
  postalAddresses: Array<{
    label: string;
    street: string;
    city: string;
    state: string;
    postCode: string;
    country: string;
  }>;
  thumbnailPath: string;
}

function mapBirthday(birthday: RNContact['birthday']): string {
  if (!birthday) return '';
  if (birthday.year) {
    return `${birthday.year}-${String(birthday.month).padStart(2, '0')}-${String(birthday.day).padStart(2, '0')}`;
  }
  return `${String(birthday.month).padStart(2, '0')}-${String(birthday.day).padStart(2, '0')}`;
}

function mapRNContactToDevice(contact: RNContact): DeviceContact {
  const emails: ContactField[] = contact.emailAddresses.map(e => ({
    label: e.label || 'other',
    value: e.email,
  }));

  const phones: ContactField[] = contact.phoneNumbers.map(p => ({
    label: p.label || 'other',
    value: p.number,
  }));

  const addresses: ContactAddress[] = contact.postalAddresses.map(a => ({
    label: a.label || 'other',
    street: a.street || '',
    city: a.city || '',
    region: a.state || '',
    postalCode: a.postCode || '',
    country: a.country || '',
  }));

  return {
    deviceContactId: contact.recordID,
    displayName: contact.displayName || `${contact.givenName} ${contact.familyName}`.trim(),
    givenName: contact.givenName || '',
    familyName: contact.familyName || '',
    emails,
    phones,
    organization: contact.company || '',
    jobTitle: contact.jobTitle || '',
    birthday: mapBirthday(contact.birthday),
    addresses,
    thumbnailPath: contact.thumbnailPath || '',
  };
}

/**
 * Create the React Native contacts adapter.
 * Wraps react-native-contacts with proper permission handling.
 */
export function createMobileContactsAdapter(): ContactsAdapter {
  // Lazy import to avoid loading native module at type-checking time
  let Contacts: typeof import('react-native-contacts') | null = null;

  function getContacts() {
    if (!Contacts) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Contacts = require('react-native-contacts') as typeof import('react-native-contacts');
    }
    return Contacts!;
  }

  return {
    async checkPermission() {
      try {
        const result = await getContacts().checkPermission();
        if (result === 'authorized') return 'authorized';
        if (result === 'denied') return 'denied';
        return 'undetermined';
      } catch {
        return 'undetermined';
      }
    },

    async requestPermission() {
      try {
        const result = await getContacts().requestPermission();
        return result === 'authorized' ? 'authorized' : 'denied';
      } catch {
        return 'denied';
      }
    },

    async getAllContacts() {
      try {
        const permission = await getContacts().checkPermission();
        if (permission !== 'authorized') return [];

        const contacts = await getContacts().getAll() as unknown as RNContact[];
        return contacts.map(mapRNContactToDevice);
      } catch {
        return [];
      }
    },

    onContactsChanged(listener: () => void) {
      // react-native-contacts doesn't have a built-in change listener.
      // We use a polling approach or native module event in a future iteration.
      // For now, return a no-op unsubscribe.
      void listener;
      return () => {};
    },
  };
}
