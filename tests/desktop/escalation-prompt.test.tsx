// @vitest-environment jsdom
// Tests for EscalationPromptCard — renders real component.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EscalationPromptCard } from '@semblance/desktop/components/EscalationPromptCard';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

const guardianPrompt = {
  id: 'esc-1',
  type: 'guardian_to_partner' as const,
  domain: 'email',
  actionType: 'email.archive',
  consecutiveApprovals: 12,
  message: "You've approved 12 archive actions in a row.",
  previewActions: [
    {
      description: 'Archive low-priority newsletters',
      currentBehavior: 'Shows preview, waits for approval',
      newBehavior: 'Archives automatically, shows in digest',
      estimatedTimeSaved: '~2 min/day',
    },
  ],
  createdAt: '2025-01-15T10:00:00Z',
  expiresAt: '2025-01-22T10:00:00Z',
  status: 'pending' as const,
};

const alterEgoPrompt = {
  ...guardianPrompt,
  id: 'esc-2',
  type: 'partner_to_alterego' as const,
  message: 'Email actions have been consistently accurate.',
};

describe('EscalationPromptCard', () => {
  beforeEach(() => {
    clearInvokeMocks();
  });

  it('renders Trust Upgrade Available header', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText('Trust Upgrade Available')).toBeInTheDocument();
  });

  it('renders the prompt message', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText("You've approved 12 archive actions in a row.")).toBeInTheDocument();
  });

  it('renders preview action descriptions', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText('Archive low-priority newsletters')).toBeInTheDocument();
  });

  it('renders current vs new behavior', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText(/Currently: Shows preview, waits for approval/)).toBeInTheDocument();
    expect(screen.getByText(/New: Archives automatically, shows in digest/)).toBeInTheDocument();
  });

  it('renders estimated time saved', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText(/~2 min\/day/)).toBeInTheDocument();
  });

  it('shows Partner label for guardian_to_partner', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText('Yes, upgrade to Partner')).toBeInTheDocument();
  });

  it('shows Alter Ego label for partner_to_alterego', () => {
    render(<EscalationPromptCard prompt={alterEgoPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText('Yes, upgrade to Alter Ego')).toBeInTheDocument();
  });

  it('accept button calls invoke with accepted=true and fires onAccepted', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({});
    const onAccepted = vi.fn();
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={onAccepted} onDismissed={() => {}} />);
    await user.click(screen.getByText('Yes, upgrade to Partner'));
    expect(invoke).toHaveBeenCalledWith('respond_to_escalation', { promptId: 'esc-1', accepted: true });
    expect(onAccepted).toHaveBeenCalledOnce();
  });

  it('dismiss button calls invoke with accepted=false and fires onDismissed', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({});
    const onDismissed = vi.fn();
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={onDismissed} />);
    await user.click(screen.getByText('Not yet'));
    expect(invoke).toHaveBeenCalledWith('respond_to_escalation', { promptId: 'esc-1', accepted: false });
    expect(onDismissed).toHaveBeenCalledOnce();
  });

  it('shows "What changes:" label when preview actions exist', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText('What changes:')).toBeInTheDocument();
  });

  it('shows settings reminder text', () => {
    render(<EscalationPromptCard prompt={guardianPrompt} onAccepted={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText('You can always change this in Settings.')).toBeInTheDocument();
  });
});
