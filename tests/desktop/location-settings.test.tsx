// @vitest-environment jsdom
// Tests for LocationSettingsSection — renders real component.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationSettingsSection } from '@semblance/desktop/components/LocationSettingsSection';

describe('LocationSettingsSection', () => {
  it('renders Location Services heading', () => {
    render(<LocationSettingsSection />);
    expect(screen.getByText('Location Services')).toBeInTheDocument();
  });

  it('renders main location toggle', () => {
    render(<LocationSettingsSection />);
    expect(screen.getByText(/Location services/)).toBeInTheDocument();
  });

  it('hides sub-settings when location is disabled by default', () => {
    render(<LocationSettingsSection />);
    // Default locationSettings.enabled is false, so sub-toggles should be hidden
    expect(screen.queryByText('Weather awareness')).not.toBeInTheDocument();
  });
});
