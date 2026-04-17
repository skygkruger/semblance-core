// @vitest-environment jsdom
/**
 * DataSourcesStep Onboarding Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataSourcesStep } from '../../packages/semblance-ui/pages/Onboarding/DataSourcesStep';

describe('DataSourcesStep', () => {
  it('renders all six data source cards', () => {
    render(<DataSourcesStep />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Files & Documents')).toBeTruthy();
    expect(screen.getByText('Contacts')).toBeTruthy();
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('Slack')).toBeTruthy();
  });

  it('renders headline and subtext', () => {
    render(<DataSourcesStep />);
    expect(screen.getByText('Connect your world')).toBeTruthy();
    expect(screen.getByText(/Everything stays on this device/)).toBeTruthy();
  });

  it('renders privacy signal with shield', () => {
    render(<DataSourcesStep />);
    expect(screen.getByText(/Your data never leaves this device/)).toBeTruthy();
  });

  it('renders more sources disclosure', () => {
    render(<DataSourcesStep />);
    expect(screen.getByText(/42 more sources/)).toBeTruthy();
  });

  it('shows Connect buttons for all sources when none connected', () => {
    render(<DataSourcesStep />);
    const connectButtons = screen.getAllByText('Connect');
    expect(connectButtons.length).toBe(6);
  });

  it('delegates every Connect click to onConnectSource — no fake local toggle', () => {
    // The DataSourcesStep never fakes "connected" locally anymore. Every click
    // delegates to the parent handler which shows a real toast / runs real OAuth /
    // triggers the real sync. This prevents the Health-fake-connect bug where
    // clicking a non-OAuth source painted "Connected" without doing anything.
    const onConnectSource = vi.fn();
    render(<DataSourcesStep onConnectSource={onConnectSource} />);
    const connectButtons = screen.getAllByText('Connect');
    // Click Files — non-OAuth, would have toggled locally before
    fireEvent.click(connectButtons[2]!);
    expect(onConnectSource).toHaveBeenCalledWith('files', expect.any(String));
    // UI state did NOT change — the parent is responsible for status updates
    expect(screen.getAllByText('Connect').length).toBe(6);
  });

  it('shows nudge when Continue clicked with 0 connected', () => {
    render(<DataSourcesStep />);
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText(/Connecting at least one source/)).toBeTruthy();
  });

  it('calls onContinue with connected IDs when sources are connected', () => {
    const onContinue = vi.fn();
    render(<DataSourcesStep initialConnected={new Set(['email', 'calendar'])} onContinue={onContinue} />);
    fireEvent.click(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledWith(expect.arrayContaining(['email', 'calendar']));
  });

  it('calls onSkip when Skip button clicked', () => {
    const onSkip = vi.fn();
    render(<DataSourcesStep onSkip={onSkip} />);
    fireEvent.click(screen.getByText('Skip for now'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('shows Connected status for pre-connected sources', () => {
    render(<DataSourcesStep initialConnected={new Set(['email', 'health'])} />);
    const connectedLabels = screen.getAllByText('Connected');
    expect(connectedLabels.length).toBe(2);
    expect(screen.getAllByText('Connect').length).toBe(4);
  });

  it('hides nudge after connecting a source', () => {
    render(<DataSourcesStep />);
    // Trigger nudge
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText(/Connecting at least one source/)).toBeTruthy();
    // Connect a non-OAuth source (Files is index 2)
    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[2]!);
    // Nudge should be gone
    expect(screen.queryByText(/Connecting at least one source/)).toBeNull();
  });
});
