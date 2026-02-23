// @vitest-environment jsdom
// Tests for ClipboardSettingsSection — renders real component.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClipboardSettingsSection } from '@semblance/desktop/components/ClipboardSettingsSection';

describe('ClipboardSettingsSection', () => {
  it('renders Clipboard Intelligence heading', () => {
    render(<ClipboardSettingsSection />);
    expect(screen.getByText('Clipboard Intelligence')).toBeInTheDocument();
  });

  it('renders monitoring toggle label', () => {
    render(<ClipboardSettingsSection />);
    expect(screen.getByText(/Clipboard monitoring/)).toBeInTheDocument();
  });

  it('defaults to monitoring disabled (no recent actions visible)', () => {
    render(<ClipboardSettingsSection />);
    // With default state (monitoringEnabled: false), no recent actions section should show
    expect(screen.queryByText(/Recent clipboard actions/i)).not.toBeInTheDocument();
  });

  it('renders a toggleable switch element', () => {
    render(<ClipboardSettingsSection />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
