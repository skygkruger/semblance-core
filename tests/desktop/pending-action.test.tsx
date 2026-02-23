// @vitest-environment jsdom
// Tests for PendingActionBanner — imports real logic functions and renders real component.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  describeAction,
  getPreviewContent,
  PendingActionBanner,
  type PendingAction,
} from '@semblance/desktop/components/PendingActionBanner';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

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

// ─── Logic Tests (import real functions from source) ──────────────────────────

describe('PendingActionBanner — describeAction (real import)', () => {
  it('describes email.send with recipients and subject', () => {
    const action = makeAction({
      action: 'email.send',
      payload: { to: ['alice@example.com', 'bob@example.com'], subject: 'Meeting Follow-up', body: 'Hi' },
    });
    expect(describeAction(action)).toBe('Send email to alice@example.com, bob@example.com: "Meeting Follow-up"');
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
    expect(describeAction(action)).toContain('No subject');
  });
});

describe('PendingActionBanner — getPreviewContent (real import)', () => {
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
    expect(preview!.length).toBe(203);
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

// ─── Rendering Tests (real component) ─────────────────────────────────────────

describe('PendingActionBanner — Rendering', () => {
  beforeEach(() => {
    clearInvokeMocks();
  });

  it('renders nothing when no pending actions', async () => {
    invoke.mockResolvedValue([]);
    const { container } = render(<PendingActionBanner />);
    // Component returns null when no actions
    await new Promise(r => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('renders action description from real describeAction', async () => {
    const actions: PendingAction[] = [
      makeAction({
        id: 'a1',
        action: 'email.send',
        payload: { to: ['alice@test.com'], subject: 'Hello', body: 'Hi Alice' },
      }),
    ];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 1;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner />);
    expect(await screen.findByText('Send email to alice@test.com: "Hello"')).toBeInTheDocument();
  });

  it('shows Approve & Send button for email.send', async () => {
    const actions: PendingAction[] = [makeAction({ id: 'a1', action: 'email.send' })];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 0;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner />);
    expect(await screen.findByText('Approve & Send')).toBeInTheDocument();
  });

  it('shows Approve button for non-send actions', async () => {
    const actions: PendingAction[] = [
      makeAction({ id: 'a1', action: 'email.archive', payload: { messageIds: ['m1'] } }),
    ];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 0;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner />);
    const approveBtn = await screen.findByText('Approve');
    expect(approveBtn).toBeInTheDocument();
  });

  it('calls approve_action when Approve clicked', async () => {
    const user = userEvent.setup();
    const actions: PendingAction[] = [
      makeAction({ id: 'a1', action: 'calendar.create', payload: { title: 'Sync' } }),
    ];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 0;
      if (cmd === 'get_approval_threshold') return 3;
      if (cmd === 'approve_action') return undefined;
      return null;
    });

    render(<PendingActionBanner />);
    const approveBtn = await screen.findByText('Approve');
    await user.click(approveBtn);
    expect(invoke).toHaveBeenCalledWith('approve_action', { actionId: 'a1' });
  });

  it('calls reject_action when Reject clicked', async () => {
    const user = userEvent.setup();
    const actions: PendingAction[] = [makeAction({ id: 'a1' })];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 0;
      if (cmd === 'get_approval_threshold') return 3;
      if (cmd === 'reject_action') return undefined;
      return null;
    });

    render(<PendingActionBanner />);
    const rejectBtn = await screen.findByText('Reject');
    await user.click(rejectBtn);
    expect(invoke).toHaveBeenCalledWith('reject_action', { actionId: 'a1' });
  });

  it('shows approval pattern text with pre-routine message', async () => {
    const actions: PendingAction[] = [makeAction({ id: 'a1' })];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 1;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner />);
    expect(await screen.findByText(/Similar actions approved: 1 time/)).toBeInTheDocument();
    expect(await screen.findByText(/after 3 approvals, this becomes automatic/)).toBeInTheDocument();
  });

  it('shows routine message when count >= threshold', async () => {
    const actions: PendingAction[] = [makeAction({ id: 'a1' })];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 5;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner />);
    expect(await screen.findByText(/this action type is now routine/)).toBeInTheDocument();
  });

  it('shows stacking indicator for multiple actions', async () => {
    const actions: PendingAction[] = [
      makeAction({ id: 'a1', domain: 'email' }),
      makeAction({ id: 'a2', domain: 'calendar', action: 'calendar.create', payload: { title: 'Sync' } }),
      makeAction({ id: 'a3', domain: 'email' }),
    ];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 0;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner />);
    expect(await screen.findByText('3 pending actions')).toBeInTheDocument();
  });

  it('filters actions by domain when filter prop provided', async () => {
    const actions: PendingAction[] = [
      makeAction({ id: 'a1', domain: 'email', payload: { to: ['x@y.com'], subject: 'Email1', body: 'b' } }),
      makeAction({ id: 'a2', domain: 'calendar', action: 'calendar.create', payload: { title: 'Meeting' } }),
    ];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pending_actions') return actions;
      if (cmd === 'get_approval_count') return 0;
      if (cmd === 'get_approval_threshold') return 3;
      return null;
    });

    render(<PendingActionBanner filter="calendar" />);
    expect(await screen.findByText('Create event: "Meeting"')).toBeInTheDocument();
    expect(screen.queryByText(/Email1/)).not.toBeInTheDocument();
  });
});
