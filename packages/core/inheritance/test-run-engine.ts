// Test Run Engine — Simulates Inheritance Protocol without executing.
// No IPC dispatch, no Witness attestations, but IS audit-logged.
// CRITICAL: No networking imports.

import type { InheritanceConfigStore } from './inheritance-config-store.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { AuditLogger } from './inheritance-executor.js';
import type { TestRunResult, TestRunActionResult } from './types.js';
import { nanoid } from 'nanoid';

export interface TestRunEngineDeps {
  store: InheritanceConfigStore;
  premiumGate: PremiumGate;
  auditLogger: AuditLogger;
}

/**
 * Simulates the Inheritance Protocol for a party without executing any actions.
 * Results are audit-logged for record-keeping but produce no side effects.
 */
export class TestRunEngine {
  private store: InheritanceConfigStore;
  private premiumGate: PremiumGate;
  private auditLogger: AuditLogger;

  constructor(deps: TestRunEngineDeps) {
    this.store = deps.store;
    this.premiumGate = deps.premiumGate;
    this.auditLogger = deps.auditLogger;
  }

  /**
   * Simulate protocol execution for a party.
   */
  simulate(partyId: string): TestRunResult | { success: false; error: string } {
    if (!this.premiumGate.isPremium()) {
      return { success: false, error: 'Inheritance Protocol requires Digital Representative tier' };
    }

    const party = this.store.getParty(partyId);
    if (!party) {
      return { success: false, error: `Trusted party not found: ${partyId}` };
    }

    const actions = this.store.getActionsForParty(partyId);
    const config = this.store.getConfig();
    const allParties = this.store.getAllParties();

    // For simulation, only the requesting party is "activated"
    const allPartiesActivated = allParties.length <= 1;

    const results: TestRunActionResult[] = [];
    let wouldExecute = 0;
    let blockedByConsensus = 0;

    for (const action of actions) {
      const blocked = action.requiresDeletionConsensus
        && config.requireAllPartiesForDeletion
        && !allPartiesActivated;

      if (blocked) {
        blockedByConsensus++;
      } else {
        wouldExecute++;
      }

      results.push({
        actionId: action.id,
        label: action.label,
        category: action.category,
        wouldExecute: !blocked,
        blockedByConsensus: blocked,
      });
    }

    // Audit-log the simulation
    this.auditLogger.log({
      id: `sim_${nanoid()}`,
      action: 'inheritance.test-run',
      payload: {
        partyId,
        partyName: party.name,
        totalActions: actions.length,
        wouldExecute,
        blockedByConsensus,
      },
      estimatedTimeSavedSeconds: 0,
    });

    return {
      partyId,
      partyName: party.name,
      simulatedAt: new Date().toISOString(),
      actions: results,
      totalActions: actions.length,
      wouldExecute,
      blockedByConsensus,
    };
  }
}
