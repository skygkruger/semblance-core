// @vitest-environment jsdom
// Tests for Weekly Digest UI — renders real DigestScreen component.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DigestScreen, formatDateRange } from '@semblance/desktop/screens/DigestScreen';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

const sampleDigest = {
  id: 'digest-1',
  weekStart: '2025-01-06',
  weekEnd: '2025-01-12',
  generatedAt: '2025-01-13T08:00:00Z',
  totalActions: 47,
  actionsByType: { 'email.archive': 20, 'email.draft': 5, 'email.send': 3, 'calendar.create': 10, 'calendar.update': 2, 'email.flag': 7 },
  totalTimeSavedSeconds: 5400,
  timeSavedFormatted: '1h 30m',
  emailsProcessed: 30,
  emailsArchived: 20,
  emailsDrafted: 5,
  emailsSent: 3,
  conflictsDetected: 3,
  conflictsResolved: 2,
  meetingPrepsGenerated: 4,
  subscriptionsAnalyzed: 10,
  forgottenSubscriptions: 3,
  potentialSavings: 1200,
  followUpReminders: 2,
  deadlineAlerts: 1,
  actionsAutoExecuted: 30,
  actionsApproved: 15,
  actionsRejected: 2,
  autonomyAccuracy: 0.96,
  narrative: 'This week Semblance was busy. It archived 20 emails and found $1,200/year in forgotten subscriptions.',
  highlights: [
    { type: 'time_saved_milestone' as const, title: 'Time Saved', description: '1.5 hours saved', impact: '1h 30m' },
    { type: 'subscription_savings' as const, title: 'Savings Found', description: '$1,200/yr', impact: '$1,200' },
    { type: 'autonomy_accuracy' as const, title: 'Accuracy', description: '96% accuracy', impact: '96%' },
  ],
};

/** Sets up mock invoke to return correct types per command. */
function mockDigestInvoke(digest: typeof sampleDigest | null = sampleDigest) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_latest_digest') return digest;
    if (cmd === 'list_digests') return digest ? [digest] : [];
    if (cmd === 'generate_digest') return digest;
    return null;
  });
}

describe('DigestScreen', () => {
  beforeEach(() => {
    clearInvokeMocks();
  });

  describe('formatDateRange (real import)', () => {
    it('formats week range containing month abbreviation', () => {
      const formatted = formatDateRange('2025-01-06', '2025-01-12');
      expect(formatted).toContain('Jan');
    });
  });

  describe('loading state', () => {
    it('shows loading text while fetching digest', () => {
      invoke.mockImplementation(() => new Promise(() => {})); // never resolves
      render(<DigestScreen />);
      expect(screen.getByText('Loading digest...')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows generate button when no digest exists', async () => {
      mockDigestInvoke(null);
      render(<DigestScreen />);
      expect(await screen.findByText('Generate Digest')).toBeInTheDocument();
    });

    it('calls generate_digest when button clicked', async () => {
      const user = userEvent.setup();
      mockDigestInvoke(null);
      render(<DigestScreen />);
      const btn = await screen.findByText('Generate Digest');
      mockDigestInvoke(sampleDigest);
      await user.click(btn);
      expect(invoke).toHaveBeenCalledWith('generate_digest', expect.objectContaining({ weekStart: expect.any(String) }));
    });
  });

  describe('narrative section', () => {
    it('displays AI-generated narrative', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText(/archived 20 emails/)).toBeInTheDocument();
    });
  });

  describe('highlights section', () => {
    it('renders highlight impact values', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText('1h 30m')).toBeInTheDocument();
      expect(screen.getByText('$1,200')).toBeInTheDocument();
      expect(screen.getByText('96%')).toBeInTheDocument();
    });

    it('renders highlight titles', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText('Time Saved')).toBeInTheDocument();
      expect(screen.getByText('Savings Found')).toBeInTheDocument();
      expect(screen.getByText('Accuracy')).toBeInTheDocument();
    });
  });

  describe('actions breakdown', () => {
    it('shows email stats', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText(/20 archived/)).toBeInTheDocument();
      expect(screen.getByText(/5 drafted/)).toBeInTheDocument();
      expect(screen.getByText(/3 sent/)).toBeInTheDocument();
    });

    it('shows calendar stats', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText(/4 meeting preps/)).toBeInTheDocument();
      expect(screen.getByText(/2 conflicts resolved/)).toBeInTheDocument();
    });

    it('shows subscription stats when present', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText(/3 forgotten/)).toBeInTheDocument();
      expect(screen.getByText(/\$1200\/yr savings/)).toBeInTheDocument();
    });
  });

  describe('autonomy health', () => {
    it('displays accuracy percentage', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText(/Accuracy: 96%/)).toBeInTheDocument();
    });

    it('shows action breakdown', async () => {
      mockDigestInvoke();
      render(<DigestScreen />);
      expect(await screen.findByText(/30 auto \+ 15 approved/)).toBeInTheDocument();
    });
  });

  describe('past digests', () => {
    it('fetches and shows past digests', async () => {
      const pastDigests = [
        { id: 'digest-1', weekStart: '2025-01-06', weekEnd: '2025-01-12', totalActions: 47, timeSavedFormatted: '1h 30m', generatedAt: '2025-01-13T08:00:00Z' },
        { id: 'digest-2', weekStart: '2024-12-30', weekEnd: '2025-01-05', totalActions: 30, timeSavedFormatted: '45m', generatedAt: '2025-01-06T08:00:00Z' },
      ];
      invoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_latest_digest') return sampleDigest;
        if (cmd === 'list_digests') return pastDigests;
        return null;
      });
      render(<DigestScreen />);
      expect(await screen.findByText('Past Digests')).toBeInTheDocument();
      expect(screen.getByText(/30 actions/)).toBeInTheDocument();
    });
  });
});
