// @vitest-environment jsdom
// ArtifactPanel component tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ArtifactPanel } from '../../packages/semblance-ui/components/ArtifactPanel/ArtifactPanel.web';
import type { ArtifactItem } from '../../packages/semblance-ui/components/ArtifactPanel/ArtifactPanel.types';

const codeArtifact: ArtifactItem = {
  id: 'art-1',
  type: 'code',
  title: 'Hello World',
  content: 'console.log("hello");',
  language: 'typescript',
};

const markdownArtifact: ArtifactItem = {
  id: 'art-2',
  type: 'markdown',
  title: 'Summary',
  content: '## Overview\n\nThis is a summary.',
};

const csvArtifact: ArtifactItem = {
  id: 'art-3',
  type: 'csv',
  title: 'Data',
  content: 'name,age\nAlice,30\nBob,25',
};

const jsonArtifact: ArtifactItem = {
  id: 'art-4',
  type: 'json',
  title: 'Config',
  content: '{"key": "value"}',
};

describe('ArtifactPanel', () => {
  const defaultProps = {
    artifact: codeArtifact,
    open: true,
    onClose: vi.fn(),
  };

  it('renders when open is true with an artifact', () => {
    render(<ArtifactPanel {...defaultProps} />);
    expect(screen.getByTestId('artifact-panel')).toBeTruthy();
  });

  it('does not render when open is false', () => {
    render(<ArtifactPanel {...defaultProps} open={false} />);
    expect(screen.queryByTestId('artifact-panel')).toBeNull();
  });

  it('does not render when artifact is null', () => {
    render(<ArtifactPanel {...defaultProps} artifact={null} />);
    expect(screen.queryByTestId('artifact-panel')).toBeNull();
  });

  it('shows artifact title', () => {
    render(<ArtifactPanel {...defaultProps} />);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('shows type badge', () => {
    render(<ArtifactPanel {...defaultProps} />);
    expect(screen.getByText('code')).toBeTruthy();
  });

  it('renders code content in pre > code', () => {
    render(<ArtifactPanel {...defaultProps} />);
    expect(screen.getByText('console.log("hello");')).toBeTruthy();
  });

  it('renders markdown content', () => {
    render(<ArtifactPanel {...defaultProps} artifact={markdownArtifact} />);
    expect(screen.getByText(/## Overview/)).toBeTruthy();
  });

  it('renders CSV content', () => {
    render(<ArtifactPanel {...defaultProps} artifact={csvArtifact} />);
    expect(screen.getByText(/name,age/)).toBeTruthy();
  });

  it('renders JSON content in code block', () => {
    render(<ArtifactPanel {...defaultProps} artifact={jsonArtifact} />);
    expect(screen.getByText('{"key": "value"}')).toBeTruthy();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ArtifactPanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('artifact_panel.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows copy button', () => {
    render(<ArtifactPanel {...defaultProps} />);
    expect(screen.getByTestId('artifact-copy')).toBeTruthy();
  });

  it('shows download button when onDownload is provided', () => {
    const onDownload = vi.fn();
    render(<ArtifactPanel {...defaultProps} onDownload={onDownload} />);
    expect(screen.getByTestId('artifact-download')).toBeTruthy();
  });

  it('does not show download button when onDownload is not provided', () => {
    render(<ArtifactPanel {...defaultProps} />);
    expect(screen.queryByTestId('artifact-download')).toBeNull();
  });

  it('calls onDownload with the artifact when download button clicked', () => {
    const onDownload = vi.fn();
    render(<ArtifactPanel {...defaultProps} onDownload={onDownload} />);
    fireEvent.click(screen.getByTestId('artifact-download'));
    expect(onDownload).toHaveBeenCalledWith(codeArtifact);
  });

  it('sets data-language attribute on code blocks', () => {
    render(<ArtifactPanel {...defaultProps} />);
    const codeBlock = screen.getByText('console.log("hello");').closest('pre');
    expect(codeBlock?.getAttribute('data-language')).toBe('typescript');
  });
});
