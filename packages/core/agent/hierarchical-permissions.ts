// Hierarchical Permission Framework — Extends Guardian/Partner/Alter Ego
// with per-tool granularity and inheritance for subagents.
//
// Permission hierarchy:
//   User autonomy tier (Guardian / Partner / Alter Ego)
//     → Domain overrides (email: Partner, finance: Guardian, etc.)
//       → Tool-level permissions (email_send: requires approval, email_draft: auto)
//         → Subagent inherited permissions (cannot exceed parent scope)
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { AutonomyManager, AutonomyDecision } from './autonomy.js';
import type { AutonomyTier, AutonomyDomain } from './types.js';
import type { ActionType } from '../types/ipc.js';
import type {
  SubagentPermissionScope,
  PermissionResolution,
  SubtaskDefinition,
} from './orchestrator-v2-types.js';
import { ComplexityClassifier } from './complexity-classifier.js';

// ─── Permission Resolver ──────────────────────────────────────────────────────

export class HierarchicalPermissionResolver {
  private autonomy: AutonomyManager;

  constructor(autonomy: AutonomyManager) {
    this.autonomy = autonomy;
  }

  /**
   * Build a permission scope for a subagent based on the subtask definition
   * and the user's autonomy configuration.
   *
   * The resulting scope is the INTERSECTION of:
   *   1. The user's autonomy tier for the relevant domain(s)
   *   2. The coordinator's tool scope for this subtask
   *   3. Any explicit permission overrides in the subtask definition
   */
  buildSubagentScope(subtask: SubtaskDefinition): SubagentPermissionScope {
    const toolPermissions: Record<string, 'auto' | 'approve' | 'deny'> = {};

    // For each allowed tool, resolve the effective permission
    for (const toolName of subtask.allowedTools) {
      const domain = ComplexityClassifier.getToolDomain(toolName);
      const userTier = domain
        ? this.autonomy.getDomainTier(domain)
        : this.autonomy.getDomainTier('system');

      // Start with the user's tier decision for this tool's action type
      const baseDecision = this.getBasePermission(toolName, userTier);

      // Apply subtask-level overrides (can only RESTRICT, never WIDEN)
      if (subtask.permissionOverrides?.[toolName]) {
        const override = subtask.permissionOverrides[toolName]!;
        toolPermissions[toolName] = this.intersectPermission(baseDecision, override);
      } else {
        toolPermissions[toolName] = baseDecision;
      }
    }

    // The effective tier is the most restrictive tier across all tools' domains
    const effectiveTier = this.getMostRestrictiveTier(subtask.allowedTools);

    return {
      allowedTools: subtask.allowedTools,
      toolPermissions,
      effectiveTier,
    };
  }

  /**
   * Resolve a permission decision for a specific tool within a subagent scope.
   *
   * @param toolName The tool being called
   * @param scope The subagent's permission scope
   * @returns Full resolution with decision, reason, and whether subagent restricted it
   */
  resolve(toolName: string, scope: SubagentPermissionScope): PermissionResolution {
    // Tool not in scope = denied
    if (!scope.allowedTools.includes(toolName)) {
      return {
        decision: 'denied',
        reason: `Tool '${toolName}' is not in this subagent's allowed tool set`,
        decidingTier: scope.effectiveTier,
        subagentRestricted: true,
      };
    }

    const permission = scope.toolPermissions[toolName];
    if (!permission) {
      return {
        decision: 'denied',
        reason: `No permission entry for tool '${toolName}'`,
        decidingTier: scope.effectiveTier,
        subagentRestricted: true,
      };
    }

    // Map permission string to decision
    switch (permission) {
      case 'auto':
        return {
          decision: 'auto_approve',
          reason: `Tool '${toolName}' auto-approved at ${scope.effectiveTier} tier`,
          decidingTier: scope.effectiveTier,
          subagentRestricted: false,
        };
      case 'approve':
        return {
          decision: 'requires_approval',
          reason: `Tool '${toolName}' requires user approval at ${scope.effectiveTier} tier`,
          decidingTier: scope.effectiveTier,
          subagentRestricted: false,
        };
      case 'deny':
        return {
          decision: 'denied',
          reason: `Tool '${toolName}' is denied by permission configuration`,
          decidingTier: scope.effectiveTier,
          subagentRestricted: true,
        };
    }
  }

  /**
   * Check if a subagent can escalate — request a tool outside its scope.
   * Subagents NEVER escalate directly; they return an escalation request
   * to the coordinator, which either handles it or surfaces to the user.
   */
  canEscalate(toolName: string, scope: SubagentPermissionScope): boolean {
    // A subagent can request escalation if the tool exists in the system
    // but is not in its scope. The coordinator decides whether to grant it.
    return !scope.allowedTools.includes(toolName);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Get the base permission for a tool based on the user's autonomy tier.
   * Maps the three-tier model to per-tool decisions.
   */
  private getBasePermission(
    toolName: string,
    userTier: AutonomyTier,
  ): 'auto' | 'approve' | 'deny' {
    // Read-only tools are always auto at Partner and above
    const READ_TOOLS = new Set([
      'fetch_inbox', 'search_emails', 'fetch_calendar', 'search_files',
      'list_indexed_documents', 'read_document', 'search_web', 'deep_search_web',
      'fetch_url', 'search_contacts', 'list_reminders', 'list_cloud_files',
      'search_cloud_files', 'get_weather', 'get_health_summary',
      'detect_calendar_conflicts', 'categorize_email', 'analyze_image',
    ]);

    // Write tools (create/update but not send/delete)
    const WRITE_TOOLS = new Set([
      'draft_email', 'create_calendar_event', 'update_calendar_event',
      'create_reminder', 'update_reminder', 'add_contact',
      'draft_message', 'log_health_entry', 'archive_email', 'move_email',
      'mark_email_read',
    ]);

    // Execute tools (irreversible or high-impact)
    const EXECUTE_TOOLS = new Set([
      'send_email', 'delete_calendar_event', 'delete_reminder',
      'send_message_channel',
    ]);

    if (userTier === 'guardian') {
      // Guardian: everything requires approval except reads
      if (READ_TOOLS.has(toolName)) return 'approve';
      return 'approve';
    }

    if (userTier === 'partner') {
      if (READ_TOOLS.has(toolName)) return 'auto';
      if (WRITE_TOOLS.has(toolName)) return 'auto';
      if (EXECUTE_TOOLS.has(toolName)) return 'approve';
      return 'approve';
    }

    // Alter Ego: auto almost everything, approve on irreversible sends
    if (READ_TOOLS.has(toolName)) return 'auto';
    if (WRITE_TOOLS.has(toolName)) return 'auto';
    if (toolName === 'send_email' || toolName === 'send_message_channel') return 'approve';
    return 'auto';
  }

  /**
   * Intersect two permission levels. Always takes the MORE RESTRICTIVE.
   * deny > approve > auto
   */
  private intersectPermission(
    base: 'auto' | 'approve' | 'deny',
    override: 'auto' | 'approve' | 'deny',
  ): 'auto' | 'approve' | 'deny' {
    const ORDER = { deny: 2, approve: 1, auto: 0 };
    return ORDER[override] > ORDER[base] ? override : base;
  }

  /**
   * Get the most restrictive autonomy tier across all tools' domains.
   */
  private getMostRestrictiveTier(tools: string[]): AutonomyTier {
    const TIER_ORDER: Record<AutonomyTier, number> = {
      guardian: 0,
      partner: 1,
      alter_ego: 2,
    };

    let mostRestrictive: AutonomyTier = 'alter_ego';

    for (const toolName of tools) {
      const domain = ComplexityClassifier.getToolDomain(toolName);
      const tier = domain
        ? this.autonomy.getDomainTier(domain)
        : this.autonomy.getDomainTier('system');

      if (TIER_ORDER[tier] < TIER_ORDER[mostRestrictive]) {
        mostRestrictive = tier;
      }
    }

    return mostRestrictive;
  }
}
