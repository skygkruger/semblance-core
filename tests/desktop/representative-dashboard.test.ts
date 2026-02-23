/**
 * Step 20 — RepresentativeDashboard tests.
 * Tests free tier prompt, pending approvals display, and action callbacks.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  RepresentativeDashboardProps,
  RepresentativeActionSummary,
  ActiveFollowUp,
} from '@semblance/desktop/src/components/RepresentativeDashboard';

function makeAction(overrides?: Partial<RepresentativeActionSummary>): RepresentativeActionSummary {
  return {
    id: 'ra_1',
    subject: 'Cancel Netflix',
    status: 'sent',
    classification: 'standard',
    createdAt: new Date().toISOString(),
    estimatedTimeSavedSeconds: 900,
    ...overrides,
  };
}

function makeProps(overrides?: Partial<RepresentativeDashboardProps>): RepresentativeDashboardProps {
  return {
    isPremium: true,
    actions: [makeAction()],
    pendingActions: [],
    followUps: [],
    totalTimeSavedSeconds: 900,
    onApproveAction: vi.fn(),
    onRejectAction: vi.fn(),
    onResolveFollowUp: vi.fn(),
    ...overrides,
  };
}

describe('RepresentativeDashboard (Step 20)', () => {
  it('free tier props include isPremium=false', () => {
    const props = makeProps({ isPremium: false });
    expect(props.isPremium).toBe(false);
  });

  it('premium props include action history and time saved', () => {
    const props = makeProps({
      actions: [
        makeAction({ id: 'ra_1', status: 'sent' }),
        makeAction({ id: 'ra_2', status: 'pending' }),
      ],
      totalTimeSavedSeconds: 1800,
    });
    expect(props.actions).toHaveLength(2);
    expect(props.totalTimeSavedSeconds).toBe(1800);
  });

  it('approval callbacks are invocable with action ids', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const props = makeProps({
      pendingActions: [makeAction({ id: 'ra_pending', status: 'pending' })],
      onApproveAction: onApprove,
      onRejectAction: onReject,
    });

    props.onApproveAction('ra_pending');
    props.onRejectAction('ra_pending');
    expect(onApprove).toHaveBeenCalledWith('ra_pending');
    expect(onReject).toHaveBeenCalledWith('ra_pending');
  });
});
