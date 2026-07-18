// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import { PremiumGate } from '../../packages/core/premium/premium-gate.js';
import { setLicensePublicKey } from '../../packages/core/premium/license-keys.js';
import {
  openCheckout,
  requestPortalUrl,
} from '../../packages/desktop/src/contexts/license-commerce.js';
import { UpgradeScreen } from '../../packages/semblance-ui/components/UpgradeScreen/UpgradeScreen.web.js';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  validDRKey,
} from '../fixtures/license-keys.js';

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

const baseProps = {
  currentTier: 'free' as const,
  isFoundingMember: false,
  foundingSeat: null,
  onCheckout: vi.fn(),
  onActivateKey: vi.fn(async () => ({ success: true })),
};

describe('release-manifest commerce freeze behavior', () => {
  it('renders no checkout controls while frozen', () => {
    const { container } = render(
      <UpgradeScreen {...baseProps} newSalesEnabled={false} />,
    );
    expect(screen.getByText('NEW SALES PAUSED')).toBeInTheDocument();
    expect(container.querySelector('.upgrade-screen__plans')).toBeNull();
    expect(baseProps.onCheckout).not.toHaveBeenCalled();
  });

  it('renders and invokes checkout controls only when sales are enabled', () => {
    const onCheckout = vi.fn();
    const { container } = render(
      <UpgradeScreen
        {...baseProps}
        newSalesEnabled
        onCheckout={onCheckout}
      />,
    );
    const checkoutButtons = container.querySelectorAll('.upgrade-screen__cta');
    expect(checkoutButtons).toHaveLength(3);
    fireEvent.click(checkoutButtons[0]!);
    expect(onCheckout).toHaveBeenCalledWith('monthly');
  });

  it('invoking frozen openCheckout never opens an external URL', () => {
    const opener = vi.fn();
    expect(openCheckout('monthly', false, opener)).toBe(false);
    expect(opener).not.toHaveBeenCalled();
  });

  it('requires a successful portal response and an exact Stripe HTTPS host', async () => {
    const response = (ok: boolean, url: unknown) => vi.fn(async () => ({
      ok,
      json: async () => ({ url }),
    })) as unknown as typeof fetch;

    await expect(requestPortalUrl('sem_key', response(false, 'https://billing.stripe.com/p/session')))
      .resolves.toBeNull();
    await expect(requestPortalUrl('sem_key', response(true, 'http://billing.stripe.com/p/session')))
      .resolves.toBeNull();
    await expect(requestPortalUrl('sem_key', response(true, 'https://billing.stripe.com.evil.test/p/session')))
      .resolves.toBeNull();
    await expect(requestPortalUrl('sem_key', response(true, 'https://billing.stripe.com:444/p/session')))
      .resolves.toBeNull();
    await expect(requestPortalUrl('sem_key', response(true, 'https://evil.test/?next=https://billing.stripe.com')))
      .resolves.toBeNull();
    await expect(requestPortalUrl('sem_key', response(true, 'not a url')))
      .resolves.toBeNull();
    await expect(requestPortalUrl('sem_key', response(true, 'https://billing.stripe.com/p/session_123')))
      .resolves.toBe('https://billing.stripe.com/p/session_123');
  });

  it('keeps paid activation and renewal capability independent of the freeze', () => {
    const db = new Database(':memory:');
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    expect(gate.activateLicense(validDRKey()).success).toBe(true);
    expect(gate.isPremium()).toBe(true);
    db.close();
  });
});
