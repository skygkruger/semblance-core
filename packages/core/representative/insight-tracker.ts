// Representative Insight Tracker — Generates proactive insights for the
// Digital Representative: follow-up needed, cancellation recommendations,
// pending approvals, and completed actions.
// Registered via registerTracker() — NOT hardcoded in proactive engine.
// CRITICAL: This file is in packages/core/. No network imports.

import { nanoid } from 'nanoid';
import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { FollowUpTracker } from './follow-up-tracker.js';
import type { RepresentativeActionManager } from './action-manager.js';

export class RepresentativeInsightTracker implements ExtensionInsightTracker {
  private followUpTracker: FollowUpTracker;
  private actionManager: RepresentativeActionManager;
  private premiumGate: PremiumGate;

  constructor(config: {
    followUpTracker: FollowUpTracker;
    actionManager: RepresentativeActionManager;
    premiumGate: PremiumGate;
  }) {
    this.followUpTracker = config.followUpTracker;
    this.actionManager = config.actionManager;
    this.premiumGate = config.premiumGate;
  }

  generateInsights(): ProactiveInsight[] {
    // Return empty when not premium
    if (!this.premiumGate.isPremium()) return [];

    const insights: ProactiveInsight[] = [];
    const now = new Date().toISOString();

    // 1. Follow-ups that are due
    const dueFollowUps = this.followUpTracker.getDueFollowUps();
    for (const fu of dueFollowUps) {
      insights.push({
        id: `insight_fu_${nanoid(8)}`,
        type: 'follow-up-needed',
        priority: 'high',
        title: `Follow up with ${fu.merchantName}`,
        summary: `No response received for "${fu.subject}". Follow-up ${fu.followUpCount + 1} is due.`,
        sourceIds: [fu.actionId],
        suggestedAction: {
          actionType: 'representative.follow_up',
          payload: { followUpId: fu.id },
          description: `Send follow-up email to ${fu.merchantName}`,
        },
        createdAt: now,
        expiresAt: null,
        estimatedTimeSavedSeconds: 120,
      });
    }

    // 2. Follow-ups needing attention
    const stats = this.followUpTracker.getStats();
    if (stats.needsAttention > 0) {
      insights.push({
        id: `insight_att_${nanoid(8)}`,
        type: 'follow-up-needed',
        priority: 'high',
        title: `${stats.needsAttention} unresolved follow-up${stats.needsAttention > 1 ? 's' : ''} need your attention`,
        summary: 'Automated follow-ups have been exhausted. Manual intervention required.',
        sourceIds: [],
        suggestedAction: null,
        createdAt: now,
        expiresAt: null,
        estimatedTimeSavedSeconds: 0,
      });
    }

    // 3. Pending approvals
    const pending = this.actionManager.getPendingActions();
    if (pending.length > 0) {
      insights.push({
        id: `insight_pa_${nanoid(8)}`,
        type: 'pending-approval',
        priority: 'normal',
        title: `${pending.length} action${pending.length > 1 ? 's' : ''} awaiting your approval`,
        summary: pending.map(a => `"${a.draft.subject}" (${a.classification})`).join(', '),
        sourceIds: pending.map(a => a.id),
        suggestedAction: null,
        createdAt: now,
        expiresAt: null,
        estimatedTimeSavedSeconds: 60,
      });
    }

    // 4. Recently completed actions (last 24h)
    const recent = this.actionManager.getActionHistory(5);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentSent = recent.filter(a => a.status === 'sent' && a.createdAt > oneDayAgo);
    if (recentSent.length > 0) {
      const totalTimeSaved = recentSent.reduce((sum, a) => sum + a.estimatedTimeSavedSeconds, 0);
      insights.push({
        id: `insight_done_${nanoid(8)}`,
        type: 'representative-action-complete',
        priority: 'low',
        title: `Digital Representative completed ${recentSent.length} action${recentSent.length > 1 ? 's' : ''} today`,
        summary: `Estimated ${Math.round(totalTimeSaved / 60)} minutes saved.`,
        sourceIds: recentSent.map(a => a.id),
        suggestedAction: null,
        createdAt: now,
        expiresAt: null,
        estimatedTimeSavedSeconds: totalTimeSaved,
      });
    }

    return insights;
  }
}
