// @vitest-environment jsdom
// Tests for CloudFolderPicker — renders real component with props.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CloudFolderPicker } from '@semblance/desktop/components/CloudFolderPicker';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

describe('CloudFolderPicker', () => {
  beforeEach(() => {
    clearInvokeMocks();
    invoke.mockImplementation(async () => [
      { id: 'f1', name: 'Documents', hasChildren: true },
      { id: 'f2', name: 'Photos', hasChildren: false },
    ]);
  });

  it('renders modal with title when open', async () => {
    render(
      <CloudFolderPicker
        provider="google_drive"
        isOpen={true}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(await screen.findByText('Select Folders to Sync')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <CloudFolderPicker
        provider="google_drive"
        isOpen={false}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText('Select Folders to Sync')).not.toBeInTheDocument();
  });
});
