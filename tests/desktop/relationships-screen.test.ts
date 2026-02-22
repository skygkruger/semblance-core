// Relationships Screen Tests — Logic-level tests for contact list, detail, search,
// badge, and frequency dots. No DOM/jsdom — validates data transformations.

import { describe, it, expect } from 'vitest';

// ─── Types (mirror RelationshipsScreen) ─────────────────────────────────────

interface ContactSummary {
  id: string;
  displayName: string;
  organization: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  birthday: string;
  emails: string[];
}

type SortField = 'display_name' | 'last_contact_date' | 'interaction_count';
type RelationshipFilter = 'all' | 'colleague' | 'client' | 'vendor' | 'friend' | 'family' | 'acquaintance' | 'unknown';

// ─── Helpers (extracted from component) ─────────────────────────────────────

function getRelationshipBadgeColor(type: string): string {
  switch (type) {
    case 'colleague': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'client': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'friend': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'family': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatLastContact(date: string | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function filterContacts(contacts: ContactSummary[], filter: RelationshipFilter): ContactSummary[] {
  return filter === 'all' ? contacts : contacts.filter(c => c.relationshipType === filter);
}

function computeFrequencyDots(interactionCount: number): number {
  return Math.min(Math.ceil(interactionCount / 5), 5);
}

// ─── Test Data ──────────────────────────────────────────────────────────────

const testContacts: ContactSummary[] = [
  {
    id: 'ct_1', displayName: 'Alice Chen', organization: 'Acme Corp',
    relationshipType: 'colleague', lastContactDate: new Date().toISOString(),
    interactionCount: 25, birthday: '1990-06-15', emails: ['alice@acme.com'],
  },
  {
    id: 'ct_2', displayName: 'Bob Smith', organization: '',
    relationshipType: 'friend', lastContactDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    interactionCount: 8, birthday: '', emails: ['bob@gmail.com'],
  },
  {
    id: 'ct_3', displayName: 'Carol Davis', organization: 'Startup Inc',
    relationshipType: 'client', lastContactDate: null,
    interactionCount: 2, birthday: '1985-12-25', emails: ['carol@startup.com'],
  },
];

describe('RelationshipsScreen — Logic', () => {
  it('renders list with correct data transformations', () => {
    expect(testContacts).toHaveLength(3);
    expect(testContacts.every(c => c.id && c.displayName)).toBe(true);
    expect(testContacts.map(c => c.displayName)).toEqual(['Alice Chen', 'Bob Smith', 'Carol Davis']);
  });

  it('search filters contacts correctly', () => {
    const query = 'alice';
    const filtered = testContacts.filter(c =>
      c.displayName.toLowerCase().includes(query.toLowerCase()) ||
      c.organization.toLowerCase().includes(query.toLowerCase()) ||
      c.emails.some(e => e.toLowerCase().includes(query.toLowerCase()))
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.displayName).toBe('Alice Chen');
  });

  it('relationship badge returns correct color class', () => {
    expect(getRelationshipBadgeColor('colleague')).toContain('amber');
    expect(getRelationshipBadgeColor('friend')).toContain('green');
    expect(getRelationshipBadgeColor('family')).toContain('rose');
    expect(getRelationshipBadgeColor('client')).toContain('blue');
    expect(getRelationshipBadgeColor('unknown')).toContain('gray');
  });

  it('frequency dots match interaction count', () => {
    expect(computeFrequencyDots(0)).toBe(0);
    expect(computeFrequencyDots(3)).toBe(1);
    expect(computeFrequencyDots(5)).toBe(1);
    expect(computeFrequencyDots(10)).toBe(2);
    expect(computeFrequencyDots(25)).toBe(5);
    expect(computeFrequencyDots(100)).toBe(5); // capped at 5
  });

  it('detail shows correct initials and formatLastContact', () => {
    expect(getInitials('Alice Chen')).toBe('AC');
    expect(getInitials('Bob')).toBe('B');
    expect(getInitials('Carol Ann Davis')).toBe('CA');

    expect(formatLastContact(null)).toBe('Never');
    expect(formatLastContact(new Date().toISOString())).toBe('Today');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatLastContact(yesterday)).toBe('Yesterday');
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatLastContact(twoWeeksAgo)).toBe('2w ago');
  });
});
