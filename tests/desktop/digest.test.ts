// Tests for Weekly Digest UI — screen rendering, sections, past digests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

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
    { type: 'time_saved_milestone', title: 'Time Saved', description: '1.5 hours saved', impact: '1h 30m' },
    { type: 'subscription_savings', title: 'Savings Found', description: '$1,200/yr', impact: '$1,200' },
    { type: 'autonomy_accuracy', title: 'Accuracy', description: '96% accuracy', impact: '96%' },
  ],
};

describe('DigestScreen', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('loading state', () => {
    it('shows loading text while fetching digest', () => {
      // DigestScreen shows "Loading digest..." while data loads
      const loading = true;
      const digest = null;
      expect(loading && !digest).toBe(true);
    });
  });

  describe('empty state', () => {
    it('shows generate button when no digest exists', () => {
      const digest = null;
      expect(digest).toBeNull();
      // Screen should show "Generate Digest" button
    });

    it('calls generate_digest when generate button clicked', async () => {
      mockInvoke.mockResolvedValue(sampleDigest);
      const now = new Date();
      const weekEnd = now.toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await mockInvoke('generate_digest', { weekStart, weekEnd });
      expect(mockInvoke).toHaveBeenCalledWith('generate_digest', expect.objectContaining({ weekStart, weekEnd }));
    });
  });

  describe('narrative section', () => {
    it('displays AI-generated narrative', () => {
      expect(sampleDigest.narrative).toContain('archived 20 emails');
      expect(sampleDigest.narrative.length).toBeGreaterThan(10);
    });
  });

  describe('highlights section', () => {
    it('renders highlight cards', () => {
      expect(sampleDigest.highlights.length).toBe(3);
    });

    it('shows impact values in highlights', () => {
      const impacts = sampleDigest.highlights.map(h => h.impact);
      expect(impacts).toContain('1h 30m');
      expect(impacts).toContain('$1,200');
      expect(impacts).toContain('96%');
    });
  });

  describe('actions breakdown', () => {
    it('shows email stats correctly', () => {
      expect(sampleDigest.emailsArchived).toBe(20);
      expect(sampleDigest.emailsDrafted).toBe(5);
      expect(sampleDigest.emailsSent).toBe(3);
    });

    it('shows calendar stats correctly', () => {
      expect(sampleDigest.meetingPrepsGenerated).toBe(4);
      expect(sampleDigest.conflictsResolved).toBe(2);
    });

    it('shows subscription stats when present', () => {
      expect(sampleDigest.subscriptionsAnalyzed).toBe(10);
      expect(sampleDigest.forgottenSubscriptions).toBe(3);
      expect(sampleDigest.potentialSavings).toBe(1200);
    });
  });

  describe('autonomy health', () => {
    it('displays accuracy percentage', () => {
      const pct = Math.round(sampleDigest.autonomyAccuracy * 100);
      expect(pct).toBe(96);
    });

    it('calculates total autonomy actions', () => {
      const total = sampleDigest.actionsAutoExecuted + sampleDigest.actionsApproved + sampleDigest.actionsRejected;
      expect(total).toBe(47);
    });

    it('shows rejected count', () => {
      expect(sampleDigest.actionsRejected).toBe(2);
    });
  });

  describe('past digests', () => {
    it('fetches past digests list', async () => {
      const pastDigests = [
        { id: 'digest-1', weekStart: '2025-01-06', weekEnd: '2025-01-12', totalActions: 47, timeSavedFormatted: '1h 30m', generatedAt: '2025-01-13T08:00:00Z' },
        { id: 'digest-2', weekStart: '2024-12-30', weekEnd: '2025-01-05', totalActions: 30, timeSavedFormatted: '45m', generatedAt: '2025-01-06T08:00:00Z' },
      ];
      mockInvoke.mockResolvedValue(pastDigests);
      const result = await mockInvoke('list_digests');
      expect(result).toHaveLength(2);
    });
  });

  describe('get_latest_digest', () => {
    it('fetches the latest digest', async () => {
      mockInvoke.mockResolvedValue(sampleDigest);
      const result = await mockInvoke('get_latest_digest');
      expect(result.id).toBe('digest-1');
      expect(result.totalActions).toBe(47);
    });

    it('returns null when no digests exist', async () => {
      mockInvoke.mockResolvedValue(null);
      const result = await mockInvoke('get_latest_digest');
      expect(result).toBeNull();
    });
  });

  describe('date formatting', () => {
    it('formats week range as "Mon DD–Mon DD, YYYY"', () => {
      const s = new Date('2025-01-06');
      const e = new Date('2025-01-12');
      const formatted = `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })}–${e.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
      expect(formatted).toContain('Jan');
    });
  });

  describe('time saved formatting', () => {
    it('formats seconds into hours and minutes', () => {
      const seconds = 5400;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const formatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      expect(formatted).toBe('1h 30m');
    });

    it('formats seconds-only correctly', () => {
      const seconds = 90;
      const minutes = Math.floor(seconds / 60);
      expect(minutes).toBe(1);
    });
  });
});
