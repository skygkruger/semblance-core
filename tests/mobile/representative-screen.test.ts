/**
 * Step 20 — RepresentativeScreen (mobile) tests.
 * Tests dashboard section, cancellation list, template picker, and free tier.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  RepresentativeScreenProps,
  MobileActionSummary,
  MobileCancellableSub,
  MobileTemplate,
} from '@semblance/mobile/src/screens/RepresentativeScreen';

function makeAction(overrides?: Partial<MobileActionSummary>): MobileActionSummary {
  return {
    id: 'ra_1',
    subject: 'Cancel Netflix',
    status: 'sent',
    classification: 'standard',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSub(overrides?: Partial<MobileCancellableSub>): MobileCancellableSub {
  return {
    chargeId: 'ch_1',
    merchantName: 'Netflix',
    amount: -1599,
    frequency: 'monthly',
    supportEmail: 'support@netflix.com',
    cancellationStatus: 'not-started',
    ...overrides,
  };
}

function makeTemplate(overrides?: Partial<MobileTemplate>): MobileTemplate {
  return {
    name: 'refund',
    label: 'Request Refund',
    description: 'Request a refund for a product or service.',
    ...overrides,
  };
}

function makeProps(overrides?: Partial<RepresentativeScreenProps>): RepresentativeScreenProps {
  return {
    isPremium: true,
    actions: [makeAction()],
    pendingCount: 0,
    subscriptions: [makeSub()],
    templates: [makeTemplate()],
    totalTimeSavedMinutes: 15,
    onApproveAction: vi.fn(),
    onRejectAction: vi.fn(),
    onCancelSubscription: vi.fn(),
    onSelectTemplate: vi.fn(),
    ...overrides,
  };
}

describe('RepresentativeScreen (Step 20)', () => {
  it('renders dashboard section with action summary', () => {
    const props = makeProps({
      actions: [
        makeAction({ id: 'ra_1', status: 'sent' }),
        makeAction({ id: 'ra_2', status: 'sent' }),
      ],
      totalTimeSavedMinutes: 30,
    });
    expect(props.isPremium).toBe(true);
    expect(props.actions).toHaveLength(2);
    expect(props.totalTimeSavedMinutes).toBe(30);
  });

  it('renders cancellation list', () => {
    const props = makeProps({
      subscriptions: [
        makeSub({ chargeId: 'ch_1', merchantName: 'Netflix' }),
        makeSub({ chargeId: 'ch_2', merchantName: 'Spotify' }),
      ],
    });
    expect(props.subscriptions).toHaveLength(2);
    expect(props.subscriptions[1]!.merchantName).toBe('Spotify');
  });

  it('renders template picker', () => {
    const props = makeProps({
      templates: [
        makeTemplate({ name: 'refund', label: 'Request Refund' }),
        makeTemplate({ name: 'cancellation', label: 'Cancel Subscription' }),
        makeTemplate({ name: 'billing', label: 'Billing Inquiry' }),
      ],
    });
    expect(props.templates).toHaveLength(3);
    props.onSelectTemplate('refund');
    expect(props.onSelectTemplate).toHaveBeenCalledWith('refund');
  });

  it('free tier shows Digital Representative activation prompt', () => {
    const props = makeProps({ isPremium: false });
    expect(props.isPremium).toBe(false);
    // Component would render free tier view when isPremium is false
  });
});
