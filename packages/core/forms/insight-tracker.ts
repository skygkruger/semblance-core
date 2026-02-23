// Form Insight Tracker — Generates proactive insights for form submissions.
// Surfaces reminders for overdue submissions and forms needing attention.
// CRITICAL: This file is in packages/core/. No network imports.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate, PremiumFeature } from '../premium/premium-gate.js';
import type { BureaucracyTracker } from './bureaucracy-tracker.js';

export class FormInsightTracker implements ExtensionInsightTracker {
  private tracker: BureaucracyTracker;
  private premiumGate: PremiumGate;

  constructor(config: {
    tracker: BureaucracyTracker;
    premiumGate: PremiumGate;
  }) {
    this.tracker = config.tracker;
    this.premiumGate = config.premiumGate;
  }

  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isFeatureAvailable('bureaucracy-tracking' as PremiumFeature)) {
      return [];
    }

    const insights: ProactiveInsight[] = [];

    // Due reminders
    const dueReminders = this.tracker.getDueReminders();
    for (const submission of dueReminders) {
      const submittedDate = submission.submittedAt ? new Date(submission.submittedAt) : new Date(submission.filledAt);
      const daysSince = Math.floor(
        (Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      insights.push({
        id: `form-reminder-${submission.id}`,
        type: 'form-reminder-due' as ProactiveInsight['type'],
        priority: daysSince > submission.expectedResponseDays + 14 ? 'high' : 'normal',
        title: `Follow up on ${submission.formName}`,
        summary: `Your ${submission.formName} was submitted ${daysSince} days ago (expected: ${submission.expectedResponseDays} days). Consider following up.`,
        sourceIds: [submission.id],
        suggestedAction: {
          actionType: 'check_form_status',
          payload: { submissionId: submission.id },
          description: `Check status of ${submission.formName}`,
        },
        createdAt: new Date().toISOString(),
        expiresAt: null,
        estimatedTimeSavedSeconds: 300,
      } as ProactiveInsight);
    }

    // Needs attention
    const pending = this.tracker.getPendingSubmissions();
    for (const submission of pending) {
      if (submission.status === 'needs-attention') {
        insights.push({
          id: `form-attention-${submission.id}`,
          type: 'form-needs-attention' as ProactiveInsight['type'],
          priority: 'high',
          title: `${submission.formName} needs your attention`,
          summary: `Your ${submission.formName} has been flagged as needing attention. Action may be required.`,
          sourceIds: [submission.id],
          suggestedAction: {
            actionType: 'check_form_status',
            payload: { submissionId: submission.id },
            description: `Review ${submission.formName} status`,
          },
          createdAt: new Date().toISOString(),
          expiresAt: null,
          estimatedTimeSavedSeconds: 300,
        } as ProactiveInsight);
      }
    }

    return insights;
  }
}
