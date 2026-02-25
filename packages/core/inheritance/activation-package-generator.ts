// Activation Package Generator — Creates AES-256-GCM encrypted .inheritance packages.
// v2: Argon2id key derivation (64MB, 3 iterations) with salt in header.
// Header is unencrypted (for identification). Payload encrypted with party's passphrase-derived key.
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

import { getPlatform } from '../platform/index.js';
import { deriveKey } from '../crypto/key-derivation.js';
import type { InheritanceConfigStore } from './inheritance-config-store.js';
import type { ActivationPackage, ActivationPackageHeader } from './types.js';

const PACKAGE_VERSION = 2;

export interface ActivationPackageGeneratorDeps {
  store: InheritanceConfigStore;
}

/**
 * Generates encrypted activation packages for trusted parties.
 */
export class ActivationPackageGenerator {
  private store: InheritanceConfigStore;

  constructor(deps: ActivationPackageGeneratorDeps) {
    this.store = deps.store;
  }

  /**
   * Generate an encrypted activation package for a trusted party.
   * v2: Argon2id key derivation with random salt.
   * Passphrase verification still uses sha256(passphrase) === party.passphraseHash.
   */
  async generate(partyId: string, passphrase: string): Promise<ActivationPackage> {
    const party = this.store.getParty(partyId);
    if (!party) {
      throw new Error(`Trusted party not found: ${partyId}`);
    }

    const p = getPlatform();

    // Verify passphrase matches stored hash (sha256 comparison — unchanged)
    const passphraseHash = p.crypto.sha256(passphrase);
    if (passphraseHash !== party.passphraseHash) {
      throw new Error('Passphrase does not match');
    }

    // Collect party config + action list
    const actions = this.store.getActionsForParty(partyId);
    const templates = this.store.getTemplatesForParty(partyId);
    const config = this.store.getConfig();

    const payloadData = {
      party: {
        id: party.id,
        name: party.name,
        email: party.email,
        relationship: party.relationship,
      },
      actions: actions.map((a) => ({
        id: a.id,
        category: a.category,
        sequenceOrder: a.sequenceOrder,
        actionType: a.actionType,
        payload: a.payload,
        label: a.label,
        requiresDeletionConsensus: a.requiresDeletionConsensus,
      })),
      templates: templates.map((t) => ({
        id: t.id,
        actionId: t.actionId,
        recipientName: t.recipientName,
        recipientEmail: t.recipientEmail,
        subject: t.subject,
        body: t.body,
      })),
      config: {
        timeLockHours: config.timeLockHours,
        requireStepConfirmation: config.requireStepConfirmation,
        requireAllPartiesForDeletion: config.requireAllPartiesForDeletion,
      },
    };

    // Derive encryption key with Argon2id
    const kdfResult = await deriveKey(passphrase);
    const encrypted = await p.crypto.encrypt(JSON.stringify(payloadData), kdfResult.keyHex);

    const header: ActivationPackageHeader = {
      partyId: party.id,
      version: PACKAGE_VERSION,
      createdAt: new Date().toISOString(),
      kdf: 'argon2id',
      salt: kdfResult.saltHex,
    };

    return { header, payload: encrypted };
  }

  /**
   * Serialize an activation package to a JSON string for storage/transfer.
   */
  serializePackage(pkg: ActivationPackage): string {
    return JSON.stringify(pkg);
  }

  /**
   * Deserialize a JSON string back into an ActivationPackage.
   */
  deserializePackage(data: string): ActivationPackage {
    const parsed = JSON.parse(data) as ActivationPackage;
    if (!parsed.header || !parsed.payload) {
      throw new Error('Invalid activation package format');
    }
    return parsed;
  }
}
