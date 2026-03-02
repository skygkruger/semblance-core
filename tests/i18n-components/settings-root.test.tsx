// @vitest-environment jsdom
/**
 * SettingsRoot i18n Component Smoke Test
 *
 * Validates that SettingsRoot renders.
 * react-i18next is mocked globally via vitest alias.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SettingsRoot } from '../../packages/semblance-ui/components/Settings/SettingsRoot.web';

describe('SettingsRoot — i18n smoke test', () => {
  it('renders with full props', () => {
    const { container } = render(
      <SettingsRoot
        currentModel="llama-3.2-3b"
        activeConnections={2}
        notificationSummary="Daily digest enabled"
        autonomyTier="partner"
        privacyStatus="clean"
        licenseStatus="founding-member"
        appVersion="0.1.0"
        onNavigate={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
    expect(container.textContent).toBeTruthy();
    expect(container.textContent!.length).toBeGreaterThan(0);
  });

  it('renders with alter-ego tier and expired license', () => {
    const { container } = render(
      <SettingsRoot
        currentModel="phi-3-mini"
        activeConnections={0}
        notificationSummary="All notifications disabled"
        autonomyTier="alter-ego"
        privacyStatus="review-needed"
        licenseStatus="expired"
        appVersion="0.2.0"
        onNavigate={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
