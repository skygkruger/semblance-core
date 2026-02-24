// Trusted Party Manager — Party lifecycle: add, remove, update with passphrase hashing.
// Passphrase is NEVER stored — only sha256(passphrase) persisted as passphraseHash.
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

import { getPlatform } from '../platform/index.js';
import type { InheritanceConfigStore } from './inheritance-config-store.js';
import type { TrustedParty } from './types.js';
import { nanoid } from 'nanoid';

export interface TrustedPartyManagerDeps {
  store: InheritanceConfigStore;
}

/**
 * Manages trusted party lifecycle with passphrase hashing.
 */
export class TrustedPartyManager {
  private store: InheritanceConfigStore;

  constructor(deps: TrustedPartyManagerDeps) {
    this.store = deps.store;
  }

  /**
   * Add a new trusted party. Passphrase is hashed and never stored in plaintext.
   */
  addParty(input: {
    name: string;
    email: string;
    relationship: string;
    passphrase: string;
  }): TrustedParty {
    const p = getPlatform();
    const passphraseHash = p.crypto.sha256(input.passphrase);
    const now = new Date().toISOString();

    const party: TrustedParty = {
      id: `tp_${nanoid()}`,
      name: input.name,
      email: input.email,
      relationship: input.relationship,
      passphraseHash,
      createdAt: now,
      updatedAt: now,
    };

    this.store.insertParty(party);
    return party;
  }

  /**
   * Remove a trusted party and all associated actions/templates (via cascade).
   */
  removeParty(partyId: string): boolean {
    return this.store.removeParty(partyId);
  }

  /**
   * Update party metadata (name, email, relationship). Does NOT change passphrase.
   */
  updateParty(partyId: string, updates: Partial<Pick<TrustedParty, 'name' | 'email' | 'relationship'>>): TrustedParty | null {
    return this.store.updateParty(partyId, updates);
  }

  /**
   * Get a party by ID.
   */
  getParty(partyId: string): TrustedParty | null {
    return this.store.getParty(partyId);
  }

  /**
   * Get all trusted parties.
   */
  getAllParties(): TrustedParty[] {
    return this.store.getAllParties();
  }

  /**
   * Verify a passphrase against a party's stored hash.
   */
  verifyPassphrase(partyId: string, passphrase: string): boolean {
    const party = this.store.getParty(partyId);
    if (!party) return false;
    const p = getPlatform();
    return party.passphraseHash === p.crypto.sha256(passphrase);
  }
}
