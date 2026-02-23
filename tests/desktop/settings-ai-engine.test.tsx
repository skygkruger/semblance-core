// @vitest-environment jsdom
// Tests for Settings AI Engine section — renders real SettingsScreen component.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsScreen } from '@semblance/desktop/screens/SettingsScreen';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

describe('Settings AI Engine', () => {
  beforeEach(() => {
    clearInvokeMocks();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_accounts_status') return [];
      if (cmd === 'get_provider_presets') return {};
      if (cmd === 'get_search_settings') return { provider: 'brave', braveApiKeySet: false, searxngUrl: null, rateLimit: 60 };
      return null;
    });
  });

  it('renders AI Engine heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('AI Engine')).toBeInTheDocument();
  });

  it('renders three runtime mode buttons', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('defaults to builtin runtime with status message', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(/Built-in runtime/)).toBeInTheDocument();
  });

  it('switching to Ollama mode shows connection status', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText('Ollama'));
    expect(screen.getByText(/Ollama not connected/)).toBeInTheDocument();
  });

  it('switching to Custom mode shows coming-soon message', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText('Custom'));
    expect(screen.getByText(/Custom runtime configuration coming in a future update/)).toBeInTheDocument();
  });

  it('renders Runtime label', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Runtime')).toBeInTheDocument();
  });

  it('renders Settings page heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders Connected Accounts section', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Connected Accounts')).toBeInTheDocument();
  });

  it('renders Autonomy section', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Autonomy')).toBeInTheDocument();
  });

  it('renders Appearance section', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
  });
});
