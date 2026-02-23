// @vitest-environment jsdom
// Tests for NetworkMonitorScreen — renders real component with mock data.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworkMonitorScreen } from '@semblance/desktop/screens/NetworkMonitorScreen';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

const mockStats = {
  period: 'today',
  totalConnections: 12,
  connectionsByService: { email: 8, calendar: 4 },
  connectionsByAction: { 'email.fetch': 6, 'email.send': 2, 'calendar.fetch': 4 },
  unauthorizedAttempts: 0,
  uniqueServicesContacted: 2,
  averageTimeSavedSeconds: 30,
  totalTimeSavedSeconds: 360,
};

const mockConnections = [
  { id: 'c1', service: 'Gmail (IMAP)', protocol: 'IMAP', connectedSince: '2026-02-22T08:00:00Z', status: 'active' as const, lastActivity: new Date().toISOString() },
  { id: 'c2', service: 'Google Calendar', protocol: 'CalDAV', connectedSince: '2026-02-22T08:00:00Z', status: 'idle' as const, lastActivity: new Date().toISOString() },
];

const mockAllowlist = [
  { service: 'Gmail', domain: 'imap.gmail.com', protocol: 'IMAP', addedAt: '2026-01-01T00:00:00Z', addedBy: 'onboarding', connectionCount: 847, lastUsed: new Date().toISOString(), isActive: true },
  { service: 'Google Calendar', domain: 'caldav.google.com', protocol: 'CalDAV', addedAt: '2026-01-01T00:00:00Z', addedBy: 'onboarding', connectionCount: 234, lastUsed: new Date().toISOString(), isActive: true },
];

const mockTimeline = [
  { timestamp: '2026-02-22T08:00:00', connections: 3 },
  { timestamp: '2026-02-22T09:00:00', connections: 5 },
  { timestamp: '2026-02-22T10:00:00', connections: 2 },
];

const mockHistory = [
  { id: 'h1', timestamp: new Date().toISOString(), service: 'Email', action: 'email.fetch', direction: 'outbound' as const, status: 'success' as const, requestId: 'req-1', durationMs: 120 },
  { id: 'h2', timestamp: new Date().toISOString(), service: 'Calendar', action: 'calendar.fetch', direction: 'outbound' as const, status: 'success' as const, requestId: 'req-2', durationMs: 85 },
];

const mockUnauthorizedAttempts = [
  { id: 'u1', timestamp: new Date().toISOString(), domain: 'evil.com', service: 'unknown', status: 'blocked' },
  { id: 'u2', timestamp: new Date().toISOString(), domain: 'tracker.net', service: 'unknown', status: 'blocked' },
];

function mockNetworkInvoke(overrides?: { unauthorizedCount?: number }) {
  const unauthorizedList = overrides?.unauthorizedCount
    ? mockUnauthorizedAttempts.slice(0, overrides.unauthorizedCount)
    : [];
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_network_statistics') return mockStats;
    if (cmd === 'get_active_connections') return mockConnections;
    if (cmd === 'get_network_allowlist') return mockAllowlist;
    if (cmd === 'get_unauthorized_attempts') return unauthorizedList;
    if (cmd === 'get_connection_timeline') return mockTimeline;
    if (cmd === 'get_connection_history') return mockHistory;
    if (cmd === 'generate_privacy_report') return { metadata: {}, summary: {}, services: [], auditTrailHash: 'abc', statement: 'Clean.' };
    return null;
  });
}

describe('NetworkMonitorScreen', () => {
  beforeEach(() => {
    clearInvokeMocks();
  });

  it('shows loading state initially', () => {
    invoke.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<NetworkMonitorScreen />);
    expect(screen.getByText('Loading network monitor...')).toBeInTheDocument();
  });

  it('renders Network Monitor heading after load', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText('Network Monitor')).toBeInTheDocument();
  });

  it('shows zero unauthorized connections when clean', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText('Zero unauthorized connections')).toBeInTheDocument();
  });

  it('shows privacy assurance message when clean', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText(/only the services you authorized/)).toBeInTheDocument();
  });

  it('shows unauthorized warning when not clean', async () => {
    mockNetworkInvoke({ unauthorizedCount: 2 });
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText(/2 unauthorized attempt/)).toBeInTheDocument();
  });

  it('renders Active Connections section', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText('Active Connections')).toBeInTheDocument();
  });

  it('shows connection service names', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText(/Gmail \(IMAP\)/)).toBeInTheDocument();
    expect(screen.getByText(/Google Calendar \(CalDAV\)/)).toBeInTheDocument();
  });

  it('renders Authorized Services section', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText('Authorized Services')).toBeInTheDocument();
  });

  it('shows authorized service connection counts', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText(/847 connections/)).toBeInTheDocument();
  });

  it('renders Connection Log section', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText('Connection Log')).toBeInTheDocument();
  });

  it('shows Generate Proof of Privacy Report button', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText('Generate Proof of Privacy Report')).toBeInTheDocument();
  });

  it('shows period selection buttons', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    await screen.findByText('Network Monitor');
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText('Month')).toBeInTheDocument();
  });

  it('shows total connection count in activity chart', async () => {
    mockNetworkInvoke();
    render(<NetworkMonitorScreen />);
    expect(await screen.findByText(/12 connections/)).toBeInTheDocument();
  });
});
