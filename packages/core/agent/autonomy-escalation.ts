/**
 * Autonomy Escalation Engine — Monitors approval patterns and suggests tier upgrades.
 *
 * Guardian → Partner: after 10 consecutive approvals of same action type.
 * Partner → Alter Ego: after 14 days of consistent success with zero corrections.
 *
 * AUTONOMOUS DECISION: Thresholds (10 for G→P, 14 days for P→AE) are configurable defaults.
 * Reasoning: These values balance trust-building with user patience.
 * Escalation check: Build prompt grants autonomy for threshold tuning.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { ApprovalPattern } from './approval-patterns.js';
import type { AutonomyManager } from './autonomy.js';
import type { AutonomyTier, AutonomyDomain } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EscalationPrompt {
  id: string;
  type: 'guardian_to_partner' | 'partner_to_alterego';
  domain: string;
  actionType: string;
  consecutiveApprovals: number;
  message: string;
  previewActions: PreviewAction[];
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
}

export interface PreviewAction {
  description: string;
  currentBehavior: string;
  newBehavior: string;
  estimatedTimeSaved: string;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

/**
 * AUTONOMOUS DECISION: Escalation thresholds tuned for user trust.
 * Reasoning: 10 approvals ensures the user has built a habit pattern;
 * 14 days of Partner mode proves sustained confidence.
 * Escalation check: Build prompt explicitly authorizes threshold tuning.
 */
const ESCALATION_THRESHOLDS = {
  guardian_to_partner: {
    threshold: 10,
    cooldownMs: 7 * 24 * 60 * 60 * 1000,  // 7 days after dismissal
  },
  partner_to_alterego: {
    thresholdDays: 14,
    cooldownMs: 14 * 24 * 60 * 60 * 1000,  // 14 days after dismissal
  },
} as const;

// ─── Action domain mapping (matches autonomy.ts) ───────────────────────────

const ACTION_TO_DOMAIN: Record<string, AutonomyDomain> = {
  'email.fetch': 'email',
  'email.send': 'email',
  'email.draft': 'email',
  'email.archive': 'email',
  'email.move': 'email',
  'email.markRead': 'email',
  'calendar.fetch': 'calendar',
  'calendar.create': 'calendar',
  'calendar.update': 'calendar',
  'calendar.delete': 'calendar',
  'finance.fetch_transactions': 'finances',
  'finance.plaid_link': 'finances',
  'finance.plaid_exchange': 'finances',
  'finance.plaid_sync': 'finances',
  'finance.plaid_balances': 'finances',
  'finance.plaid_status': 'finances',
  'finance.plaid_disconnect': 'finances',
  'health.fetch': 'health',
  'web.search': 'web',
  'web.fetch': 'web',
  'reminder.create': 'reminders',
  'reminder.update': 'reminders',
  'reminder.list': 'reminders',
  'reminder.delete': 'reminders',
  'contacts.import': 'contacts',
  'contacts.list': 'contacts',
  'contacts.get': 'contacts',
  'contacts.search': 'contacts',
  'messaging.draft': 'messaging',
  'messaging.send': 'messaging',
  'messaging.read': 'messaging',
  'clipboard.analyze': 'clipboard',
  'clipboard.act': 'clipboard',
  'clipboard.web_action': 'clipboard',
  'location.reminder_fire': 'location',
  'location.commute_alert': 'location',
  'location.weather_query': 'location',
  'voice.transcribe': 'voice',
  'voice.speak': 'voice',
  'voice.conversation': 'voice',
  'cloud.auth': 'cloud-storage',
  'cloud.auth_status': 'cloud-storage',
  'cloud.disconnect': 'cloud-storage',
  'cloud.list_files': 'cloud-storage',
  'cloud.file_metadata': 'cloud-storage',
  'cloud.download_file': 'cloud-storage',
  'cloud.check_changed': 'cloud-storage',
  'service.api_call': 'services',
  'model.download': 'system',
  'model.download_cancel': 'system',
  'model.verify': 'system',
};

// ─── Preview action descriptions ────────────────────────────────────────────

const PREVIEW_DESCRIPTIONS: Record<string, { desc: string; current: string; newBehavior: string; timeSaved: string }> = {
  'email.archive:archive': {
    desc: 'Archive routine emails',
    current: 'Shows preview, waits for approval',
    newBehavior: 'Archives automatically, shows in digest',
    timeSaved: '~2 min/day',
  },
  'email.send:reply': {
    desc: 'Send replies',
    current: 'Shows draft, waits for approval',
    newBehavior: 'Sends replies automatically for routine threads',
    timeSaved: '~3 min/day',
  },
  'email.send:new': {
    desc: 'Send new emails',
    current: 'Shows draft, waits for approval',
    newBehavior: 'Sends automatically, shows in digest with undo',
    timeSaved: '~1 min/day',
  },
  'email.draft:reply_draft': {
    desc: 'Save reply drafts',
    current: 'Shows draft content, waits for confirmation',
    newBehavior: 'Saves drafts automatically',
    timeSaved: '~1 min/day',
  },
  'calendar.create:create_event': {
    desc: 'Create calendar events',
    current: 'Shows event details, waits for approval',
    newBehavior: 'Creates events automatically, shows in digest',
    timeSaved: '~3 min/day',
  },
};

function getPreviewForPattern(pattern: ApprovalPattern): PreviewAction {
  const key = `${pattern.actionType}:${pattern.subType}`;
  const preview = PREVIEW_DESCRIPTIONS[key];
  if (preview) {
    return {
      description: preview.desc,
      currentBehavior: preview.current,
      newBehavior: preview.newBehavior,
      estimatedTimeSaved: preview.timeSaved,
    };
  }
  return {
    description: `${pattern.actionType} (${pattern.subType})`,
    currentBehavior: 'Requires manual approval',
    newBehavior: 'Handled automatically',
    estimatedTimeSaved: '~1 min/action',
  };
}

// ─── SQLite Schema ──────────────────────────────────────────────────────────

const CREATE_ESCALATION_TABLE = `
  CREATE TABLE IF NOT EXISTS escalation_prompts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    domain TEXT NOT NULL,
    action_type TEXT NOT NULL,
    consecutive_approvals INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL,
    preview_actions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    responded_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_escalation_status ON escalation_prompts(status);
  CREATE INDEX IF NOT EXISTS idx_escalation_domain ON escalation_prompts(domain);
`;

// ─── Public API ─────────────────────────────────────────────────────────────

export class EscalationEngine {
  private db: DatabaseHandle;
  private autonomy: AutonomyManager;
  private aiName: string;

  constructor(config: { db: DatabaseHandle; autonomy: AutonomyManager; aiName?: string }) {
    this.db = config.db;
    this.autonomy = config.autonomy;
    this.aiName = config.aiName ?? 'Semblance';
    this.db.exec(CREATE_ESCALATION_TABLE);
  }

  /**
   * Check all approval patterns and generate escalation prompts if thresholds are met.
   */
  checkForEscalations(patterns: ApprovalPattern[]): EscalationPrompt[] {
    const prompts: EscalationPrompt[] = [];

    // Expire old prompts
    this.expirePendingPrompts();

    for (const pattern of patterns) {
      const domain = ACTION_TO_DOMAIN[pattern.actionType];
      if (!domain) continue;

      const currentTier = this.autonomy.getDomainTier(domain);

      // Guardian → Partner check
      if (currentTier === 'guardian') {
        const threshold = ESCALATION_THRESHOLDS.guardian_to_partner.threshold;
        if (pattern.consecutiveApprovals >= threshold) {
          const prompt = this.maybeCreatePrompt({
            type: 'guardian_to_partner',
            domain,
            actionType: pattern.actionType,
            consecutiveApprovals: pattern.consecutiveApprovals,
            pattern,
          });
          if (prompt) prompts.push(prompt);
        }
      }

      // Partner → Alter Ego check
      if (currentTier === 'partner') {
        const thresholdDays = ESCALATION_THRESHOLDS.partner_to_alterego.thresholdDays;
        if (pattern.lastApprovalAt && pattern.totalRejections === 0) {
          const firstApprovalDaysAgo = this.daysSince(pattern.lastApprovalAt) +
            (pattern.totalApprovals > 1 ? thresholdDays : 0); // approximate
          // Use total approvals as a proxy for sustained success
          if (pattern.totalApprovals >= thresholdDays && pattern.consecutiveApprovals >= 5) {
            const prompt = this.maybeCreatePrompt({
              type: 'partner_to_alterego',
              domain,
              actionType: pattern.actionType,
              consecutiveApprovals: pattern.consecutiveApprovals,
              pattern,
            });
            if (prompt) prompts.push(prompt);
          }
        }
      }
    }

    return prompts;
  }

  /**
   * Record user response to an escalation prompt.
   */
  recordResponse(promptId: string, accepted: boolean): void {
    const now = new Date().toISOString();
    const status = accepted ? 'accepted' : 'dismissed';

    this.db.prepare(
      'UPDATE escalation_prompts SET status = ?, responded_at = ? WHERE id = ?'
    ).run(status, now, promptId);

    if (accepted) {
      // Get the prompt to find which domain to upgrade
      const prompt = this.getPrompt(promptId);
      if (prompt) {
        const newTier: AutonomyTier = prompt.type === 'guardian_to_partner' ? 'partner' : 'alter_ego';
        this.autonomy.setDomainTier(prompt.domain as AutonomyDomain, newTier);
      }
    }
  }

  /**
   * Get a specific prompt by ID.
   */
  getPrompt(promptId: string): EscalationPrompt | null {
    const row = this.db.prepare(
      'SELECT * FROM escalation_prompts WHERE id = ?'
    ).get(promptId) as EscalationRow | undefined;

    return row ? this.rowToPrompt(row) : null;
  }

  /**
   * Get all active (pending) escalation prompts.
   */
  getActivePrompts(): EscalationPrompt[] {
    this.expirePendingPrompts();
    const rows = this.db.prepare(
      'SELECT * FROM escalation_prompts WHERE status = ? ORDER BY created_at DESC'
    ).all('pending') as EscalationRow[];

    return rows.map(r => this.rowToPrompt(r));
  }

  /**
   * Get all prompts (for history/debugging).
   */
  getAllPrompts(): EscalationPrompt[] {
    const rows = this.db.prepare(
      'SELECT * FROM escalation_prompts ORDER BY created_at DESC'
    ).all() as EscalationRow[];

    return rows.map(r => this.rowToPrompt(r));
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private maybeCreatePrompt(opts: {
    type: EscalationPrompt['type'];
    domain: string;
    actionType: string;
    consecutiveApprovals: number;
    pattern: ApprovalPattern;
  }): EscalationPrompt | null {
    // Check for existing pending/recent dismissed prompt for this domain+type
    const cooldownMs = opts.type === 'guardian_to_partner'
      ? ESCALATION_THRESHOLDS.guardian_to_partner.cooldownMs
      : ESCALATION_THRESHOLDS.partner_to_alterego.cooldownMs;

    const existing = this.db.prepare(`
      SELECT * FROM escalation_prompts
      WHERE domain = ? AND type = ?
      AND (status = 'pending' OR (status = 'dismissed' AND responded_at > ?))
      ORDER BY created_at DESC LIMIT 1
    `).get(
      opts.domain,
      opts.type,
      new Date(Date.now() - cooldownMs).toISOString(),
    ) as EscalationRow | undefined;

    if (existing) return null; // Cooldown or pending — skip

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const message = opts.type === 'guardian_to_partner'
      ? `You've approved all ${opts.consecutiveApprovals} of ${this.aiName}'s ${opts.pattern.subType} actions. Want ${this.aiName} to handle these automatically?`
      : `${this.aiName} has handled your ${opts.domain} autonomously with no corrections. Ready to let ${this.aiName} take on more? Here's what Alter Ego mode would do differently:`;

    const previewActions = [getPreviewForPattern(opts.pattern)];

    const prompt: EscalationPrompt = {
      id: nanoid(),
      type: opts.type,
      domain: opts.domain,
      actionType: opts.actionType,
      consecutiveApprovals: opts.consecutiveApprovals,
      message,
      previewActions,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    };

    this.db.prepare(`
      INSERT INTO escalation_prompts (id, type, domain, action_type, consecutive_approvals, message, preview_actions, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prompt.id, prompt.type, prompt.domain, prompt.actionType,
      prompt.consecutiveApprovals, prompt.message,
      JSON.stringify(prompt.previewActions),
      prompt.createdAt, prompt.expiresAt, prompt.status,
    );

    return prompt;
  }

  private expirePendingPrompts(): void {
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE escalation_prompts SET status = 'expired' WHERE status = 'pending' AND expires_at < ?"
    ).run(now);
  }

  private daysSince(isoDate: string): number {
    const diff = Date.now() - new Date(isoDate).getTime();
    return Math.floor(diff / (24 * 60 * 60 * 1000));
  }

  private rowToPrompt(row: EscalationRow): EscalationPrompt {
    return {
      id: row.id,
      type: row.type as EscalationPrompt['type'],
      domain: row.domain,
      actionType: row.action_type,
      consecutiveApprovals: row.consecutive_approvals,
      message: row.message,
      previewActions: JSON.parse(row.preview_actions) as PreviewAction[],
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.status as EscalationPrompt['status'],
    };
  }
}

interface EscalationRow {
  id: string;
  type: string;
  domain: string;
  action_type: string;
  consecutive_approvals: number;
  message: string;
  preview_actions: string;
  created_at: string;
  expires_at: string;
  status: string;
  responded_at: string | null;
}
