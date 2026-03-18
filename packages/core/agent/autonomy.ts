// Autonomy Framework — Determines whether actions require user approval.
// Three tiers: Guardian (all approval), Partner (smart auto-approve), Alter Ego (mostly auto).

import type { DatabaseHandle } from '../platform/types.js';
import type { ActionType } from '../types/ipc.js';
import type {
  AutonomyTier,
  AutonomyConfig,
  AutonomyDomain,
} from './types.js';
import type { PreferenceGraph } from './preference-graph.js';

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
  'finance.plaid_link': 'finances',
  'finance.plaid_exchange': 'finances',
  'finance.plaid_sync': 'finances',
  'finance.plaid_balances': 'finances',
  'finance.plaid_status': 'finances',
  'finance.plaid_disconnect': 'finances',
  'health.fetch': 'health',
  'web.search': 'web',
  'web.deep_search': 'web',
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
  'network.startDiscovery': 'network',
  'network.stopDiscovery': 'network',
  'network.sendOffer': 'network',
  'network.sendAcceptance': 'network',
  'network.sendRevocation': 'network',
  'network.syncContext': 'network',
  'connector.auth': 'connectors',
  'connector.auth_status': 'connectors',
  'connector.disconnect': 'connectors',
  'connector.sync': 'connectors',
  'connector.list_items': 'connectors',
  'import.run': 'connectors',
  'import.status': 'connectors',
  'service.api_call': 'services',
  'model.download': 'system',
  'model.download_cancel': 'system',
  'model.verify': 'system',
  'file.write': 'system',
  'subscription.insight': 'finances',
  'dark_pattern.detected': 'system',
  'insight.proactive': 'system',
  'insight.meeting_prep': 'calendar',
  'insight.follow_up': 'email',
  'insight.deadline': 'reminders',
  'insight.conflict': 'calendar',
  'escalation.prompt': 'system',
  'health.entry': 'health',
  // System / Hardware Bridge (Sprint F)
  'system.execute': 'system',
  'system.hardware_stat': 'system',
  'system.app_launch': 'system',
  'system.app_list': 'system',
  'system.file_watch': 'system',
  'system.file_watch_stop': 'system',
  'system.clipboard_read': 'clipboard',
  'system.clipboard_write': 'clipboard',
  'system.notification': 'system',
  'system.accessibility_read': 'system',
  'system.keypress': 'system',
  'system.shortcut_run': 'system',
  'system.process_kill': 'system',
  'system.process_signal': 'system',
  'system.process_list': 'system',
};

// Actions classified as read (safe), write (moderate), or execute (high-stakes)
export type ActionRisk = 'read' | 'write' | 'execute';

export const ACTION_RISK_MAP: Record<ActionType, ActionRisk> = {
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
  'finance.plaid_link': 'write',
  'finance.plaid_exchange': 'write',
  'finance.plaid_sync': 'read',
  'finance.plaid_balances': 'read',
  'finance.plaid_status': 'read',
  'finance.plaid_disconnect': 'write',
  'health.fetch': 'read',
  'web.search': 'read',
  'web.deep_search': 'read',
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
  'voice.transcribe': 'read',
  'voice.speak': 'read',
  'voice.conversation': 'read',
  'cloud.auth': 'write',
  'cloud.auth_status': 'read',
  'cloud.disconnect': 'write',
  'cloud.list_files': 'read',
  'cloud.file_metadata': 'read',
  'cloud.download_file': 'read',
  'cloud.check_changed': 'read',
  'network.startDiscovery': 'read',
  'network.stopDiscovery': 'read',
  'network.sendOffer': 'execute',
  'network.sendAcceptance': 'execute',
  'network.sendRevocation': 'execute',
  'network.syncContext': 'write',
  'connector.auth': 'write',
  'connector.auth_status': 'read',
  'connector.disconnect': 'write',
  'connector.sync': 'read',
  'connector.list_items': 'read',
  'import.run': 'write',
  'import.status': 'read',
  'service.api_call': 'execute',
  'model.download': 'execute',
  'model.download_cancel': 'write',
  'model.verify': 'read',
  'file.write': 'write',
  'subscription.insight': 'read',
  'dark_pattern.detected': 'read',
  'insight.proactive': 'read',
  'insight.meeting_prep': 'read',
  'insight.follow_up': 'read',
  'insight.deadline': 'read',
  'insight.conflict': 'read',
  'escalation.prompt': 'write',
  'health.entry': 'write',
  // System / Hardware Bridge (Sprint F)
  'system.execute': 'execute',
  'system.hardware_stat': 'read',
  'system.app_launch': 'write',
  'system.app_list': 'read',
  'system.file_watch': 'read',
  'system.file_watch_stop': 'read',
  'system.clipboard_read': 'read',
  'system.clipboard_write': 'write',
  'system.notification': 'write',
  'system.accessibility_read': 'read',
  'system.keypress': 'execute',
  'system.shortcut_run': 'execute',
  'system.process_kill': 'execute',
  'system.process_signal': 'execute',
  'system.process_list': 'read',
};

export type AutonomyDecision = 'auto_approve' | 'requires_approval' | 'blocked';

export class AutonomyManager {
  private db: DatabaseHandle;
  private defaultTier: AutonomyTier;
  private onPreferenceChanged?: (domain: string, tier: string) => void;
  private preferenceGraph: PreferenceGraph | null = null;

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
   * Set the preference graph for preference-driven auto-approval.
   */
  setPreferenceGraph(graph: PreferenceGraph): void {
    this.preferenceGraph = graph;
  }

  /**
   * Decide whether an action should be auto-approved, requires approval, or is blocked.
   * Consults preference graph after tier/risk check — high-confidence learned preferences
   * can upgrade requires_approval → auto_approve (never downgrade).
   */
  decide(action: ActionType, context?: Record<string, unknown>): AutonomyDecision {
    const baseDecision = this.decideBase(action);

    // Preference graph integration: high-confidence learned preference can upgrade
    // requires_approval → auto_approve (but never downgrade auto_approve)
    if (baseDecision === 'requires_approval' && this.preferenceGraph) {
      const pref = this.preferenceGraph.shouldAutoApprove(action, context ?? {});
      if (pref && pref.confidence >= 0.85 && pref.override !== true) {
        if (!(pref.overrideValue === false)) {
          return 'auto_approve';
        }
      }
    }

    return baseDecision;
  }

  /**
   * Base autonomy decision (tier + risk only, no preference graph).
   */
  private decideBase(action: ActionType): AutonomyDecision {
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
        if (risk === 'execute' && (action === 'email.send')) {
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
    const domains: AutonomyDomain[] = ['email', 'calendar', 'finances', 'health', 'files', 'contacts', 'services', 'web', 'reminders', 'messaging', 'clipboard', 'location', 'voice', 'cloud-storage', 'network', 'system', 'connectors'];
    const config = {} as Record<AutonomyDomain, AutonomyTier>;
    for (const domain of domains) {
      config[domain] = this.getDomainTier(domain);
    }
    return config;
  }
}
