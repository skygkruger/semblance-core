// Revocation Handler — Revoke sharing categories or full relationships.
// Revocation = HARD DELETE of cached context on the peer side.
// Both sides maintain audit trail entries for all revocations.
// CRITICAL: No networking imports. Revocations delivered via IPC to Gateway.

import { nanoid } from 'nanoid';
import type { AttestationSigner } from '../attestation/attestation-signer.js';
import type { NetworkConfigStore } from './network-config-store.js';
import { SharedContextStore } from './shared-context-store.js';
import type { RevocationPayload, SharingCategory, SharingRelationship } from './types.js';

export interface RevocationHandlerDeps {
  configStore: NetworkConfigStore;
  sharedContextStore: SharedContextStore;
  signer: AttestationSigner;
  localDeviceId: string;
}

export interface RevocationEvent {
  type: 'category-revoked' | 'relationship-revoked';
  relationshipId: string;
  revokedCategory: SharingCategory | null;
  peerId: string;
  timestamp: string;
}

/**
 * RevocationHandler — Manages sharing revocation.
 *
 * Two types of revocation:
 * 1. Category revocation: remove one category from a relationship
 * 2. Full revocation: revoke the entire relationship
 *
 * When revocation is processed on the receiving side:
 * - Cached context is HARD DELETED (not soft-deleted)
 * - The relationship is updated or marked as revoked
 */
export class RevocationHandler {
  private configStore: NetworkConfigStore;
  private sharedContextStore: SharedContextStore;
  private signer: AttestationSigner;
  private localDeviceId: string;
  private events: RevocationEvent[] = [];

  constructor(deps: RevocationHandlerDeps) {
    this.configStore = deps.configStore;
    this.sharedContextStore = deps.sharedContextStore;
    this.signer = deps.signer;
    this.localDeviceId = deps.localDeviceId;
  }

  /**
   * Revoke a specific category from a relationship.
   * Returns the signed revocation payload to send to the peer.
   */
  revokeCategory(relationshipId: string, category: SharingCategory): RevocationPayload | null {
    const rel = this.configStore.getRelationship(relationshipId);
    if (!rel || rel.status === 'revoked') return null;

    // Remove category from outbound
    const updated = rel.outboundCategories.filter(c => c !== category);
    this.configStore.updateOutboundCategories(relationshipId, updated);

    // Sign the revocation
    const payload = this.createSignedRevocation(relationshipId, category);

    this.events.push({
      type: 'category-revoked',
      relationshipId,
      revokedCategory: category,
      peerId: rel.peerId,
      timestamp: new Date().toISOString(),
    });

    return payload;
  }

  /**
   * Revoke an entire relationship — all categories, full stop.
   * Returns the signed revocation payload to send to the peer.
   */
  revokeRelationship(relationshipId: string): RevocationPayload | null {
    const rel = this.configStore.getRelationship(relationshipId);
    if (!rel || rel.status === 'revoked') return null;

    // Mark relationship as revoked
    this.configStore.updateRelationshipStatus(relationshipId, 'revoked');

    // Delete all cached context from this peer
    this.sharedContextStore.deleteContextFromPeer(rel.peerId);

    // Sign the revocation (null category = full revocation)
    const payload = this.createSignedRevocation(relationshipId, null);

    this.events.push({
      type: 'relationship-revoked',
      relationshipId,
      revokedCategory: null,
      peerId: rel.peerId,
      timestamp: new Date().toISOString(),
    });

    return payload;
  }

  /**
   * Process an inbound revocation from a peer.
   * HARD DELETES the relevant cached context.
   */
  processInboundRevocation(revocation: RevocationPayload): boolean {
    // Find the relationship with this peer
    const rel = this.configStore.getRelationshipByPeer(revocation.fromDeviceId);
    if (!rel) return false;

    if (revocation.revokedCategory) {
      // Category revocation: delete that category's cached context
      this.sharedContextStore.deleteContextCategory(revocation.fromDeviceId, revocation.revokedCategory);

      // Remove from inbound categories
      const updated = rel.inboundCategories.filter(c => c !== revocation.revokedCategory);
      this.configStore.updateInboundCategories(rel.id, updated);
    } else {
      // Full revocation: delete ALL cached context from this peer
      this.sharedContextStore.deleteContextFromPeer(revocation.fromDeviceId);

      // Mark relationship as revoked
      this.configStore.updateRelationshipStatus(rel.id, 'revoked');
    }

    this.events.push({
      type: revocation.revokedCategory ? 'category-revoked' : 'relationship-revoked',
      relationshipId: rel.id,
      revokedCategory: revocation.revokedCategory,
      peerId: revocation.fromDeviceId,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Check if a relationship is revoked (blocks sync).
   */
  isRevoked(relationshipId: string): boolean {
    const rel = this.configStore.getRelationship(relationshipId);
    return !rel || rel.status === 'revoked';
  }

  /**
   * Get the audit trail of revocation events.
   */
  getRevocationEvents(): RevocationEvent[] {
    return [...this.events];
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private createSignedRevocation(
    relationshipId: string,
    category: SharingCategory | null,
  ): RevocationPayload {
    const now = new Date().toISOString();

    const payload = {
      type: 'semblance-network-revocation',
      relationshipId,
      fromDeviceId: this.localDeviceId,
      revokedCategory: category,
      createdAt: now,
    };

    const signed = this.signer.sign(payload);

    return {
      relationshipId,
      fromDeviceId: this.localDeviceId,
      revokedCategory: category,
      signature: signed.proof.proofValue,
      createdAt: now,
    };
  }
}
