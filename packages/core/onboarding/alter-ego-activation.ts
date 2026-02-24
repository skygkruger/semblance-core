// Alter Ego Activation — Day 7 of Alter Ego Week.
//
// Queries the audit trail for past 7 days of activity, computes success metrics,
// and presents the activation offer with concrete behavior differences and safeguards.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { AutonomyManager } from '../agent/autonomy.js';
import type { AutonomyDomain, AutonomyTier } from '../agent/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ActivationPrompt {
  totalActions: number;
  successRate: number;
  domainsCovered: string[];
  estimatedTimeSavedSeconds: number;
  differences: AlterEgoDifference[];
  safeguards: string[];
}

export interface AlterEgoDifference {
  domain: string;
  currentTier: AutonomyTier;
  description: string;
  examples: string[];
}

// ─── Domain behavior descriptions ──────────────────────────────────────────

const DOMAIN_DIFFERENCES: Record<string, { description: string; examples: string[] }> = {
  email: {
    description: 'Semblance will automatically triage, draft, and send routine emails without asking.',
    examples: [
      'Archive promotional emails',
      'Draft replies in your style',
      'Send follow-ups on your behalf',
    ],
  },
  calendar: {
    description: 'Semblance will resolve scheduling conflicts and create events autonomously.',
    examples: [
      'Reschedule conflicting meetings',
      'Block focus time around deep work',
      'Auto-accept recurring invites',
    ],
  },
  finances: {
    description: 'Semblance will proactively surface financial insights and manage subscriptions.',
    examples: [
      'Flag forgotten subscriptions',
      'Summarize spending patterns',
      'Alert on unusual transactions',
    ],
  },
  web: {
    description: 'Semblance will research topics and fetch information without prompting.',
    examples: [
      'Pre-research meeting attendees',
      'Gather context for upcoming events',
      'Summarize linked articles',
    ],
  },
  reminders: {
    description: 'Semblance will create and manage reminders based on context.',
    examples: [
      'Create follow-up reminders after meetings',
      'Surface relevant reminders proactively',
      'Adjust reminder timing based on patterns',
    ],
  },
  contacts: {
    description: 'Semblance will maintain your contact relationships automatically.',
    examples: [
      'Update contact info from email signatures',
      'Track interaction frequency',
      'Flag contacts going quiet',
    ],
  },
  health: {
    description: 'Semblance will correlate health data with your schedule and habits.',
    examples: [
      'Suggest breaks during long meeting days',
      'Correlate sleep patterns with productivity',
      'Alert on concerning trends',
    ],
  },
};

// ─── Safeguards ─────────────────────────────────────────────────────────────

const SAFEGUARDS: string[] = [
  'All actions are logged in your Universal Action Log — nothing is hidden.',
  'Financial actions above your threshold always require approval.',
  'Legal language in emails triggers human review.',
  'You can revert any action and downgrade any domain at any time.',
  'Alter Ego never sends emails to new contacts without your approval.',
  'All data stays on your device — Alter Ego has no cloud access.',
  'You can pause Alter Ego instantly from the system tray.',
];

// ─── AlterEgoActivation ────────────────────────────────────────────────────

export class AlterEgoActivation {
  private db: DatabaseHandle;
  private autonomy: AutonomyManager;

  constructor(deps: { db: DatabaseHandle; autonomy: AutonomyManager }) {
    this.db = deps.db;
    this.autonomy = deps.autonomy;
  }

  /**
   * Generate the activation prompt for Day 7 of Alter Ego Week.
   * Queries audit_trail for the past 7 days of activity.
   */
  generateActivationPrompt(): ActivationPrompt {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Query audit trail for past 7 days
    const rows = this.db.prepare(
      `SELECT action, status, estimated_time_saved_seconds
       FROM audit_trail
       WHERE timestamp >= ?
       ORDER BY timestamp DESC`
    ).all(sevenDaysAgo) as Array<{
      action: string;
      status: string;
      estimated_time_saved_seconds: number;
    }>;

    const totalActions = rows.length;
    const successCount = rows.filter(r => r.status === 'success').length;
    const successRate = totalActions > 0 ? Math.round((successCount / totalActions) * 100) : 0;

    // Extract distinct domains from action types
    const domainSet = new Set<string>();
    for (const row of rows) {
      const prefix = row.action.split('.')[0];
      if (prefix) domainSet.add(prefix);
    }
    const domainsCovered = Array.from(domainSet).sort();

    // Sum time saved
    const estimatedTimeSavedSeconds = rows.reduce(
      (sum, r) => sum + (r.estimated_time_saved_seconds || 0),
      0
    );

    // Build per-domain differences
    const differences = this.buildDifferences(domainsCovered);

    return {
      totalActions,
      successRate,
      domainsCovered,
      estimatedTimeSavedSeconds,
      differences,
      safeguards: [...SAFEGUARDS],
    };
  }

  /**
   * Activate Alter Ego mode for specified domains (or all if none specified).
   */
  activate(domains?: AutonomyDomain[]): void {
    const targetDomains = domains ?? this.getAllDomains();

    for (const domain of targetDomains) {
      this.autonomy.setDomainTier(domain, 'alter_ego');
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private buildDifferences(coveredDomainPrefixes: string[]): AlterEgoDifference[] {
    const differences: AlterEgoDifference[] = [];

    // Always include core domains regardless of coverage
    const coreDomains: AutonomyDomain[] = ['email', 'calendar', 'web'];
    const allDomainPrefixes = new Set([...coveredDomainPrefixes, ...coreDomains]);

    for (const domainPrefix of allDomainPrefixes) {
      const domain = domainPrefix as AutonomyDomain;
      const diff = DOMAIN_DIFFERENCES[domainPrefix];
      if (!diff) continue;

      const currentTier = this.autonomy.getDomainTier(domain);
      if (currentTier === 'alter_ego') continue; // Already at highest tier

      differences.push({
        domain: domainPrefix,
        currentTier,
        description: diff.description,
        examples: diff.examples,
      });
    }

    return differences;
  }

  private getAllDomains(): AutonomyDomain[] {
    return [
      'email', 'calendar', 'finances', 'health', 'files',
      'contacts', 'services', 'web', 'reminders', 'messaging',
      'clipboard', 'location', 'voice', 'cloud-storage', 'system',
    ];
  }
}
