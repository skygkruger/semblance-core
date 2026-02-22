/**
 * Weekly Digest Generator — Summarizes actions taken, time saved, and autonomy metrics.
 *
 * Aggregates the audit trail, generates an LLM narrative, and produces a structured
 * digest for display in the UI. The retention hook — weekly proof that Semblance is worth having.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { LLMProvider } from '../llm/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;

  // Action summary
  totalActions: number;
  actionsByType: Record<string, number>;

  // Time saved
  totalTimeSavedSeconds: number;
  timeSavedByType: Record<string, number>;
  timeSavedFormatted: string;

  // Email summary
  emailsProcessed: number;
  emailsArchived: number;
  emailsDrafted: number;
  emailsSent: number;

  // Calendar summary
  conflictsDetected: number;
  conflictsResolved: number;
  meetingPrepsGenerated: number;

  // Subscription summary
  subscriptionsAnalyzed: number;
  forgottenSubscriptions: number;
  potentialSavings: number;

  // Proactive insights
  followUpReminders: number;
  deadlineAlerts: number;

  // Autonomy metrics
  actionsAutoExecuted: number;
  actionsApproved: number;
  actionsRejected: number;
  autonomyAccuracy: number;

  // AI-generated narrative
  narrative: string;

  // Highlights
  highlights: DigestHighlight[];
}

export interface DigestHighlight {
  type: 'subscription_savings' | 'time_saved_milestone' | 'autonomy_accuracy' | 'notable_action';
  title: string;
  description: string;
  impact: string;
}

export interface DigestSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  timeSavedFormatted: string;
  generatedAt: string;
}

// ─── SQLite Schema ──────────────────────────────────────────────────────────

const CREATE_DIGEST_TABLE = `
  CREATE TABLE IF NOT EXISTS weekly_digests (
    id TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    total_actions INTEGER NOT NULL DEFAULT 0,
    actions_by_type TEXT NOT NULL DEFAULT '{}',
    total_time_saved_seconds INTEGER NOT NULL DEFAULT 0,
    time_saved_by_type TEXT NOT NULL DEFAULT '{}',
    emails_processed INTEGER NOT NULL DEFAULT 0,
    emails_archived INTEGER NOT NULL DEFAULT 0,
    emails_drafted INTEGER NOT NULL DEFAULT 0,
    emails_sent INTEGER NOT NULL DEFAULT 0,
    conflicts_detected INTEGER NOT NULL DEFAULT 0,
    conflicts_resolved INTEGER NOT NULL DEFAULT 0,
    meeting_preps INTEGER NOT NULL DEFAULT 0,
    subscriptions_analyzed INTEGER NOT NULL DEFAULT 0,
    forgotten_subscriptions INTEGER NOT NULL DEFAULT 0,
    potential_savings REAL NOT NULL DEFAULT 0,
    follow_up_reminders INTEGER NOT NULL DEFAULT 0,
    deadline_alerts INTEGER NOT NULL DEFAULT 0,
    actions_auto_executed INTEGER NOT NULL DEFAULT 0,
    actions_approved INTEGER NOT NULL DEFAULT 0,
    actions_rejected INTEGER NOT NULL DEFAULT 0,
    autonomy_accuracy REAL NOT NULL DEFAULT 0,
    narrative TEXT NOT NULL DEFAULT '',
    highlights TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_digest_week ON weekly_digests(week_start);
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class WeeklyDigestGenerator {
  private db: DatabaseHandle;
  private auditDb: DatabaseHandle;
  private llm?: LLMProvider;
  private model: string;
  private aiName: string;

  constructor(config: {
    db: DatabaseHandle;
    auditDb: DatabaseHandle;
    llm?: LLMProvider;
    model?: string;
    aiName?: string;
  }) {
    this.db = config.db;
    this.auditDb = config.auditDb;
    this.llm = config.llm;
    this.model = config.model ?? 'llama3.2:8b';
    this.aiName = config.aiName ?? 'Semblance';
    this.db.exec(CREATE_DIGEST_TABLE);
  }

  /**
   * Generate the digest for the past week.
   */
  async generate(weekStart: string, weekEnd: string): Promise<WeeklyDigest> {
    // 1. Query audit trail for actions in this period
    const auditEntries = this.queryAuditTrail(weekStart, weekEnd);

    // 2. Aggregate by action type
    const actionsByType: Record<string, number> = {};
    const timeSavedByType: Record<string, number> = {};
    let totalTimeSaved = 0;
    let autoExecuted = 0;
    let approved = 0;
    let rejected = 0;
    let emailsArchived = 0;
    let emailsDrafted = 0;
    let emailsSent = 0;
    let emailsProcessed = 0;
    let meetingPreps = 0;
    let conflictsDetected = 0;
    let followUps = 0;
    let deadlines = 0;

    for (const entry of auditEntries) {
      const action = entry.action;
      actionsByType[action] = (actionsByType[action] ?? 0) + 1;

      const timeSaved = entry.estimated_time_saved_seconds ?? 0;
      timeSavedByType[action] = (timeSavedByType[action] ?? 0) + timeSaved;
      totalTimeSaved += timeSaved;

      // Status tracking
      if (entry.status === 'success' && entry.direction === 'response') {
        // Count auto-executed vs user-approved
        if (entry.metadata) {
          try {
            const meta = JSON.parse(entry.metadata) as Record<string, unknown>;
            if (meta['autoExecuted']) autoExecuted++;
            if (meta['userApproved']) approved++;
            if (meta['userRejected']) rejected++;
          } catch { /* non-JSON metadata */ }
        }
      }

      // Domain-specific counting
      if (action.startsWith('email.')) {
        emailsProcessed++;
        if (action === 'email.archive') emailsArchived++;
        if (action === 'email.draft') emailsDrafted++;
        if (action === 'email.send') emailsSent++;
      }
      if (action === 'calendar.conflict') conflictsDetected++;
      if (entry.metadata?.includes('meeting_prep')) meetingPreps++;
      if (entry.metadata?.includes('follow_up')) followUps++;
      if (entry.metadata?.includes('deadline')) deadlines++;
    }

    const totalActions = Object.values(actionsByType).reduce((a, b) => a + b, 0);
    const total = autoExecuted + approved + rejected;
    const autonomyAccuracy = total > 0 ? (autoExecuted + approved) / total : 1;

    // 3. Generate highlights
    const highlights = this.generateHighlights({
      totalTimeSaved,
      totalActions,
      autonomyAccuracy,
      emailsArchived,
      emailsSent,
    });

    // 4. Generate narrative
    const narrative = await this.generateNarrative({
      totalActions,
      timeSavedFormatted: formatTimeSaved(totalTimeSaved),
      emailsArchived,
      emailsDrafted,
      emailsSent,
      conflictsDetected,
      meetingPreps,
      autonomyAccuracy,
    });

    // 5. Build digest
    const digest: WeeklyDigest = {
      id: nanoid(),
      weekStart,
      weekEnd,
      generatedAt: new Date().toISOString(),
      totalActions,
      actionsByType,
      totalTimeSavedSeconds: totalTimeSaved,
      timeSavedByType,
      timeSavedFormatted: formatTimeSaved(totalTimeSaved),
      emailsProcessed,
      emailsArchived,
      emailsDrafted,
      emailsSent,
      conflictsDetected,
      conflictsResolved: 0,
      meetingPrepsGenerated: meetingPreps,
      subscriptionsAnalyzed: 0,
      forgottenSubscriptions: 0,
      potentialSavings: 0,
      followUpReminders: followUps,
      deadlineAlerts: deadlines,
      actionsAutoExecuted: autoExecuted,
      actionsApproved: approved,
      actionsRejected: rejected,
      autonomyAccuracy: Math.round(autonomyAccuracy * 100) / 100,
      narrative,
      highlights,
    };

    // 6. Store
    this.storeDigest(digest);

    return digest;
  }

  /**
   * Get the most recent digest.
   */
  getLatest(): WeeklyDigest | null {
    const row = this.db.prepare(
      'SELECT * FROM weekly_digests ORDER BY generated_at DESC LIMIT 1'
    ).get() as DigestRow | undefined;

    return row ? this.rowToDigest(row) : null;
  }

  /**
   * List all generated digests (summary only).
   */
  list(): DigestSummary[] {
    const rows = this.db.prepare(
      'SELECT id, week_start, week_end, total_actions, total_time_saved_seconds, generated_at FROM weekly_digests ORDER BY week_start DESC'
    ).all() as Array<{
      id: string;
      week_start: string;
      week_end: string;
      total_actions: number;
      total_time_saved_seconds: number;
      generated_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      weekStart: r.week_start,
      weekEnd: r.week_end,
      totalActions: r.total_actions,
      timeSavedFormatted: formatTimeSaved(r.total_time_saved_seconds),
      generatedAt: r.generated_at,
    }));
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private queryAuditTrail(weekStart: string, weekEnd: string): AuditEntry[] {
    try {
      return this.auditDb.prepare(
        'SELECT * FROM audit_trail WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
      ).all(weekStart, weekEnd) as AuditEntry[];
    } catch {
      return [];
    }
  }

  private generateHighlights(stats: {
    totalTimeSaved: number;
    totalActions: number;
    autonomyAccuracy: number;
    emailsArchived: number;
    emailsSent: number;
  }): DigestHighlight[] {
    const highlights: DigestHighlight[] = [];

    if (stats.totalTimeSaved > 0) {
      highlights.push({
        type: 'time_saved_milestone',
        title: formatTimeSaved(stats.totalTimeSaved) + ' saved',
        description: `${this.aiName} saved you time across ${stats.totalActions} actions this week.`,
        impact: formatTimeSaved(stats.totalTimeSaved),
      });
    }

    if (stats.autonomyAccuracy >= 0.95 && stats.totalActions > 5) {
      highlights.push({
        type: 'autonomy_accuracy',
        title: `${Math.round(stats.autonomyAccuracy * 100)}% accuracy`,
        description: `${this.aiName}'s autonomous actions aligned with your preferences.`,
        impact: `${Math.round(stats.autonomyAccuracy * 100)}%`,
      });
    }

    if (stats.emailsArchived > 10) {
      highlights.push({
        type: 'notable_action',
        title: `${stats.emailsArchived} emails archived`,
        description: 'Routine emails handled automatically so you can focus on what matters.',
        impact: `${stats.emailsArchived} emails`,
      });
    }

    return highlights.slice(0, 3);
  }

  private async generateNarrative(stats: {
    totalActions: number;
    timeSavedFormatted: string;
    emailsArchived: number;
    emailsDrafted: number;
    emailsSent: number;
    conflictsDetected: number;
    meetingPreps: number;
    autonomyAccuracy: number;
  }): Promise<string> {
    // Try LLM first
    if (this.llm) {
      try {
        const available = await this.llm.isAvailable();
        if (available) {
          const response = await this.llm.chat({
            model: this.model,
            messages: [{
              role: 'user',
              content: `You are ${this.aiName}, a personal AI assistant. Write a brief, warm, one-paragraph summary of what you accomplished this week.

Stats:
- ${stats.totalActions} actions taken
- ${stats.timeSavedFormatted} saved
- ${stats.emailsArchived} emails archived, ${stats.emailsDrafted} drafts prepared
${stats.emailsSent > 0 ? `- ${stats.emailsSent} emails sent autonomously` : ''}
${stats.meetingPreps > 0 ? `- ${stats.meetingPreps} meeting preps generated` : ''}
${stats.conflictsDetected > 0 ? `- ${stats.conflictsDetected} calendar conflicts detected` : ''}
- Autonomy accuracy: ${Math.round(stats.autonomyAccuracy * 100)}%

Tone: Concise, warm, slightly proud of the work done. Not sycophantic. Focus on the most impactful actions. One paragraph, 3-4 sentences max.`,
            }],
            temperature: 0.3,
          });
          return response.message.content;
        }
      } catch {
        // Fall through to template
      }
    }

    // Template fallback
    const parts: string[] = [];
    parts.push(`This week I handled ${stats.totalActions} action${stats.totalActions !== 1 ? 's' : ''} that would have taken you about ${stats.timeSavedFormatted}.`);

    if (stats.emailsArchived > 0) {
      parts.push(`I archived ${stats.emailsArchived} routine email${stats.emailsArchived !== 1 ? 's' : ''}.`);
    }
    if (stats.emailsDrafted > 0) {
      parts.push(`I prepared ${stats.emailsDrafted} draft${stats.emailsDrafted !== 1 ? 's' : ''} for your review.`);
    }
    if (stats.meetingPreps > 0) {
      parts.push(`I generated prep briefs for ${stats.meetingPreps} meeting${stats.meetingPreps !== 1 ? 's' : ''}.`);
    }

    return parts.join(' ');
  }

  private storeDigest(digest: WeeklyDigest): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO weekly_digests (
        id, week_start, week_end, generated_at, total_actions, actions_by_type,
        total_time_saved_seconds, time_saved_by_type,
        emails_processed, emails_archived, emails_drafted, emails_sent,
        conflicts_detected, conflicts_resolved, meeting_preps,
        subscriptions_analyzed, forgotten_subscriptions, potential_savings,
        follow_up_reminders, deadline_alerts,
        actions_auto_executed, actions_approved, actions_rejected, autonomy_accuracy,
        narrative, highlights
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      digest.id, digest.weekStart, digest.weekEnd, digest.generatedAt,
      digest.totalActions, JSON.stringify(digest.actionsByType),
      digest.totalTimeSavedSeconds, JSON.stringify(digest.timeSavedByType),
      digest.emailsProcessed, digest.emailsArchived, digest.emailsDrafted, digest.emailsSent,
      digest.conflictsDetected, digest.conflictsResolved, digest.meetingPrepsGenerated,
      digest.subscriptionsAnalyzed, digest.forgottenSubscriptions, digest.potentialSavings,
      digest.followUpReminders, digest.deadlineAlerts,
      digest.actionsAutoExecuted, digest.actionsApproved, digest.actionsRejected, digest.autonomyAccuracy,
      digest.narrative, JSON.stringify(digest.highlights),
    );
  }

  private rowToDigest(row: DigestRow): WeeklyDigest {
    return {
      id: row.id,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      generatedAt: row.generated_at,
      totalActions: row.total_actions,
      actionsByType: JSON.parse(row.actions_by_type) as Record<string, number>,
      totalTimeSavedSeconds: row.total_time_saved_seconds,
      timeSavedByType: JSON.parse(row.time_saved_by_type) as Record<string, number>,
      timeSavedFormatted: formatTimeSaved(row.total_time_saved_seconds),
      emailsProcessed: row.emails_processed,
      emailsArchived: row.emails_archived,
      emailsDrafted: row.emails_drafted,
      emailsSent: row.emails_sent,
      conflictsDetected: row.conflicts_detected,
      conflictsResolved: row.conflicts_resolved,
      meetingPrepsGenerated: row.meeting_preps,
      subscriptionsAnalyzed: row.subscriptions_analyzed,
      forgottenSubscriptions: row.forgotten_subscriptions,
      potentialSavings: row.potential_savings,
      followUpReminders: row.follow_up_reminders,
      deadlineAlerts: row.deadline_alerts,
      actionsAutoExecuted: row.actions_auto_executed,
      actionsApproved: row.actions_approved,
      actionsRejected: row.actions_rejected,
      autonomyAccuracy: row.autonomy_accuracy,
      narrative: row.narrative,
      highlights: JSON.parse(row.highlights) as DigestHighlight[],
    };
  }
}

interface AuditEntry {
  id: string;
  request_id: string;
  timestamp: string;
  action: string;
  direction: string;
  status: string;
  payload_hash: string;
  signature: string;
  chain_hash: string;
  metadata: string;
  estimated_time_saved_seconds: number;
}

interface DigestRow {
  id: string;
  week_start: string;
  week_end: string;
  generated_at: string;
  total_actions: number;
  actions_by_type: string;
  total_time_saved_seconds: number;
  time_saved_by_type: string;
  emails_processed: number;
  emails_archived: number;
  emails_drafted: number;
  emails_sent: number;
  conflicts_detected: number;
  conflicts_resolved: number;
  meeting_preps: number;
  subscriptions_analyzed: number;
  forgotten_subscriptions: number;
  potential_savings: number;
  follow_up_reminders: number;
  deadline_alerts: number;
  actions_auto_executed: number;
  actions_approved: number;
  actions_rejected: number;
  autonomy_accuracy: number;
  narrative: string;
  highlights: string;
}
