// @vitest-environment jsdom
/**
 * FeatureGate component tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureGate } from '@semblance/ui';

describe('FeatureGate', () => {
  it('premium user sees children', () => {
    render(
      <FeatureGate feature="spending-insights" isPremium={true}>
        <div data-testid="premium-content">Premium content</div>
      </FeatureGate>
    );

    expect(screen.getByTestId('premium-content')).toBeInTheDocument();
  });

  it('free user sees default fallback', () => {
    render(
      <FeatureGate feature="spending-insights" isPremium={false}>
        <div data-testid="premium-content">Premium content</div>
      </FeatureGate>
    );

    expect(screen.queryByTestId('premium-content')).not.toBeInTheDocument();
    expect(screen.getByText(/Digital Representative feature/)).toBeInTheDocument();
    expect(screen.getByText('Learn more')).toBeInTheDocument();
    expect(screen.getByText('Not right now')).toBeInTheDocument();
  });

  it('custom fallback renders', () => {
    render(
      <FeatureGate
        feature="plaid-integration"
        isPremium={false}
        fallback={<div data-testid="custom-fallback">Custom locked message</div>}
      >
        <div data-testid="premium-content">Premium content</div>
      </FeatureGate>
    );

    expect(screen.queryByTestId('premium-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('dismiss hides default fallback', async () => {
    const { user } = await import('@testing-library/user-event').then((m) => ({
      user: m.default.setup(),
    }));

    render(
      <FeatureGate feature="spending-insights" isPremium={false}>
        <div>Premium content</div>
      </FeatureGate>
    );

    const dismissBtn = screen.getByText('Not right now');
    await user.click(dismissBtn);

    expect(screen.queryByText(/Digital Representative feature/)).not.toBeInTheDocument();
  });
});
