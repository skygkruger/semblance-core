// Activation Handler — Decrypts activation package, verifies, enters Inheritance Mode.
// Handles time-lock, cancel, and state transitions.
// Supports v1 (SHA-256) and v2 (Argon2id) key derivation.
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

import { getPlatform } from '../platform/index.js';
import { deriveKey, deriveKeyLegacy } from '../crypto/key-derivation.js';
import type { InheritanceConfigStore } from './inheritance-config-store.js';
import type { ActivationPackage, Activation } from './types.js';
import { enableInheritanceMode, disableInheritanceMode } from './inheritance-mode-guard.js';
import { nanoid } from 'nanoid';

export interface ActivationHandlerDeps {
  store: InheritanceConfigStore;
}

export interface ActivationResult {
  success: boolean;
  activationId?: string;
  state?: string;
  timeLockExpiresAt?: string;
  error?: string;
}

/**
 * Handles the activation flow: decrypt package -> verify -> enter Inheritance Mode -> time-lock.
 */
export class ActivationHandler {
  private store: InheritanceConfigStore;

  constructor(deps: ActivationHandlerDeps) {
    this.store = deps.store;
  }

  /**
   * Activate the Inheritance Protocol with a package and passphrase.
   * 1. Derive key (Argon2id for v2, SHA-256 for v1)
   * 2. Decrypt package with derived key
   * 3. Verify party exists
   * 4. Enable Inheritance Mode guard
   * 5. Create activation record in time_locked state
   */
  async activate(pkg: ActivationPackage, passphrase: string): Promise<ActivationResult> {
    const p = getPlatform();

    // Derive key based on header version/kdf
    let keyHex: string;
    if (pkg.header.kdf === 'argon2id' && pkg.header.salt) {
      const salt = Buffer.from(pkg.header.salt, 'hex');
      const kdfResult = await deriveKey(passphrase, salt);
      keyHex = kdfResult.keyHex;
    } else {
      // v1 legacy: sha256(passphrase)
      keyHex = deriveKeyLegacy(passphrase);
    }

    // Decrypt the payload
    let decryptedData: Record<string, unknown>;
    try {
      const decryptedStr = await p.crypto.decrypt(pkg.payload, keyHex);
      decryptedData = JSON.parse(decryptedStr) as Record<string, unknown>;
    } catch {
      return { success: false, error: 'Invalid passphrase or corrupted package' };
    }

    // Verify the party exists
    const partyId = pkg.header.partyId;
    const party = this.store.getParty(partyId);
    if (!party) {
      return { success: false, error: `Trusted party not found: ${partyId}` };
    }

    // Verify passphrase matches stored hash (always sha256 comparison)
    const passphraseHash = p.crypto.sha256(passphrase);
    if (passphraseHash !== party.passphraseHash) {
      return { success: false, error: 'Passphrase does not match party record' };
    }

    // Get config for time-lock
    const config = this.store.getConfig();
    const actions = decryptedData.actions as Array<Record<string, unknown>> | undefined;
    const actionsTotal = actions?.length ?? 0;

    // Calculate time-lock expiry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.timeLockHours * 60 * 60 * 1000);

    // Create activation record
    const activationId = `act_${nanoid()}`;
    const activation: Activation = {
      id: activationId,
      partyId,
      state: 'time_locked',
      activatedAt: now.toISOString(),
      timeLockExpiresAt: expiresAt.toISOString(),
      actionsTotal,
      actionsCompleted: 0,
      currentActionId: null,
      requiresStepConfirmation: config.requireStepConfirmation,
      cancelledAt: null,
      completedAt: null,
    };

    this.store.insertActivation(activation);

    // Enable Inheritance Mode guard
    enableInheritanceMode();

    return {
      success: true,
      activationId,
      state: 'time_locked',
      timeLockExpiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Cancel an activation. Only allowed during 'time_locked' state.
   */
  cancel(activationId: string): { success: boolean; error?: string } {
    const activation = this.store.getActivation(activationId);
    if (!activation) {
      return { success: false, error: 'Activation not found' };
    }

    if (activation.state !== 'time_locked') {
      return {
        success: false,
        error: `Cannot cancel activation in "${activation.state}" state — only time_locked activations can be cancelled`,
      };
    }

    this.store.updateActivation(activationId, {
      state: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });

    // Check if there are other active activations before disabling guard
    const active = this.store.getActiveActivations();
    if (active.length === 0) {
      disableInheritanceMode();
    }

    return { success: true };
  }

  /**
   * Check if the time-lock on an activation has expired.
   */
  isTimeLockExpired(activationId: string): boolean {
    const activation = this.store.getActivation(activationId);
    if (!activation || activation.state !== 'time_locked') return false;
    if (!activation.timeLockExpiresAt) return true;
    return new Date(activation.timeLockExpiresAt).getTime() <= Date.now();
  }

  /**
   * Advance an activation past the time-lock into executing state.
   * Only callable when time-lock has expired.
   */
  advancePastTimeLock(activationId: string): { success: boolean; error?: string } {
    const activation = this.store.getActivation(activationId);
    if (!activation) {
      return { success: false, error: 'Activation not found' };
    }

    if (activation.state !== 'time_locked') {
      return { success: false, error: `Activation is in "${activation.state}" state, not time_locked` };
    }

    if (!this.isTimeLockExpired(activationId)) {
      return { success: false, error: 'Time-lock has not expired yet' };
    }

    const nextState = activation.requiresStepConfirmation ? 'paused_for_confirmation' : 'executing';
    this.store.updateActivation(activationId, { state: nextState });

    return { success: true };
  }

  /**
   * Get an activation by ID.
   */
  getActivation(activationId: string): Activation | null {
    return this.store.getActivation(activationId);
  }
}
