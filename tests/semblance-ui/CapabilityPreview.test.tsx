// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CapabilityPreview } from '@semblance/ui';

describe('CapabilityPreview', () => {
  it('renders gated capability copy for witness attestation', () => {
    render(
      <CapabilityPreview
        feature="witness-attestation"
        newSalesEnabled={true}
        onFoundingCheckout={() => {}}
        onRedeem={() => {}}
      />,
    );

    expect(screen.getByTestId('capability-preview')).toHaveAttribute('data-feature', 'witness-attestation');
    expect(screen.getByText('Semblance Witness')).toBeInTheDocument();
    expect(screen.getByText(/Cryptographic proof of every action/)).toBeInTheDocument();
    expect(screen.getByText(/Preview only — activating Digital Representative/)).toBeInTheDocument();
  });

  it('shows founding checkout CTA when new sales are enabled', async () => {
    const user = userEvent.setup();
    const onFoundingCheckout = vi.fn();

    render(
      <CapabilityPreview
        feature="living-will"
        newSalesEnabled={true}
        onFoundingCheckout={onFoundingCheckout}
        onRedeem={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Join founding members' }));
    expect(onFoundingCheckout).toHaveBeenCalledTimes(1);
  });

  it('shows view plans instead of founding checkout when sales are frozen', () => {
    render(
      <CapabilityPreview
        feature="living-will"
        newSalesEnabled={false}
        onFoundingCheckout={() => {}}
        onRedeem={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Join founding members' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View plans' })).toBeInTheDocument();
  });

  it('never grants premium — preview surface only', () => {
    const { container } = render(
      <CapabilityPreview
        feature="import-digital-life"
        newSalesEnabled={true}
        onFoundingCheckout={() => {}}
        onRedeem={() => {}}
      />,
    );

    expect(container.querySelector('[data-premium-granted="true"]')).toBeNull();
    expect(screen.getByText(/requires a signed paid entitlement/)).toBeInTheDocument();
  });

  it('routes redeem CTA through callback without mutating entitlement state', async () => {
    const user = userEvent.setup();
    const onRedeem = vi.fn();

    render(
      <CapabilityPreview
        feature="representative-dashboard"
        newSalesEnabled={true}
        onFoundingCheckout={() => {}}
        onRedeem={onRedeem}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Redeem entitlement' }));
    expect(onRedeem).toHaveBeenCalledTimes(1);
  });
});
