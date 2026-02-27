// @vitest-environment jsdom
/**
 * ConnectorCard Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorCard } from '../../packages/semblance-ui/components/ConnectorCard/ConnectorCard';
import type { ConnectorCardProps } from '../../packages/semblance-ui/components/ConnectorCard/ConnectorCard';

function defaultProps(overrides?: Partial<ConnectorCardProps>): ConnectorCardProps {
  return {
    id: 'spotify',
    displayName: 'Spotify',
    description: 'Recently played, library, playlists, and top tracks',
    status: 'disconnected',
    isPremium: true,
    platform: 'all',
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onSync: vi.fn(),
    ...overrides,
  };
}

describe('ConnectorCard', () => {
  it('renders display name and description', () => {
    render(<ConnectorCard {...defaultProps()} />);
    expect(screen.getByText('Spotify')).toBeTruthy();
    expect(screen.getByText('Recently played, library, playlists, and top tracks')).toBeTruthy();
  });

  it('shows Connect button when disconnected', () => {
    render(<ConnectorCard {...defaultProps({ status: 'disconnected' })} />);
    expect(screen.getByText('Connect')).toBeTruthy();
  });

  it('shows Sync and Disconnect buttons when connected', () => {
    render(<ConnectorCard {...defaultProps({ status: 'connected' })} />);
    expect(screen.getByText('Sync')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
  });

  it('shows Connecting... text when pending', () => {
    render(<ConnectorCard {...defaultProps({ status: 'pending' })} />);
    expect(screen.getAllByText('Connecting...').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onConnect when Connect button clicked', () => {
    const onConnect = vi.fn();
    render(<ConnectorCard {...defaultProps({ onConnect })} />);
    fireEvent.click(screen.getByText('Connect'));
    expect(onConnect).toHaveBeenCalledWith('spotify');
  });

  it('calls onDisconnect when Disconnect button clicked', () => {
    const onDisconnect = vi.fn();
    render(<ConnectorCard {...defaultProps({ status: 'connected', onDisconnect })} />);
    fireEvent.click(screen.getByText('Disconnect'));
    expect(onDisconnect).toHaveBeenCalledWith('spotify');
  });

  it('calls onSync when Sync button clicked', () => {
    const onSync = vi.fn();
    render(<ConnectorCard {...defaultProps({ status: 'connected', onSync })} />);
    fireEvent.click(screen.getByText('Sync'));
    expect(onSync).toHaveBeenCalledWith('spotify');
  });

  it('shows DR badge for premium connectors', () => {
    render(<ConnectorCard {...defaultProps({ isPremium: true })} />);
    expect(screen.getByText('DR')).toBeTruthy();
  });

  it('does not show DR badge for free connectors', () => {
    render(<ConnectorCard {...defaultProps({ isPremium: false })} />);
    expect(screen.queryByText('DR')).toBeNull();
  });

  it('shows user email when connected', () => {
    render(<ConnectorCard {...defaultProps({ status: 'connected', userEmail: 'user@example.com' })} />);
    expect(screen.getByText('user@example.com')).toBeTruthy();
  });

  it('shows last synced time when connected', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<ConnectorCard {...defaultProps({ status: 'connected', lastSyncedAt: fiveMinutesAgo })} />);
    expect(screen.getByText('Synced 5m ago')).toBeTruthy();
  });

  it('displays correct status label for each status', () => {
    const { rerender } = render(<ConnectorCard {...defaultProps({ status: 'connected' })} />);
    expect(screen.getByText('Connected')).toBeTruthy();

    rerender(<ConnectorCard {...defaultProps({ status: 'disconnected' })} />);
    expect(screen.getByText('Not connected')).toBeTruthy();

    rerender(<ConnectorCard {...defaultProps({ status: 'error' })} />);
    expect(screen.getByText('Error')).toBeTruthy();
  });

  it('has correct data-testid', () => {
    render(<ConnectorCard {...defaultProps({ id: 'github' })} />);
    expect(screen.getByTestId('connector-card-github')).toBeTruthy();
  });
});
