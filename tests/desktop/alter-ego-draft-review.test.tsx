// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlterEgoDraftReview } from '../../packages/semblance-ui/components/AlterEgoDraftReview/AlterEgoDraftReview.web';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key;
      const { defaultValue, ...rest } = opts;
      if (Object.keys(rest).length === 0) return key;
      return `${key}:${JSON.stringify(rest)}`;
    },
  }),
}));

describe('AlterEgoDraftReview', () => {
  const baseProps = {
    actionId: 'draft-001',
    contactEmail: 'alice@example.com',
    subject: 'Re: Project Timeline',
    body: 'Hi Alice,\n\nHere is the updated timeline as discussed.',
    trustCount: 1,
    trustThreshold: 3,
    onSend: vi.fn(),
    onEdit: vi.fn(),
  };

  it('renders contact email', () => {
    render(<AlterEgoDraftReview {...baseProps} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders draft body', () => {
    render(<AlterEgoDraftReview {...baseProps} />);
    // The body is rendered inside a div with white-space: pre-wrap.
    // Use getAllByText with a function matcher and pick the innermost element.
    const matches = screen.getAllByText((_content, element) => {
      if (!element || element.tagName !== 'DIV') return false;
      // Check the element's own style for pre-wrap to find the exact body div
      const style = (element as HTMLElement).style;
      return style.whiteSpace === 'pre-wrap';
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const bodyEl = matches[0]!;
    expect(bodyEl.textContent).toContain('Hi Alice,');
    expect(bodyEl.textContent).toContain('Here is the updated timeline as discussed.');
  });

  it('shows trust progress', () => {
    render(<AlterEgoDraftReview {...baseProps} />);

    // The trust indicator uses i18n key with count and threshold
    // Our mock returns: "alter_ego.trust_indicator:{\"count\":1,\"threshold\":3,...}"
    const trustText = screen.getByText(
      /alter_ego\.trust_indicator/,
    );
    expect(trustText).toBeInTheDocument();
    expect(trustText.textContent).toContain('"count":1');
    expect(trustText.textContent).toContain('"threshold":3');
  });

  it('calls onSend with actionId when Send clicked', () => {
    const onSend = vi.fn();
    render(<AlterEgoDraftReview {...baseProps} onSend={onSend} />);

    const sendButton = screen.getByText('button.send');
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('draft-001');
  });

  it('calls onEdit with body when Edit clicked', () => {
    const onEdit = vi.fn();
    render(<AlterEgoDraftReview {...baseProps} onEdit={onEdit} />);

    const editButton = screen.getByText('button.edit');
    fireEvent.click(editButton);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(
      'Hi Alice,\n\nHere is the updated timeline as discussed.',
    );
  });
});
