// @vitest-environment jsdom
// Tests for VoiceSettingsSection — renders real component.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceSettingsSection } from '@semblance/desktop/components/VoiceSettingsSection';

describe('VoiceSettingsSection', () => {
  it('renders Voice Interaction heading', () => {
    render(<VoiceSettingsSection />);
    expect(screen.getByText('Voice Interaction')).toBeInTheDocument();
  });

  it('renders main voice toggle', () => {
    render(<VoiceSettingsSection />);
    expect(screen.getByText(/Voice mode/)).toBeInTheDocument();
  });

  it('hides sub-settings when voice is disabled by default', () => {
    render(<VoiceSettingsSection />);
    // Default voiceSettings.enabled is false, so model options should be hidden
    expect(screen.queryByText('Speech Speed')).not.toBeInTheDocument();
  });
});
