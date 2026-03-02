// @vitest-environment jsdom
// AgentInput multi-file attachment UI tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { AgentInput } from '../../packages/semblance-ui/components/AgentInput/AgentInput.web';
import type { AttachmentPill } from '../../packages/semblance-ui/components/AgentInput/AgentInput.types';

describe('AgentInput — multi-file attachments', () => {
  const readyAttachments: AttachmentPill[] = [
    { id: 'a1', fileName: 'report.pdf', status: 'ready' },
    { id: 'a2', fileName: 'data.csv', status: 'ready' },
  ];

  it('renders attachment pills when attachments are provided', () => {
    render(<AgentInput attachments={readyAttachments} />);
    expect(screen.getByTestId('attachment-pills')).toBeTruthy();
    expect(screen.getByTestId('attachment-pill-a1')).toBeTruthy();
    expect(screen.getByTestId('attachment-pill-a2')).toBeTruthy();
  });

  it('shows file names in pills', () => {
    render(<AgentInput attachments={readyAttachments} />);
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('data.csv')).toBeTruthy();
  });

  it('calls onRemoveAttachment when dismiss is clicked', () => {
    const onRemove = vi.fn();
    render(<AgentInput attachments={readyAttachments} onRemoveAttachment={onRemove} />);

    const pills = screen.getAllByRole('button', { name: /dismiss/i });
    fireEvent.click(pills[0]!);
    expect(onRemove).toHaveBeenCalledWith('a1');
  });

  it('renders paperclip button when onAttach is provided', () => {
    const onAttach = vi.fn();
    render(<AgentInput onAttach={onAttach} />);
    expect(screen.getByTestId('attach-button')).toBeTruthy();
  });

  it('does not render paperclip button when onAttach is not provided', () => {
    render(<AgentInput />);
    expect(screen.queryByTestId('attach-button')).toBeNull();
  });

  it('calls onAttach when paperclip button is clicked', () => {
    const onAttach = vi.fn();
    render(<AgentInput onAttach={onAttach} />);
    fireEvent.click(screen.getByTestId('attach-button'));
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it('disables paperclip button when thinking', () => {
    const onAttach = vi.fn();
    render(<AgentInput onAttach={onAttach} thinking />);
    const btn = screen.getByTestId('attach-button');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows processing state on pills', () => {
    const processing: AttachmentPill[] = [
      { id: 'a1', fileName: 'loading.pdf', status: 'processing' },
    ];
    render(<AgentInput attachments={processing} />);
    const pill = screen.getByTestId('attachment-pill-a1');
    expect(pill.className).toContain('processing');
  });

  it('shows error state on pills', () => {
    const errored: AttachmentPill[] = [
      { id: 'a1', fileName: 'bad.pdf', status: 'error', error: 'Too large' },
    ];
    render(<AgentInput attachments={errored} />);
    const pill = screen.getByTestId('attachment-pill-a1');
    expect(pill.className).toContain('error');
  });

  it('falls back to legacy activeDocument when no attachments', () => {
    const onDismiss = vi.fn();
    render(
      <AgentInput
        activeDocument={{ name: 'legacy.pdf', onDismiss }}
      />,
    );
    expect(screen.getByTestId('attachment-pills')).toBeTruthy();
    expect(screen.getByText('legacy.pdf')).toBeTruthy();
  });

  it('prefers attachments over legacy activeDocument', () => {
    render(
      <AgentInput
        attachments={readyAttachments}
        activeDocument={{ name: 'old.pdf', onDismiss: vi.fn() }}
      />,
    );
    // Should show attachment files, not legacy
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.queryByText('old.pdf')).toBeNull();
  });

  it('renders no pills when no attachments and no activeDocument', () => {
    render(<AgentInput />);
    expect(screen.queryByTestId('attachment-pills')).toBeNull();
  });
});
