// Alter Ego Guardrails — Second-layer decision logic for alter_ego tier.
//
// Runs AFTER BoundaryEnforcer (which catches $500+, legal, irreversible).
// This layer adds lower-threshold checks: financial gate (user-configurable),
// novel action detection, sensitive contact protection, and contact trust.
//
// Does NOT check hard limits (orchestrator does that).
// Does NOT require LLM — all logic is deterministic.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { ActionType } from '../types/ipc.js';
import type { ActionRisk } from './autonomy.js';
import type { ContactStore } from '../knowledge/contacts/contact-store.js';
import type { AlterEgoStore } from './alter-ego-store.js';
import type { GuardrailResult } from './alter-ego-types.js';
import { IRREVERSIBLE_ACTIONS } from './escalation-boundaries.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Actions that always batch regardless of settings. Never disableable. */
const FINANCIAL_SIGNIFICANT_ACTIONS: ActionType[] = [
  'finance.plaid_disconnect',
];

/** Actions that involve sending to a recipient — trust checking applies. */
const SEND_ACTIONS: ActionType[] = [
  'email.send',
  'messaging.send',
];

/** Payload fields that may contain a dollar amount. */
const AMOUNT_FIELDS = ['amount', 'total', 'price'] as const;

// ─── Guardrails ─────────────────────────────────────────────────────────────

export class AlterEgoGuardrails {
  private store: AlterEgoStore;
  private contactStore: ContactStore | null;

  constructor(
    store: AlterEgoStore,
    contactStore: ContactStore | null,
  ) {
    this.store = store;
    this.contactStore = contactStore;
  }

  /**
   * Evaluate an action against alter ego guardrails.
   *
   * Called only when:
   * 1. Autonomy tier is alter_ego
   * 2. AutonomyManager.decide() returned auto_approve
   * 3. BoundaryEnforcer did NOT escalate
   *
   * Returns the guardrail decision. First triggered gate wins.
   */
  evaluateAction(input: {
    action: ActionType;
    payload: Record<string, unknown>;
    risk: ActionRisk;
  }): GuardrailResult {
    const { action, payload, risk } = input;
    const settings = this.store.getSettings();

    // Read-only actions always proceed — no guardrails needed
    if (risk === 'read') {
      return { decision: 'PROCEED', reasoning: 'Read-only action' };
    }

    // 1. IRREVERSIBILITY CHECK
    if (IRREVERSIBLE_ACTIONS.includes(action)) {
      if (!settings.confirmationDisabledCategories.includes('irreversible')) {
        return {
          decision: 'BATCH_PENDING',
          reason: `Action '${action}' is irreversible and requires confirmation`,
          category: 'irreversible',
        };
      }
    }

    // 2. FINANCIAL GATE
    // 2a. Financial significant actions — always batch, never disableable
    if (FINANCIAL_SIGNIFICANT_ACTIONS.includes(action)) {
      return {
        decision: 'BATCH_PENDING',
        reason: `Action '${action}' is a significant financial action`,
        category: 'financial_significant',
      };
    }

    // 2b. Dollar threshold check
    const amount = this.extractAmount(payload);
    if (amount !== null && amount > settings.dollarThreshold) {
      if (!settings.confirmationDisabledCategories.includes('financial_routine')) {
        return {
          decision: 'BATCH_PENDING',
          reason: `Amount $${amount} exceeds threshold $${settings.dollarThreshold}`,
          category: 'financial_threshold',
        };
      }
    }

    // 3. ESCALATION TRIGGERS
    // 3a. Novel action type — always active, never disableable
    if (this.store.isNovelAction(action)) {
      return {
        decision: 'BATCH_PENDING',
        reason: `First time performing '${action}' — requires confirmation`,
        category: 'novel',
      };
    }

    // 3b. Sensitive contact — family members
    if (SEND_ACTIONS.includes(action) && this.contactStore) {
      const recipientEmail = this.extractRecipientEmail(payload);
      if (recipientEmail) {
        const contacts = this.contactStore.findByEmail(recipientEmail);
        const isFamilyMember = contacts.some(c => c.relationshipType === 'family');
        if (isFamilyMember) {
          return {
            decision: 'BATCH_PENDING',
            reason: `Sending to family member requires confirmation`,
            category: 'sensitive_contact',
          };
        }
      }
    }

    // 4. CONTACT TRUST CHECK (send actions only)
    if (SEND_ACTIONS.includes(action)) {
      const recipientEmail = this.extractRecipientEmail(payload);
      if (recipientEmail) {
        if (!this.store.isTrusted(recipientEmail, action)) {
          return {
            decision: 'DRAFT_FIRST',
            reason: `Not yet trusted to send to ${recipientEmail} — review draft first`,
            contactEmail: recipientEmail,
          };
        }
      }
    }

    // 5. ALL GATES PASSED
    return { decision: 'PROCEED', reasoning: 'All guardrail checks passed' };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private extractAmount(payload: Record<string, unknown>): number | null {
    for (const field of AMOUNT_FIELDS) {
      const value = payload[field];
      if (typeof value === 'number' && value > 0) {
        return value;
      }
    }
    return null;
  }

  private extractRecipientEmail(payload: Record<string, unknown>): string | null {
    const to = payload['to'];
    if (Array.isArray(to) && to.length > 0 && typeof to[0] === 'string') {
      return to[0];
    }
    if (typeof to === 'string') {
      return to;
    }
    return null;
  }
}
