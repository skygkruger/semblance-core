// @vitest-environment jsdom
/**
 * PrivacyBadge i18n Component Smoke Test
 *
 * Validates that PrivacyBadge renders.
 * react-i18next is mocked globally via vitest alias.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PrivacyBadge } from '../../packages/semblance-ui/components/PrivacyBadge/PrivacyBadge.web';

describe('PrivacyBadge — i18n smoke test', () => {
  it('renders with default active status', () => {
    const { container } = render(<PrivacyBadge />);
    expect(container).toBeTruthy();
    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).toBeTruthy();
  });

  it('renders with offline status', () => {
    const { container } = render(<PrivacyBadge status="offline" />);
    expect(container).toBeTruthy();
    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).toBeTruthy();
  });

  it('renders with syncing status', () => {
    const { container } = render(<PrivacyBadge status="syncing" />);
    expect(container).toBeTruthy();
  });
});
