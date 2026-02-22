// Autonomy Framework — Determines whether actions require user approval.
// Three tiers: Guardian (all approval), Partner (smart auto-approve), Alter Ego (mostly auto).

import type { DatabaseHandle } from '../platform/types.js';
import type { ActionType } from '../types/ipc.js';
import type {
  AutonomyTier,
  AutonomyConfig,
  AutonomyDomain,
} from './types.js';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS autonomy_config (
    domain TEXT PRIMARY KEY,
    tier TEXT NOT NULL CHECK (tier IN ('guardian', 'partner', 'alter_ego')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// Map ActionType to AutonomyDomain
const ACTION_DOMAIN_MAP: Record<ActionType, AutonomyDomain> = {
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
  'service.api_call': 'services',
  'model.download': 'system',
  'model.download_cancel': 'system',
  'model.verify': 'system',
};

// Actions classified as read (safe), write (moderate), or execute (high-stakes)
type ActionRisk = 'read' | 'write' | 'execute';

const ACTION_RISK_MAP: Record<ActionType, ActionRisk> = {
  'email.fetch': 'read',
  'email.send': 'execute',
  'email.draft': 'write',
  'email.archive': 'write',
  'email.move': 'write',
  'email.markRead': 'write',
  'calendar.fetch': 'read',
  'calendar.create': 'write',
  'calendar.update': 'write',
  'calendar.delete': 'execute',
  'finance.fetch_transactions': 'read',
  'health.fetch': 'read',
  'web.search': 'read',
  'web.fetch': 'read',
  'reminder.create': 'write',
  'reminder.update': 'write',
  'reminder.list': 'read',
  'reminder.delete': 'write',
  'contacts.import': 'read',
  'contacts.list': 'read',
  'contacts.get': 'read',
  'contacts.search': 'read',
  'messaging.draft': 'write',
  'messaging.send': 'execute',
  'messaging.read': 'read',
  'clipboard.analyze': 'read',
  'clipboard.act': 'write',
  'clipboard.web_action': 'execute',
  'location.reminder_fire': 'read',
  'location.commute_alert': 'read',
  'location.weather_query': 'read',
  'service.api_call': 'execute',
  'model.download': 'execute',
  'model.download_cancel': 'write',
  'model.verify': 'read',
};

export type AutonomyDecision = 'auto_approve' | 'requires_approval' | 'blocked';

export class AutonomyManager {
  private db: DatabaseHandle;
  private defaultTier: AutonomyTier;
  private onPreferenceChanged?: (domain: string, tier: string) => void;

  constructor(db: DatabaseHandle, config?: AutonomyConfig & { onPreferenceChanged?: (domain: string, tier: string) => void }) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.defaultTier = config?.defaultTier ?? 'partner';
    this.onPreferenceChanged = config?.onPreferenceChanged;

    // Apply domain overrides from config
    if (config?.domainOverrides) {
      for (const [domain, tier] of Object.entries(config.domainOverrides)) {
        if (tier) {
          this.setDomainTier(domain as AutonomyDomain, tier);
        }
      }
    }
  }

  /**
   * Decide whether an action should be auto-approved, requires approval, or is blocked.
   */
  decide(action: ActionType): AutonomyDecision {
    const domain = ACTION_DOMAIN_MAP[action];
    const tier = this.getDomainTier(domain);
    const risk = ACTION_RISK_MAP[action];

    switch (tier) {
      case 'guardian':
        // Guardian: ALL actions require explicit user approval
        return 'requires_approval';

      case 'partner':
        // Partner: Read = auto. Write = auto for routine. Execute = approval.
        switch (risk) {
          case 'read':
            return 'auto_approve';
          case 'write':
            return 'auto_approve';
          case 'execute':
            return 'requires_approval';
        }
        break; // unreachable, but satisfies TS

      case 'alter_ego':
        // Alter Ego: Auto for almost everything. High-stakes execute = approval.
        // Full pattern learning is Sprint 4. For now, behaves like Partner
        // with fewer approval requirements.
        if (risk === 'execute' && (action === 'email.send')) {
          // Even Alter Ego confirms sending emails (can be changed by learned patterns in S4)
          return 'requires_approval';
        }
        return 'auto_approve';
    }

    return 'requires_approval'; // fallback
  }

  /**
   * Get the domain for an action type.
   */
  getDomainForAction(action: ActionType): AutonomyDomain {
    return ACTION_DOMAIN_MAP[action];
  }

  /**
   * Get the tier for a specific domain.
   */
  getDomainTier(domain: AutonomyDomain): AutonomyTier {
    const row = this.db.prepare(
      'SELECT tier FROM autonomy_config WHERE domain = ?'
    ).get(domain) as { tier: string } | undefined;

    return (row?.tier as AutonomyTier) ?? this.defaultTier;
  }

  /**
   * Set the tier for a specific domain.
   * Triggers sync callback if configured.
   */
  setDomainTier(domain: AutonomyDomain, tier: AutonomyTier): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO autonomy_config (domain, tier, updated_at) VALUES (?, ?, datetime(\'now\'))'
    ).run(domain, tier);

    this.onPreferenceChanged?.(domain, tier);
  }

  /**
   * Get current autonomy configuration for all domains.
   */
  getConfig(): Record<AutonomyDomain, AutonomyTier> {
    const domains: AutonomyDomain[] = ['email', 'calendar', 'finances', 'health', 'files', 'contacts', 'services', 'web', 'reminders', 'messaging', 'clipboard', 'location', 'system'];
    const config = {} as Record<AutonomyDomain, AutonomyTier>;
    for (const domain of domains) {
      config[domain] = this.getDomainTier(domain);
    }
    return config;
  }
}
