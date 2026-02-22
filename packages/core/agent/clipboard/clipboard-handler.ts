// Clipboard Action Handler — Executes actions based on recognized clipboard patterns.
//
// Each pattern type has a corresponding action handler. The handler checks
// the user's autonomy tier before executing or requesting approval.
//
// CRITICAL: No network imports. Actions that need network go through IPC → Gateway.

import type { AutonomyTier } from '../types.js';
import type { RecognizedPattern } from './pattern-recognizer.js';
import type { ClipboardActionType } from './action-mapper.js';
import { sanitizeForAuditTrail } from './clipboard-privacy.js';

export interface ClipboardActionResult {
  /** Whether the action was executed */
  executed: boolean;
  /** The action type that was taken */
  action: ClipboardActionType;
  /** Result data from execution (if executed) */
  result?: unknown;
  /** Whether the action requires user approval */
  requiresApproval: boolean;
  /** Pending approval ID (if requires approval) */
  pendingApprovalId?: string;
  /** Sanitized audit entry (never contains full clipboard text) */
  auditEntry: ReturnType<typeof sanitizeForAuditTrail>;
}

export class ClipboardActionHandler {
  /**
   * Handle a recognized clipboard pattern based on autonomy tier.
   */
  async handlePattern(
    pattern: RecognizedPattern,
    autonomyTier: AutonomyTier,
  ): Promise<ClipboardActionResult> {
    const actionType = pattern.suggestedAction?.actionType ?? 'save_snippet';
    const auditEntry = sanitizeForAuditTrail(pattern);

    // Guardian tier: always require approval
    if (autonomyTier === 'guardian') {
      return {
        executed: false,
        action: actionType,
        requiresApproval: true,
        pendingApprovalId: `clipboard-${Date.now()}`,
        auditEntry,
      };
    }

    // Partner and Alter Ego: auto-execute based on action type
    const result = await this.executeAction(actionType, pattern);

    return {
      executed: true,
      action: actionType,
      result,
      requiresApproval: false,
      auditEntry,
    };
  }

  private async executeAction(
    actionType: ClipboardActionType,
    pattern: RecognizedPattern,
  ): Promise<unknown> {
    switch (actionType) {
      case 'track_package':
        return this.executeTrackPackage(pattern);
      case 'track_flight':
        return this.executeTrackFlight(pattern);
      case 'summarize_url':
        return this.executeSummarizeUrl(pattern);
      case 'lookup_contact':
        return this.executeLookupContact(pattern);
      case 'compose_email':
        return this.executeComposeEmail(pattern);
      case 'create_event':
        return this.executeCreateEvent(pattern);
      default:
        return { status: 'no_handler', type: actionType };
    }
  }

  private async executeTrackPackage(pattern: RecognizedPattern): Promise<unknown> {
    // This would send a web.search action via IPC in production
    return {
      action: 'web.search',
      query: `track package ${pattern.carrier ?? ''} ${pattern.value}`.trim(),
      carrier: pattern.carrier,
      trackingNumber: pattern.value,
    };
  }

  private async executeTrackFlight(pattern: RecognizedPattern): Promise<unknown> {
    return {
      action: 'web.search',
      query: `flight status ${pattern.value}`,
      flightCode: pattern.value,
    };
  }

  private async executeSummarizeUrl(pattern: RecognizedPattern): Promise<unknown> {
    return {
      action: 'web.retrieve',
      url: pattern.value,
    };
  }

  private async executeLookupContact(pattern: RecognizedPattern): Promise<unknown> {
    return {
      action: 'contacts.search',
      phone: pattern.value,
    };
  }

  private async executeComposeEmail(pattern: RecognizedPattern): Promise<unknown> {
    return {
      action: 'email.draft',
      to: pattern.value,
    };
  }

  private async executeCreateEvent(pattern: RecognizedPattern): Promise<unknown> {
    return {
      action: 'calendar.create',
      dateReference: pattern.value,
    };
  }
}
