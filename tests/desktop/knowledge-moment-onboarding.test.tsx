// @vitest-environment jsdom
// Tests for KnowledgeMomentDisplay — renders real component with various data states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KnowledgeMomentDisplay } from '@semblance/desktop/components/KnowledgeMomentDisplay';
import { clearInvokeMocks } from '../helpers/mock-tauri';

const fullMoment = {
  tier: 1 as const,
  upcomingMeeting: {
    title: 'Budget Review',
    startTime: '2025-01-15T10:00:00Z',
    attendees: ['alice@example.com'],
  },
  emailContext: {
    attendeeName: 'Alice',
    recentEmailCount: 5,
    lastEmailSubject: 'Budget Q4',
    lastEmailDate: '2025-01-14T15:00:00Z',
    hasUnansweredEmail: true,
    unansweredSubject: 'Budget Q4 final numbers',
  },
  relatedDocuments: [
    { fileName: 'budget.xlsx', filePath: '/docs/budget.xlsx', relevanceReason: 'Related to "Budget Review"' },
  ],
  message: 'Semblance noticed you have a Budget Review tomorrow with Alice.',
  suggestedAction: { type: 'prepare_meeting' as const, description: 'Prepare meeting notes' },
};

const minimalMoment = {
  tier: 5 as const,
  upcomingMeeting: null,
  emailContext: null,
  relatedDocuments: [] as Array<{ fileName: string; filePath: string; relevanceReason: string }>,
  message: 'Semblance found 50 documents to learn from.',
  suggestedAction: null,
};

describe('KnowledgeMomentDisplay', () => {
  beforeEach(() => {
    clearInvokeMocks();
  });

  it('renders meeting title when upcomingMeeting present', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText('Budget Review')).toBeInTheDocument();
  });

  it('renders attendee count', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText(/1 attendee/)).toBeInTheDocument();
  });

  it('renders email context with attendee name and count', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText(/5 emails with/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders last email subject', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText(/Latest:.*Budget Q4/)).toBeInTheDocument();
  });

  it('renders unanswered email warning', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText(/Budget Q4 final numbers/)).toBeInTheDocument();
  });

  it('renders related document file names', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
  });

  it('renders the message text', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText('Semblance noticed you have a Budget Review tomorrow with Alice.')).toBeInTheDocument();
  });

  it('renders suggested action button with description', () => {
    const onAction = vi.fn();
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onSuggestedAction={onAction} onContinue={() => {}} />);
    expect(screen.getByText('Prepare meeting notes')).toBeInTheDocument();
  });

  it('renders Continue button', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('Continue button fires onContinue', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={onContinue} />);
    await user.click(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('suggested action button fires onSuggestedAction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onSuggestedAction={onAction} onContinue={() => {}} />);
    await user.click(screen.getByText('Prepare meeting notes'));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('hides suggested action button when suggestedAction is null', () => {
    render(<KnowledgeMomentDisplay moment={minimalMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.queryByText('Prepare meeting notes')).not.toBeInTheDocument();
  });

  it('hides meeting section when upcomingMeeting is null', () => {
    render(<KnowledgeMomentDisplay moment={minimalMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.queryByText('Budget Review')).not.toBeInTheDocument();
  });

  it('hides email context when emailContext is null', () => {
    render(<KnowledgeMomentDisplay moment={minimalMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('renders source indicator labels', () => {
    render(<KnowledgeMomentDisplay moment={fullMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('renders message for minimal moment', () => {
    render(<KnowledgeMomentDisplay moment={minimalMoment} aiName="Semblance" onContinue={() => {}} />);
    expect(screen.getByText('Semblance found 50 documents to learn from.')).toBeInTheDocument();
  });
});
