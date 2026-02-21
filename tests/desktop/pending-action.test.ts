// Tests for PendingActionBanner — action description, preview, approval patterns.
// Logic-level tests validating data transformations and display logic.

import { describe, it, expect } from 'vitest';

// ─── Types (mirror PendingActionBanner) ──────────────────────────────────────

interface PendingAction {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  reasoning: string;
  domain: string;
  tier: string;
  status: string;
  createdAt: string;
}

// ─── Extracted Logic Functions ───────────────────────────────────────────────

function describeAction(action: PendingAction): string {
  const payload = action.payload;
  switch (action.action) {
    case 'email.send': {
      const to = (payload['to'] as string[]) ?? [];
      const subject = (payload['subject'] as string) ?? 'No subject';
      return `Send email to ${to.join(', ')}: "${subject}"`;
    }
    case 'email.draft': {
      const subject = (payload['subject'] as string) ?? 'No subject';
      return `Save draft: "${subject}"`;
    }
    case 'email.archive': {
      const ids = (payload['messageIds'] as string[]) ?? [];
      return `Archive ${ids.length} email${ids.length !== 1 ? 's' : ''}`;
    }
    case 'calendar.create': {
      const title = (payload['title'] as string) ?? 'Untitled event';
      return `Create event: "${title}"`;
    }
    case 'calendar.delete': {
      return `Delete calendar event`;
    }
    default:
      return `${action.action} action`;
  }
}

function getPreviewContent(action: PendingAction): string | null {
  if (action.action === 'email.send' || action.action === 'email.draft') {
    const body = action.payload['body'] as string | undefined;
    if (body) {
      return body.length > 200 ? body.slice(0, 200) + '...' : body;
    }
  }
  return null;
}

function makeAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'action-1',
    action: 'email.send',
    payload: {
      to: ['bob@example.com'],
      subject: 'Test Subject',
      body: 'Test body content',
    },
    reasoning: 'User requested to send a reply',
    domain: 'email',
    tier: 'guardian',
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PendingActionBanner — Action Description', () => {
  it('describes email.send with recipients and subject', () => {
    const action = makeAction({
      action: 'email.send',
      payload: { to: ['alice@example.com', 'bob@example.com'], subject: 'Meeting Follow-up', body: 'Hi' },
    });
    const desc = describeAction(action);
    expect(desc).toBe('Send email to alice@example.com, bob@example.com: "Meeting Follow-up"');
  });

  it('describes email.draft with subject', () => {
    const action = makeAction({
      action: 'email.draft',
      payload: { subject: 'Draft Report', body: 'Content' },
    });
    expect(describeAction(action)).toBe('Save draft: "Draft Report"');
  });

  it('describes email.archive with count', () => {
    const action = makeAction({
      action: 'email.archive',
      payload: { messageIds: ['msg-1', 'msg-2', 'msg-3'] },
    });
    expect(describeAction(action)).toBe('Archive 3 emails');
  });

  it('handles singular archive', () => {
    const action = makeAction({
      action: 'email.archive',
      payload: { messageIds: ['msg-1'] },
    });
    expect(describeAction(action)).toBe('Archive 1 email');
  });

  it('describes calendar.create with title', () => {
    const action = makeAction({
      action: 'calendar.create',
      payload: { title: 'Team Sync' },
    });
    expect(describeAction(action)).toBe('Create event: "Team Sync"');
  });

  it('describes calendar.delete', () => {
    const action = makeAction({
      action: 'calendar.delete',
      payload: {},
    });
    expect(describeAction(action)).toBe('Delete calendar event');
  });

  it('handles unknown action type with fallback', () => {
    const action = makeAction({
      action: 'custom.unknown',
      payload: {},
    });
    expect(describeAction(action)).toBe('custom.unknown action');
  });

  it('handles missing payload fields gracefully', () => {
    const action = makeAction({
      action: 'email.send',
      payload: {},
    });
    const desc = describeAction(action);
    expect(desc).toContain('No subject');
  });
});

describe('PendingActionBanner — Preview Content', () => {
  it('returns body preview for email.send', () => {
    const action = makeAction({
      action: 'email.send',
      payload: { body: 'Hello, this is the body of the email.' },
    });
    expect(getPreviewContent(action)).toBe('Hello, this is the body of the email.');
  });

  it('truncates long body to 200 chars', () => {
    const longBody = 'A'.repeat(300);
    const action = makeAction({
      action: 'email.send',
      payload: { body: longBody },
    });
    const preview = getPreviewContent(action);
    expect(preview!.length).toBe(203); // 200 + '...'
    expect(preview!.endsWith('...')).toBe(true);
  });

  it('returns null for non-email actions', () => {
    const action = makeAction({
      action: 'calendar.create',
      payload: { title: 'Event' },
    });
    expect(getPreviewContent(action)).toBeNull();
  });

  it('returns null when no body present', () => {
    const action = makeAction({
      action: 'email.send',
      payload: { to: ['bob@test.com'], subject: 'No body' },
    });
    expect(getPreviewContent(action)).toBeNull();
  });

  it('returns body preview for email.draft', () => {
    const action = makeAction({
      action: 'email.draft',
      payload: { body: 'Draft content here' },
    });
    expect(getPreviewContent(action)).toBe('Draft content here');
  });
});

describe('PendingActionBanner — Approval Pattern Display', () => {
  it('displays pre-routine message when count < threshold', () => {
    const count = 1;
    const threshold = 3;
    const message = count < threshold
      ? `after ${threshold} approvals, this becomes automatic`
      : 'this action type is now routine';
    expect(message).toBe('after 3 approvals, this becomes automatic');
  });

  it('displays routine message when count >= threshold', () => {
    const count = 3;
    const threshold = 3;
    const message = count >= threshold
      ? 'this action type is now routine'
      : `after ${threshold} approvals, this becomes automatic`;
    expect(message).toBe('this action type is now routine');
  });

  it('displays singular time approved', () => {
    const count = 1;
    const display = `Similar actions approved: ${count} time${count !== 1 ? 's' : ''}`;
    expect(display).toBe('Similar actions approved: 1 time');
  });

  it('displays plural times approved', () => {
    const count = 5;
    const display = `Similar actions approved: ${count} time${count !== 1 ? 's' : ''}`;
    expect(display).toBe('Similar actions approved: 5 times');
  });
});

describe('PendingActionBanner — Stacking Indicator', () => {
  it('shows stacking indicator for multiple actions', () => {
    const actionCount = 3;
    const showStacking = actionCount > 1;
    const message = `${actionCount} pending actions`;
    expect(showStacking).toBe(true);
    expect(message).toBe('3 pending actions');
  });

  it('hides stacking indicator for single action', () => {
    const actionCount = 1;
    const showStacking = actionCount > 1;
    expect(showStacking).toBe(false);
  });

  it('hides stacking indicator for no actions', () => {
    const actionCount = 0;
    const showStacking = actionCount > 1;
    expect(showStacking).toBe(false);
  });
});

describe('PendingActionBanner — Domain Filtering', () => {
  it('filters actions by domain', () => {
    const actions = [
      makeAction({ id: 'a1', domain: 'email' }),
      makeAction({ id: 'a2', domain: 'calendar' }),
      makeAction({ id: 'a3', domain: 'email' }),
    ];
    const filter = 'email';
    const filtered = filter ? actions.filter(a => a.domain === filter) : actions;
    expect(filtered).toHaveLength(2);
    expect(filtered.every(a => a.domain === 'email')).toBe(true);
  });

  it('returns all actions when no filter', () => {
    const actions = [
      makeAction({ id: 'a1', domain: 'email' }),
      makeAction({ id: 'a2', domain: 'calendar' }),
    ];
    const filter: string | undefined = undefined;
    const filtered = filter ? actions.filter(a => a.domain === filter) : actions;
    expect(filtered).toHaveLength(2);
  });
});

describe('PendingActionBanner — Button Label Logic', () => {
  it('shows "Approve & Send" for email.send', () => {
    const action = makeAction({ action: 'email.send' });
    const label = action.action === 'email.send' ? 'Approve & Send' : 'Approve';
    expect(label).toBe('Approve & Send');
  });

  it('shows "Approve" for non-send actions', () => {
    const action = makeAction({ action: 'email.archive' });
    const label = action.action === 'email.send' ? 'Approve & Send' : 'Approve';
    expect(label).toBe('Approve');
  });
});
