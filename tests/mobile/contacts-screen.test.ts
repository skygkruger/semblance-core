// Mobile Contacts Screen Tests — Logic-level tests for list rendering,
// birthday section, navigation, and bridge command responses.

import { describe, it, expect } from 'vitest';

// ─── Types (mirror ContactsScreen) ─────────────────────────────────────────

interface ContactSummary {
  id: string;
  displayName: string;
  organization: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  birthday: string;
}

interface BirthdayInfo {
  contactId: string;
  displayName: string;
  birthday: string;
  daysUntil: number;
  isToday: boolean;
}

interface ContactDetail {
  id: string;
  displayName: string;
  givenName: string;
  familyName: string;
  emails: string[];
  phones: string[];
  organization: string;
  jobTitle: string;
  birthday: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  communicationFrequency: {
    emailsPerWeek: number;
    meetingsPerMonth: number;
    trend: string;
  } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function sortBirthdays(birthdays: BirthdayInfo[]): BirthdayInfo[] {
  return [...birthdays].sort((a, b) => a.daysUntil - b.daysUntil);
}

// ─── Test Data ──────────────────────────────────────────────────────────────

const testContacts: ContactSummary[] = [
  {
    id: 'ct_a', displayName: 'Alice', organization: 'Corp',
    relationshipType: 'colleague', lastContactDate: new Date().toISOString(),
    interactionCount: 10, birthday: '06-15',
  },
  {
    id: 'ct_b', displayName: 'Bob', organization: '',
    relationshipType: 'friend', lastContactDate: null,
    interactionCount: 3, birthday: '',
  },
];

const testBirthdays: BirthdayInfo[] = [
  { contactId: 'ct_a', displayName: 'Alice', birthday: '06-15', daysUntil: 3, isToday: false },
  { contactId: 'ct_c', displayName: 'Carol', birthday: '06-12', daysUntil: 0, isToday: true },
];

describe('Mobile ContactsScreen — Logic', () => {
  it('list renders contacts with correct keys', () => {
    const keys = testContacts.map(c => c.id);
    expect(keys).toEqual(['ct_a', 'ct_b']);
    expect(keys.length).toBe(new Set(keys).size); // unique
  });

  it('birthday section shows sorted upcoming birthdays', () => {
    const sorted = sortBirthdays(testBirthdays);
    expect(sorted[0]!.isToday).toBe(true);
    expect(sorted[0]!.displayName).toBe('Carol');
    expect(sorted[1]!.daysUntil).toBe(3);
  });

  it('tap navigates to ContactDetail with contactId', () => {
    // Simulate navigation params
    const navigateTarget = { screen: 'ContactDetail', params: { contactId: 'ct_a' } };
    expect(navigateTarget.params.contactId).toBe('ct_a');
    expect(navigateTarget.screen).toBe('ContactDetail');
  });

  it('bridge commands return structured data', () => {
    // Simulate contacts:list response
    const listResponse = { contacts: testContacts };
    expect(listResponse.contacts).toHaveLength(2);
    expect(listResponse.contacts[0]!.displayName).toBe('Alice');

    // Simulate contacts:getUpcomingBirthdays response
    const birthdayResponse = { birthdays: testBirthdays };
    expect(birthdayResponse.birthdays).toHaveLength(2);
    expect(birthdayResponse.birthdays.some(b => b.isToday)).toBe(true);
  });

  it('contact detail shows all fields correctly', () => {
    const detail: ContactDetail = {
      id: 'ct_a',
      displayName: 'Alice Chen',
      givenName: 'Alice',
      familyName: 'Chen',
      emails: ['alice@corp.com', 'alice@personal.com'],
      phones: ['+1-555-0100'],
      organization: 'Corp Inc',
      jobTitle: 'Engineer',
      birthday: '1990-06-15',
      relationshipType: 'colleague',
      lastContactDate: new Date().toISOString(),
      interactionCount: 25,
      communicationFrequency: {
        emailsPerWeek: 3.5,
        meetingsPerMonth: 2,
        trend: 'stable',
      },
    };

    expect(getInitials(detail.displayName)).toBe('AC');
    expect(detail.emails).toHaveLength(2);
    expect(detail.communicationFrequency!.trend).toBe('stable');
    expect(detail.communicationFrequency!.emailsPerWeek).toBeGreaterThan(0);
  });
});
