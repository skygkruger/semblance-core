// Privacy Tracker — Proactive insight tracker for Privacy Dashboard suggestions.
// Implements ExtensionInsightTracker (same pattern as WitnessTracker).
// CRITICAL: No networking imports.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

export interface PrivacyTrackerDeps {
  db: DatabaseHandle;
  premiumGate: PremiumGate;
}

const REPORT_STALE_DAYS = 30;

/**
 * Suggests privacy-related actions:
 * - Free users with data: suggest viewing Privacy Dashboard
 * - Premium users with stale/missing report: suggest generating Proof of Privacy
 * - Premium users with recent report: no suggestions
 */
export class PrivacyTracker implements ExtensionInsightTracker {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;

  constructor(deps: PrivacyTrackerDeps) {
    this.db = deps.db;
    this.premiumGate = deps.premiumGate;
    this.ensureTable();
  }

  private ensureTable(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS privacy_reports (
          id TEXT PRIMARY KEY,
          generated_at TEXT NOT NULL
        )
      `);
    } catch {
      // Table creation may fail in read-only contexts
    }
  }

  generateInsights(): ProactiveInsight[] {
    const hasData = this.hasIndexedData();
    if (!hasData) return [];

    if (this.premiumGate.isPremium()) {
      // Premium: suggest report if stale or never generated
      const lastReport = this.getLastReportDate();
      if (lastReport && !this.isStale(lastReport)) return [];

      const action = lastReport
        ? 'Your Proof of Privacy report is over 30 days old. Consider generating a fresh one to keep your privacy attestation current.'
        : 'You have never generated a Proof of Privacy report. Generate one to create a cryptographically signed attestation of your privacy posture.';

      return [{
        id: nanoid(),
        type: 'privacy-report-suggestion',
        priority: 'normal',
        title: 'Proof of Privacy',
        summary: action,
        sourceIds: [],
        suggestedAction: null,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        estimatedTimeSavedSeconds: 0,
      }];
    }

    // Free users: suggest viewing Privacy Dashboard
    return [{
      id: nanoid(),
      type: 'privacy-dashboard-suggestion',
      priority: 'low',
      title: 'Privacy Dashboard',
      summary: 'Check your Privacy Dashboard to see a full inventory of your indexed data and privacy guarantees.',
      sourceIds: [],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 0,
    }];
  }

  private hasIndexedData(): boolean {
    // Check a few key tables for any data
    const tables = ['indexed_emails', 'documents', 'contacts', 'captures'];
    for (const table of tables) {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number } | undefined;
        if (row && row.count > 0) return true;
      } catch {
        // Table doesn't exist
      }
    }
    return false;
  }

  private getLastReportDate(): string | null {
    try {
      const row = this.db.prepare(
        'SELECT generated_at FROM privacy_reports ORDER BY generated_at DESC LIMIT 1'
      ).get() as { generated_at: string } | undefined;
      return row?.generated_at ?? null;
    } catch {
      return null;
    }
  }

  private isStale(dateStr: string): boolean {
    const reportDate = new Date(dateStr).getTime();
    const staleCutoff = Date.now() - REPORT_STALE_DAYS * 24 * 60 * 60 * 1000;
    return reportDate < staleCutoff;
  }
}
