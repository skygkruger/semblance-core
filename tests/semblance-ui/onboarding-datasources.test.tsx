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

  it('toggles a source to connected when Connect is clicked', () => {
    render(<DataSourcesStep />);
    // Get the first Connect button (Email)
    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);
    // Now Email should show "Connected" text
    expect(screen.getByText('Connected')).toBeTruthy();
    // And only 5 Connect buttons remain
    expect(screen.getAllByText('Connect').length).toBe(5);
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
    // Connect a source
    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);
    // Nudge should be gone
    expect(screen.queryByText(/Connecting at least one source/)).toBeNull();
  });
});
