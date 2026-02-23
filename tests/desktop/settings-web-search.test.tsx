// @vitest-environment jsdom
// Tests for Settings Web Search section — renders real SettingsScreen component.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsScreen } from '@semblance/desktop/screens/SettingsScreen';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

function mockSettingsInvoke() {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_accounts_status') return [];
    if (cmd === 'get_provider_presets') return {};
    if (cmd === 'get_search_settings') return {
      provider: 'brave',
      braveApiKeySet: false,
      searxngUrl: null,
      rateLimit: 60,
    };
    if (cmd === 'save_search_settings') return null;
    if (cmd === 'test_brave_api_key') return { success: true };
    return null;
  });
}

describe('Settings Web Search', () => {
  beforeEach(() => {
    clearInvokeMocks();
    mockSettingsInvoke();
  });

  it('renders Web Search heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Web Search')).toBeInTheDocument();
  });

  it('renders Search Provider label', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Search Provider')).toBeInTheDocument();
  });

  it('renders Brave Search provider button', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Brave Search')).toBeInTheDocument();
  });

  it('renders SearXNG provider button', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('SearXNG')).toBeInTheDocument();
  });

  it('shows Brave Search API Key input by default', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Brave Search API Key')).toBeInTheDocument();
  });

  it('shows Rate Limit label', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(/Rate Limit/)).toBeInTheDocument();
  });

  it('shows Save button for search settings', () => {
    render(<SettingsScreen />);
    // There are multiple Save buttons (name + search); at least one should exist
    const saveButtons = screen.getAllByText('Save');
    expect(saveButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('switches to SearXNG and shows URL input', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText('SearXNG'));
    expect(screen.getByText('SearXNG Instance URL')).toBeInTheDocument();
  });

  it('hides Brave Search API Key when SearXNG selected', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText('SearXNG'));
    expect(screen.queryByText('Brave Search API Key')).not.toBeInTheDocument();
  });

  it('calls get_search_settings on mount', () => {
    render(<SettingsScreen />);
    expect(invoke).toHaveBeenCalledWith('get_search_settings');
  });

  it('renders requests per minute in rate limit label', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(/requests per minute/)).toBeInTheDocument();
  });
});
