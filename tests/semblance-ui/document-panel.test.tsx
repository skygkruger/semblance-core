// @vitest-environment jsdom
// DocumentPanel component tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock formatFileSize
vi.mock('@semblance/core/agent/attachments', () => ({
  formatFileSize: (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`,
}));

import { DocumentPanel } from '../../packages/semblance-ui/components/DocumentPanel/DocumentPanel.web';
import type { DocumentPanelFile } from '../../packages/semblance-ui/components/DocumentPanel/DocumentPanel.types';

const mockFiles: DocumentPanelFile[] = [
  { id: 'f1', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 10240, status: 'ready', addedToKnowledge: false },
  { id: 'f2', fileName: 'data.csv', mimeType: 'text/csv', sizeBytes: 2048, status: 'ready', addedToKnowledge: true },
  { id: 'f3', fileName: 'loading.docx', mimeType: 'application/docx', sizeBytes: 0, status: 'processing', addedToKnowledge: false },
];

describe('DocumentPanel', () => {
  const defaultProps = {
    files: mockFiles,
    open: true,
    onClose: vi.fn(),
    onRemoveFile: vi.fn(),
    onAddToKnowledge: vi.fn(),
    onAttach: vi.fn(),
  };

  it('renders when open is true', () => {
    render(<DocumentPanel {...defaultProps} />);
    expect(screen.getByTestId('document-panel')).toBeTruthy();
  });

  it('does not render when open is false', () => {
    render(<DocumentPanel {...defaultProps} open={false} />);
    expect(screen.queryByTestId('document-panel')).toBeNull();
  });

  it('renders all files in the list', () => {
    render(<DocumentPanel {...defaultProps} />);
    expect(screen.getByTestId('doc-panel-file-f1')).toBeTruthy();
    expect(screen.getByTestId('doc-panel-file-f2')).toBeTruthy();
    expect(screen.getByTestId('doc-panel-file-f3')).toBeTruthy();
  });

  it('shows file names', () => {
    render(<DocumentPanel {...defaultProps} />);
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('data.csv')).toBeTruthy();
  });

  it('shows Add to Knowledge button for ready files not yet added', () => {
    render(<DocumentPanel {...defaultProps} />);
    expect(screen.getByTestId('add-to-knowledge-f1')).toBeTruthy();
  });

  it('does not show Add to Knowledge button for already-added files', () => {
    render(<DocumentPanel {...defaultProps} />);
    expect(screen.queryByTestId('add-to-knowledge-f2')).toBeNull();
  });

  it('calls onAddToKnowledge with file ID', () => {
    const onAdd = vi.fn();
    render(<DocumentPanel {...defaultProps} onAddToKnowledge={onAdd} />);
    fireEvent.click(screen.getByTestId('add-to-knowledge-f1'));
    expect(onAdd).toHaveBeenCalledWith('f1');
  });

  it('calls onRemoveFile when remove button clicked', () => {
    const onRemove = vi.fn();
    render(<DocumentPanel {...defaultProps} onRemoveFile={onRemove} />);
    const removeButtons = screen.getAllByLabelText('document_panel.remove_file');
    fireEvent.click(removeButtons[0]!);
    expect(onRemove).toHaveBeenCalledWith('f1');
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<DocumentPanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('document_panel.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no files', () => {
    render(<DocumentPanel {...defaultProps} files={[]} />);
    expect(screen.getByTestId('doc-panel-empty')).toBeTruthy();
  });

  it('shows attach button in empty state', () => {
    render(<DocumentPanel {...defaultProps} files={[]} />);
    expect(screen.getByTestId('doc-panel-attach')).toBeTruthy();
  });

  it('calls onAttach when attach button clicked', () => {
    const onAttach = vi.fn();
    render(<DocumentPanel {...defaultProps} files={[]} onAttach={onAttach} />);
    fireEvent.click(screen.getByTestId('doc-panel-attach'));
    expect(onAttach).toHaveBeenCalledTimes(1);
  });
});
