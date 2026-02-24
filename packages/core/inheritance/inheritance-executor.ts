// Inheritance Executor — Sequential action execution with Witness attestations.
// Supports step-by-step confirmation mode and deletion consensus checks.
// CRITICAL: No networking imports. IPC dispatch is via injected client.

import type { InheritanceConfigStore } from './inheritance-config-store.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type {
  InheritanceAction,
  Activation,
  ActionExecutionResult,
  ExecutionResult,
} from './types.js';
import { disableInheritanceMode } from './inheritance-mode-guard.js';
import { nanoid } from 'nanoid';

// ─── Dependency interfaces (injected, not imported from gateway) ────────────

export interface AuditLogger {
  log(entry: {
    id: string;
    action: string;
    payload: Record<string, unknown>;
    estimatedTimeSavedSeconds: number;
  }): void;
}

export interface WitnessGeneratorLike {
  generate(auditEntryId: string, actionSummary: string, autonomyTier?: string): {
    success: boolean;
    attestation?: { id: string };
    error?: string;
  };
}

export interface IpcDispatcher {
  dispatch(actionType: string, payload: Record<string, unknown>): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export interface InheritanceExecutorDeps {
  store: InheritanceConfigStore;
  premiumGate: PremiumGate;
  auditLogger: AuditLogger;
  witnessGenerator: WitnessGeneratorLike;
  ipcDispatcher?: IpcDispatcher;
}

/**
 * Executes pre-authorized inheritance actions sequentially.
 * Each action: audit trail BEFORE execution, Witness attestation after, IPC dispatch.
 */
export class InheritanceExecutor {
  private store: InheritanceConfigStore;
  private premiumGate: PremiumGate;
  private auditLogger: AuditLogger;
  private witnessGenerator: WitnessGeneratorLike;
  private ipcDispatcher?: IpcDispatcher;

  constructor(deps: InheritanceExecutorDeps) {
    this.store = deps.store;
    this.premiumGate = deps.premiumGate;
    this.auditLogger = deps.auditLogger;
    this.witnessGenerator = deps.witnessGenerator;
    this.ipcDispatcher = deps.ipcDispatcher;
  }

  /**
   * Execute all actions for an activation, or the next action in step-by-step mode.
   */
  async execute(activationId: string): Promise<ExecutionResult> {
    if (!this.premiumGate.isPremium()) {
      return this.errorResult(activationId, '', 'Inheritance Protocol requires Digital Representative tier');
    }

    const activation = this.store.getActivation(activationId);
    if (!activation) {
      return this.errorResult(activationId, '', 'Activation not found');
    }

    if (activation.state !== 'executing' && activation.state !== 'paused_for_confirmation') {
      return this.errorResult(activationId, activation.partyId, `Activation is in "${activation.state}" state`);
    }

    // Transition to executing
    this.store.updateActivation(activationId, { state: 'executing' });

    const actions = this.store.getActionsForParty(activation.partyId);
    const allParties = this.store.getAllParties();
    const activeActivations = this.store.getActiveActivations();
    const activatedPartyIds = new Set(activeActivations.map((a) => a.partyId));
    const config = this.store.getConfig();
    const allPartiesActivated = allParties.every((p) => activatedPartyIds.has(p.id));

    const results: ActionExecutionResult[] = [];
    let completed = activation.actionsCompleted;

    for (let i = completed; i < actions.length; i++) {
      const action = actions[i]!;

      // Update current action
      this.store.updateActivation(activationId, { currentActionId: action.id });

      // Check deletion consensus
      if (action.requiresDeletionConsensus && config.requireAllPartiesForDeletion && !allPartiesActivated) {
        results.push({
          actionId: action.id,
          label: action.label,
          success: false,
          skipped: true,
          error: 'Requires all parties to have activated for deletion consensus',
        });
        completed++;
        continue;
      }

      // Execute the action
      const result = await this.executeAction(action, activation);
      results.push(result);
      completed++;

      // Update progress
      this.store.updateActivation(activationId, { actionsCompleted: completed });

      // In step-by-step mode, pause after each action
      if (activation.requiresStepConfirmation && i < actions.length - 1) {
        this.store.updateActivation(activationId, { state: 'paused_for_confirmation' });
        break;
      }
    }

    // Check if all actions are done
    const isComplete = completed >= actions.length;
    if (isComplete) {
      this.store.updateActivation(activationId, {
        state: 'completed',
        completedAt: new Date().toISOString(),
      });

      // Check if all activations are complete before disabling guard
      const remainingActive = this.store.getActiveActivations();
      if (remainingActive.length === 0) {
        disableInheritanceMode();
      }
    }

    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const failedCount = results.filter((r) => !r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    return {
      activationId,
      partyId: activation.partyId,
      actionsExecuted: results,
      totalActions: actions.length,
      successCount,
      failedCount,
      skippedCount,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Confirm the current step and continue execution (for step-by-step mode).
   */
  async confirmStep(activationId: string): Promise<ExecutionResult> {
    const activation = this.store.getActivation(activationId);
    if (!activation) {
      return this.errorResult(activationId, '', 'Activation not found');
    }

    if (activation.state !== 'paused_for_confirmation') {
      return this.errorResult(activationId, activation.partyId, 'Activation is not paused for confirmation');
    }

    // Resume execution
    this.store.updateActivation(activationId, { state: 'executing' });
    return this.execute(activationId);
  }

  private async executeAction(action: InheritanceAction, activation: Activation): Promise<ActionExecutionResult> {
    const auditEntryId = `inh_audit_${nanoid()}`;

    // Log to audit trail BEFORE execution
    this.auditLogger.log({
      id: auditEntryId,
      action: `inheritance.${action.category}.${action.actionType}`,
      payload: { actionId: action.id, label: action.label, partyId: activation.partyId },
      estimatedTimeSavedSeconds: 300, // 5 minutes saved per action
    });

    // Dispatch via IPC if available
    let dispatchSuccess = true;
    let dispatchError: string | undefined;
    if (this.ipcDispatcher && (action.category === 'notification' || action.category === 'account-action')) {
      try {
        const result = await this.ipcDispatcher.dispatch(action.actionType, action.payload);
        if (!result.success) {
          dispatchSuccess = false;
          dispatchError = result.error ?? 'IPC dispatch failed';
        }
      } catch (err) {
        dispatchSuccess = false;
        dispatchError = err instanceof Error ? err.message : 'IPC dispatch threw';
      }
    }

    // Generate Witness attestation
    let witnessId: string | undefined;
    const witnessResult = this.witnessGenerator.generate(
      auditEntryId,
      `Inheritance action: ${action.label}`,
      'alter_ego',
    );
    if (witnessResult.success && witnessResult.attestation) {
      witnessId = witnessResult.attestation.id;
    }

    return {
      actionId: action.id,
      label: action.label,
      success: dispatchSuccess,
      skipped: false,
      error: dispatchError,
      witnessId,
      auditEntryId,
    };
  }

  private errorResult(activationId: string, partyId: string, error: string): ExecutionResult {
    return {
      activationId,
      partyId,
      actionsExecuted: [],
      totalActions: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      completedAt: new Date().toISOString(),
    };
  }
}
