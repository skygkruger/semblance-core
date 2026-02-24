/**
 * Dark Pattern Tracker — Proactive insight tracker for dark pattern flags.
 *
 * Implements ExtensionInsightTracker. Queries dark_pattern_flags table for
 * recent unflagged entries and returns them as ProactiveInsight[].
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { nanoid } from 'nanoid';
import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { DetectedPattern } from './types.js';

// ─── Public API ─────────────────────────────────────────────────────────────

export class DarkPatternTracker implements ExtensionInsightTracker {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;

  constructor(config: { db: DatabaseHandle; premiumGate: PremiumGate }) {
    this.db = config.db;
    this.premiumGate = config.premiumGate;
  }

  /**
   * Generate proactive insights from recent dark pattern flags.
   * Only returns results if premium is active.
   */
  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isPremium()) {
      return [];
    }

    try {
      const rows = this.db.prepare(`
        SELECT id, content_id, content_type, flagged_at, confidence, patterns_json, reframe
        FROM dark_pattern_flags
        WHERE dismissed = 0
        ORDER BY flagged_at DESC
        LIMIT 10
      `).all() as Array<{
        id: string;
        content_id: string;
        content_type: string;
        flagged_at: string;
        confidence: number;
        patterns_json: string;
        reframe: string;
      }>;

      return rows.map(row => {
        const patterns = JSON.parse(row.patterns_json) as DetectedPattern[];
        const categories = patterns.map(p => p.category).join(', ');

        return {
          id: nanoid(),
          type: 'dark_pattern' as const,
          priority: row.confidence >= 0.9 ? 'high' as const : 'normal' as const,
          title: `Dark pattern detected in ${row.content_type}`,
          summary: `${categories} pattern${patterns.length > 1 ? 's' : ''} detected (${Math.round(row.confidence * 100)}% confidence). ${row.reframe}`,
          sourceIds: [row.content_id],
          suggestedAction: null,
          createdAt: row.flagged_at,
          expiresAt: null,
          estimatedTimeSavedSeconds: 30,
        };
      });
    } catch {
      // Table may not exist yet
      return [];
    }
  }
}
