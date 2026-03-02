// @vitest-environment jsdom
/**
 * ConnectorCard i18n Component Smoke Test
 *
 * Validates that ConnectorCard renders.
 * react-i18next is mocked globally via vitest alias.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorCard } from '../../packages/semblance-ui/components/ConnectorCard/ConnectorCard.web';

describe('ConnectorCard — i18n smoke test', () => {
  it('renders with disconnected status', () => {
    const { container } = render(
      <ConnectorCard
        id="gmail"
        displayName="Gmail"
        description="Email, calendar, and contacts"
        status="disconnected"
        isPremium={false}
        platform="all"
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSync={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
    expect(screen.getByText('Gmail')).toBeTruthy();
    expect(screen.getByText('Email, calendar, and contacts')).toBeTruthy();
  });

  it('renders with connected status', () => {
    const { container } = render(
      <ConnectorCard
        id="outlook"
        displayName="Outlook"
        description="Microsoft 365 email and calendar"
        status="connected"
        isPremium={false}
        platform="all"
        userEmail="user@outlook.com"
        lastSyncedAt={new Date().toISOString()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSync={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
    expect(screen.getByText('Outlook')).toBeTruthy();
  });
});
