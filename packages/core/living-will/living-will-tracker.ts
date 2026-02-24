// Living Will Tracker — Proactive insight tracker for stale exports.
// Implements ExtensionInsightTracker from the extension system.
// CRITICAL: No networking imports.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

const MS_PER_DAY = 86_400_000;

export interface LivingWillTrackerDeps {
  db: DatabaseHandle;
  premiumGate: PremiumGate;
  cadenceMs: number;
}

/**
 * Checks if the last Living Will export is stale and suggests a new export.
 */
export class LivingWillTracker implements ExtensionInsightTracker {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;
  private cadenceMs: number;

  constructor(deps: LivingWillTrackerDeps) {
    this.db = deps.db;
    this.premiumGate = deps.premiumGate;
    this.cadenceMs = deps.cadenceMs;
  }

  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isPremium()) return [];

    const lastExport = this.getLastExportTime();
    if (!lastExport) {
      return [this.buildInsight('You have never created a Living Will archive. Consider creating one to preserve your digital twin.')];
    }

    const elapsed = Date.now() - new Date(lastExport).getTime();
    if (elapsed > this.cadenceMs) {
      const daysAgo = Math.floor(elapsed / MS_PER_DAY);
      return [this.buildInsight(`Your last Living Will export was ${daysAgo} days ago. Consider creating a fresh archive.`)];
    }

    return [];
  }

  private getLastExportTime(): string | null {
    try {
      const row = this.db.prepare(
        'SELECT exported_at FROM living_will_exports ORDER BY exported_at DESC LIMIT 1',
      ).get() as { exported_at: string } | undefined;
      return row?.exported_at ?? null;
    } catch {
      return null;
    }
  }

  private buildInsight(summary: string): ProactiveInsight {
    return {
      id: nanoid(),
      type: 'living-will-stale',
      priority: 'low',
      title: 'Living Will Export',
      summary,
      sourceIds: [],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 0,
    };
  }
}
