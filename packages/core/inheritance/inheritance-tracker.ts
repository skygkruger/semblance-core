// Inheritance Tracker — Proactive insight tracker for stale notification templates.
// Implements ExtensionInsightTracker from the extension system.
// CRITICAL: No networking imports.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { InheritanceConfigStore } from './inheritance-config-store.js';
import { nanoid } from 'nanoid';

const MS_PER_DAY = 86_400_000;
const STALE_THRESHOLD_DAYS = 90;

export interface InheritanceTrackerDeps {
  store: InheritanceConfigStore;
  premiumGate: PremiumGate;
}

/**
 * Checks if notification templates are stale (>90 days since last review)
 * and suggests the user review them.
 */
export class InheritanceTracker implements ExtensionInsightTracker {
  private store: InheritanceConfigStore;
  private premiumGate: PremiumGate;

  constructor(deps: InheritanceTrackerDeps) {
    this.store = deps.store;
    this.premiumGate = deps.premiumGate;
  }

  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isPremium()) return [];

    const templates = this.store.getAllTemplates();
    if (templates.length === 0) return [];

    const now = Date.now();
    const staleTemplates = templates.filter((t) => {
      const reviewedAt = new Date(t.lastReviewedAt).getTime();
      return (now - reviewedAt) > STALE_THRESHOLD_DAYS * MS_PER_DAY;
    });

    if (staleTemplates.length === 0) return [];

    return [
      this.buildInsight(
        `${staleTemplates.length} inheritance notification template${staleTemplates.length > 1 ? 's have' : ' has'} ` +
        `not been reviewed in over ${STALE_THRESHOLD_DAYS} days. Consider reviewing them to ensure they still reflect your wishes.`,
      ),
    ];
  }

  private buildInsight(summary: string): ProactiveInsight {
    return {
      id: nanoid(),
      type: 'inheritance-stale-template',
      priority: 'low',
      title: 'Inheritance Template Review',
      summary,
      sourceIds: [],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 0,
    };
  }
}
