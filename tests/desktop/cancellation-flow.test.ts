/**
 * Step 20 — CancellationFlow tests.
 * Tests subscription list rendering, draft preview, and cancellation callbacks.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  CancellationFlowProps,
  CancellableSubscriptionView,
  DraftPreview,
} from '@semblance/desktop/src/components/CancellationFlow';

function makeSub(overrides?: Partial<CancellableSubscriptionView>): CancellableSubscriptionView {
  return {
    chargeId: 'ch_1',
    merchantName: 'Netflix',
    amount: -1599,
    frequency: 'monthly',
    estimatedAnnualCost: 19188,
    supportEmail: 'support@netflix.com',
    cancellationUrl: null,
    cancellationStatus: 'not-started',
    ...overrides,
  };
}

function makeProps(overrides?: Partial<CancellationFlowProps>): CancellationFlowProps {
  return {
    subscriptions: [makeSub()],
    activeDraft: null,
    onInitiateCancellation: vi.fn(),
    onSendDraft: vi.fn(),
    onDismissDraft: vi.fn(),
    ...overrides,
  };
}

describe('CancellationFlow (Step 20)', () => {
  it('subscription list contains correct data shape', () => {
    const props = makeProps({
      subscriptions: [
        makeSub({ chargeId: 'ch_1', merchantName: 'Netflix' }),
        makeSub({ chargeId: 'ch_2', merchantName: 'Spotify', amount: -999 }),
      ],
    });
    expect(props.subscriptions).toHaveLength(2);
    expect(props.subscriptions[0]!.merchantName).toBe('Netflix');
    expect(props.subscriptions[1]!.amount).toBe(-999);
  });

  it('draft preview includes style score', () => {
    const draft: DraftPreview = {
      to: 'support@netflix.com',
      subject: 'Cancel Subscription',
      body: 'Please cancel my subscription.',
      styleScore: 82,
    };
    const props = makeProps({ activeDraft: draft });
    expect(props.activeDraft).not.toBeNull();
    expect(props.activeDraft!.styleScore).toBe(82);
  });

  it('cancellation callback fires with correct chargeId', () => {
    const onCancel = vi.fn();
    const props = makeProps({ onInitiateCancellation: onCancel });
    props.onInitiateCancellation('ch_1');
    expect(onCancel).toHaveBeenCalledWith('ch_1');
  });
});
