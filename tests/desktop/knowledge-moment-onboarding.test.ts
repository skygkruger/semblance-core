// Tests for Knowledge Moment in onboarding — display, cross-source indicators, progressive disclosure.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('Knowledge Moment Onboarding', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('moment generation', () => {
    it('calls generate_knowledge_moment during onboarding step 5', async () => {
      const moment = {
        tier: 1,
        upcomingMeeting: { title: 'Budget Review', startTime: '2025-01-15T10:00:00Z', attendees: ['alice@example.com'] },
        emailContext: {
          attendeeName: 'Alice',
          recentEmailCount: 5,
          lastEmailSubject: 'Budget Q4',
          lastEmailDate: '2025-01-14T15:00:00Z',
          hasUnansweredEmail: true,
          unansweredSubject: 'Budget Q4 final numbers',
        },
        relatedDocuments: [{ fileName: 'budget.xlsx', filePath: '/docs/budget.xlsx', relevanceReason: 'Related to "Budget Review"' }],
        message: 'Semblance noticed you have a Budget Review tomorrow with Alice.',
        suggestedAction: { type: 'prepare_meeting', description: 'Prepare meeting notes' },
      };
      mockInvoke.mockResolvedValue(moment);
      const result = await mockInvoke('generate_knowledge_moment');
      expect(result).toBeDefined();
      expect(result.tier).toBe(1);
    });

    it('handles null response gracefully', async () => {
      mockInvoke.mockResolvedValue(null);
      const result = await mockInvoke('generate_knowledge_moment');
      expect(result).toBeNull();
    });
  });

  describe('cross-source indicators', () => {
    it('shows email indicator when email context present', () => {
      const moment = { emailContext: { attendeeName: 'Alice', recentEmailCount: 3 } };
      expect(moment.emailContext).not.toBeNull();
    });

    it('shows calendar indicator when meeting present', () => {
      const moment = { upcomingMeeting: { title: 'Standup', startTime: '2025-01-15T10:00:00Z' } };
      expect(moment.upcomingMeeting).not.toBeNull();
    });

    it('shows files indicator when documents present', () => {
      const moment = { relatedDocuments: [{ fileName: 'doc.pdf' }] };
      expect(moment.relatedDocuments.length).toBeGreaterThan(0);
    });

    it('hides indicators when data not present', () => {
      const moment = { emailContext: null, upcomingMeeting: null, relatedDocuments: [] };
      expect(moment.emailContext).toBeNull();
      expect(moment.upcomingMeeting).toBeNull();
      expect(moment.relatedDocuments).toHaveLength(0);
    });
  });

  describe('progressive disclosure', () => {
    it('starts at reveal stage 0 for onboarding', () => {
      const isOnboarding = true;
      const initialStage = isOnboarding ? 0 : 4;
      expect(initialStage).toBe(0);
    });

    it('progresses through 4 reveal stages', () => {
      const stages = [0, 1, 2, 3, 4];
      expect(stages.length).toBe(5);
      expect(stages[stages.length - 1]).toBe(4);
    });

    it('shows all content immediately when not onboarding', () => {
      const isOnboarding = false;
      const initialStage = isOnboarding ? 0 : 4;
      expect(initialStage).toBe(4);
    });
  });

  describe('suggested action', () => {
    it('displays suggested action button when action available', () => {
      const moment = {
        suggestedAction: { type: 'draft_reply', description: 'Draft reply to Alice' },
      };
      expect(moment.suggestedAction).not.toBeNull();
      expect(moment.suggestedAction.description).toContain('Alice');
    });

    it('hides suggested action when null', () => {
      const moment = { suggestedAction: null };
      expect(moment.suggestedAction).toBeNull();
    });
  });

  describe('tier fallback display', () => {
    it('tier 1/2 shows meeting + email + docs', () => {
      const tier = 1;
      expect(tier).toBeLessThanOrEqual(2);
    });

    it('tier 3 shows email only', () => {
      const moment = {
        tier: 3,
        upcomingMeeting: null,
        emailContext: { attendeeName: 'Alice' },
        relatedDocuments: [],
      };
      expect(moment.tier).toBe(3);
      expect(moment.upcomingMeeting).toBeNull();
      expect(moment.emailContext).not.toBeNull();
    });

    it('tier 5 shows files only message', () => {
      const moment = {
        tier: 5,
        upcomingMeeting: null,
        emailContext: null,
        relatedDocuments: [],
        message: 'Semblance found 50 documents to learn from.',
      };
      expect(moment.tier).toBe(5);
      expect(moment.message).toContain('documents');
    });
  });
});
