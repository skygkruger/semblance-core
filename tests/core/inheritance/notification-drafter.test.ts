/**
 * Step 27 — NotificationDrafter tests (Commit 4).
 * Tests greeting pattern, recipient name, signoff pattern, contractions, fallback.
 */

import { describe, it, expect } from 'vitest';
import { NotificationDrafter } from '@semblance/core/inheritance/notification-drafter';
import type { StyleProfile } from '@semblance/core/style/style-profile';
import { createEmptyProfile } from '@semblance/core/style/style-profile';

function makeProfile(overrides?: Partial<StyleProfile>): StyleProfile {
  const base = createEmptyProfile();
  return {
    ...base,
    id: 'test-profile',
    isActive: true,
    ...overrides,
  };
}

const DEFAULT_INPUT = {
  recipientName: 'Sarah',
  recipientEmail: 'sarah@example.com',
  senderName: 'Alex',
  purpose: 'I wanted to let you know about some important account changes.',
};

describe('NotificationDrafter (Step 27)', () => {
  it('uses greeting pattern from style profile', () => {
    const profile = makeProfile({
      greetings: {
        patterns: [{ text: 'Hey', frequency: 0.8, contexts: ['casual'] }],
        usesRecipientName: true,
        usesNameVariant: 'first',
      },
    });

    const drafter = new NotificationDrafter(profile);
    const draft = drafter.draft(DEFAULT_INPUT);

    expect(draft.body).toContain('Hey Sarah,');
  });

  it('includes recipient name in greeting when usesRecipientName is true', () => {
    const profile = makeProfile({
      greetings: {
        patterns: [{ text: 'Hello,', frequency: 0.9, contexts: ['formal'] }],
        usesRecipientName: true,
        usesNameVariant: 'first',
      },
    });

    const drafter = new NotificationDrafter(profile);
    const draft = drafter.draft(DEFAULT_INPUT);

    expect(draft.body).toContain('Sarah');
  });

  it('uses signoff pattern from style profile', () => {
    const profile = makeProfile({
      signoffs: {
        patterns: [{ text: 'Best regards,', frequency: 0.7, contexts: ['formal'] }],
        includesName: true,
      },
    });

    const drafter = new NotificationDrafter(profile);
    const draft = drafter.draft(DEFAULT_INPUT);

    expect(draft.body).toContain('Best regards,');
    expect(draft.body).toContain('Alex');
  });

  it('expands contractions when profile indicates user avoids them', () => {
    const profile = makeProfile({
      vocabulary: {
        ...createEmptyProfile().vocabulary,
        usesContractions: false,
        contractionRate: 0,
      },
    });

    const drafter = new NotificationDrafter(profile);
    const draft = drafter.draft({
      ...DEFAULT_INPUT,
      templateSubject: "I don't have access",
      templateBody: "I can't reach the system and I'm unable to help.",
    });

    expect(draft.subject).toBe('I do not have access');
    expect(draft.body).toContain('cannot');
    expect(draft.body).toContain('I am unable');
    expect(draft.body).not.toContain("can't");
    expect(draft.body).not.toContain("I'm");
  });

  it('falls back to generic template when no profile exists', () => {
    const drafter = new NotificationDrafter(null);
    const draft = drafter.draft(DEFAULT_INPUT);

    expect(draft.subject).toContain('Alex');
    expect(draft.body).toContain('Dear Sarah,');
    expect(draft.body).toContain('Sincerely,');
    expect(draft.body).toContain(DEFAULT_INPUT.purpose);
  });
});
