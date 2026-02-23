// @vitest-environment jsdom
// Tests for CloudStorageSettingsSection — renders real component.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CloudStorageSettingsSection } from '@semblance/desktop/components/CloudStorageSettingsSection';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';
import { beforeEach } from 'vitest';

describe('CloudStorageSettingsSection', () => {
  beforeEach(() => {
    clearInvokeMocks();
    invoke.mockImplementation(async () => null);
  });

  it('renders Cloud Storage heading', () => {
    render(<CloudStorageSettingsSection />);
    expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
  });

  it('shows provider names', () => {
    render(<CloudStorageSettingsSection />);
    expect(screen.getByText('Google Drive')).toBeInTheDocument();
  });

  it('shows connect button when disconnected', () => {
    render(<CloudStorageSettingsSection />);
    // Default state: connected=false, so connect buttons should be visible
    expect(screen.getAllByText('Connect').length).toBeGreaterThan(0);
  });

  it('hides sync controls when disconnected', () => {
    render(<CloudStorageSettingsSection />);
    // Default: not connected, so no sync controls
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument();
  });
});
