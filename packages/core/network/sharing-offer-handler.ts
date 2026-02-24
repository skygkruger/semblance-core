// Sharing Offer Handler — Create, receive, accept, reject offers.
// Uses AttestationSigner for HMAC-SHA256 signing of offer payloads.
// Premium gate on offer creation (free users can see peers but not create offers).
// CRITICAL: No networking imports. Offers are delivered via IPC to Gateway.

import { nanoid } from 'nanoid';
import type { AttestationSigner } from '../attestation/attestation-signer.js';
import type { AttestationVerifier } from '../attestation/attestation-verifier.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { NetworkConfigStore } from './network-config-store.js';
import type {
  SharingOffer,
  SharingAcceptance,
  SharingCategory,
  SharingRelationship,
} from './types.js';
import { OFFER_EXPIRY_MS } from './types.js';

export interface OfferHandlerDeps {
  configStore: NetworkConfigStore;
  signer: AttestationSigner;
  verifier: AttestationVerifier;
  premiumGate: PremiumGate;
  localDeviceId: string;
  localDisplayName: string;
  signingKey: Buffer;
}

/**
 * SharingOfferHandler — Manages the offer→accept flow for Semblance Network.
 *
 * Offer flow:
 * 1. Local user creates offer (premium-gated) → signed with AttestationSigner
 * 2. Offer delivered to peer via IPC → Gateway
 * 3. Peer validates signature → accepts/rejects
 * 4. Acceptance returned → relationship created
 *
 * Bilateral asymmetric consent: The acceptor can choose different categories
 * than what was offered. Neither side can force sharing.
 */
export class SharingOfferHandler {
  private configStore: NetworkConfigStore;
  private signer: AttestationSigner;
  private verifier: AttestationVerifier;
  private premiumGate: PremiumGate;
  private localDeviceId: string;
  private localDisplayName: string;
  private signingKey: Buffer;

  constructor(deps: OfferHandlerDeps) {
    this.configStore = deps.configStore;
    this.signer = deps.signer;
    this.verifier = deps.verifier;
    this.premiumGate = deps.premiumGate;
    this.localDeviceId = deps.localDeviceId;
    this.localDisplayName = deps.localDisplayName;
    this.signingKey = deps.signingKey;
  }

  /**
   * Create a new sharing offer to send to a peer.
   * Premium-gated: requires Digital Representative tier.
   *
   * @returns The signed offer, or null if not premium.
   */
  createOffer(params: {
    offeredCategories: SharingCategory[];
    requestedCategories: SharingCategory[];
  }): SharingOffer | null {
    if (!this.premiumGate.isPremium()) {
      return null;
    }

    const id = `so_${nanoid()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OFFER_EXPIRY_MS).toISOString();

    // Generate initiator key half for session key establishment
    const initiatorKeyHalf = nanoid(32);

    // Sign the offer payload
    const payload = {
      type: 'semblance-network-offer',
      id,
      fromDeviceId: this.localDeviceId,
      fromDisplayName: this.localDisplayName,
      offeredCategories: params.offeredCategories,
      requestedCategories: params.requestedCategories,
      initiatorKeyHalf,
      expiresAt,
      createdAt: now.toISOString(),
    };

    const signed = this.signer.sign(payload);

    const offer: SharingOffer = {
      id,
      fromDeviceId: this.localDeviceId,
      fromDisplayName: this.localDisplayName,
      offeredCategories: params.offeredCategories,
      requestedCategories: params.requestedCategories,
      expiresAt,
      signature: signed.proof.proofValue,
      status: 'pending',
      initiatorKeyHalf,
      createdAt: now.toISOString(),
    };

    // Store locally
    this.configStore.createOffer(offer);

    return offer;
  }

  /**
   * Validate an incoming offer's signature.
   * Returns true if the signature is valid.
   */
  validateOffer(offer: SharingOffer, senderKey: Buffer): boolean {
    const payload = {
      type: 'semblance-network-offer',
      id: offer.id,
      fromDeviceId: offer.fromDeviceId,
      fromDisplayName: offer.fromDisplayName,
      offeredCategories: offer.offeredCategories,
      requestedCategories: offer.requestedCategories,
      initiatorKeyHalf: offer.initiatorKeyHalf,
      expiresAt: offer.expiresAt,
      createdAt: offer.createdAt,
    };

    const attestation = {
      payload,
      proof: {
        type: 'HmacSha256Signature',
        created: offer.createdAt,
        verificationMethod: `device:${offer.fromDeviceId}`,
        proofPurpose: 'assertionMethod',
        proofValue: offer.signature,
      },
    };

    const result = this.verifier.verify(attestation, senderKey);
    return result.valid;
  }

  /**
   * Receive an incoming offer from a peer.
   * Validates signature and stores if valid.
   */
  receiveOffer(offer: SharingOffer, senderKey: Buffer): boolean {
    // Check expiration
    if (new Date(offer.expiresAt).getTime() <= Date.now()) {
      return false;
    }

    // Validate signature
    if (!this.validateOffer(offer, senderKey)) {
      return false;
    }

    // Store the offer
    this.configStore.createOffer(offer);
    return true;
  }

  /**
   * Accept a pending offer. Creates the relationship.
   * The acceptor independently chooses which categories to accept and reciprocate.
   * Bilateral asymmetry: acceptor's reciprocal categories can differ from what was requested.
   */
  acceptOffer(offerId: string, params: {
    acceptedInboundCategories: SharingCategory[];
    reciprocalOutboundCategories: SharingCategory[];
  }): { acceptance: SharingAcceptance; relationship: SharingRelationship } | null {
    const offer = this.configStore.getOffer(offerId);
    if (!offer || offer.status !== 'pending') return null;

    // Check not expired
    if (new Date(offer.expiresAt).getTime() <= Date.now()) {
      this.configStore.updateOfferStatus(offerId, 'expired');
      return null;
    }

    // Generate acceptor key half
    const acceptorKeyHalf = nanoid(32);

    // Sign acceptance
    const acceptancePayload = {
      type: 'semblance-network-acceptance',
      offerId,
      acceptorDeviceId: this.localDeviceId,
      acceptorDisplayName: this.localDisplayName,
      acceptedInboundCategories: params.acceptedInboundCategories,
      reciprocalOutboundCategories: params.reciprocalOutboundCategories,
      acceptorKeyHalf,
      createdAt: new Date().toISOString(),
    };

    const signed = this.signer.sign(acceptancePayload);

    const acceptance: SharingAcceptance = {
      offerId,
      acceptorDeviceId: this.localDeviceId,
      acceptorDisplayName: this.localDisplayName,
      acceptedInboundCategories: params.acceptedInboundCategories,
      reciprocalOutboundCategories: params.reciprocalOutboundCategories,
      acceptorKeyHalf,
      signature: signed.proof.proofValue,
      createdAt: new Date().toISOString(),
    };

    // Update offer status
    this.configStore.updateOfferStatus(offerId, 'accepted');

    // Create the sharing relationship
    // From the acceptor's perspective:
    // - outbound = what I share with the offerer (reciprocal)
    // - inbound = what I accept from the offerer
    const relationship = this.configStore.createRelationship({
      localUserId: this.localDeviceId,
      peerId: offer.fromDeviceId,
      peerDisplayName: offer.fromDisplayName,
      initiatedBy: 'peer',
      outboundCategories: params.reciprocalOutboundCategories,
      inboundCategories: params.acceptedInboundCategories,
      consentAttestationJson: JSON.stringify(signed),
    });

    return { acceptance, relationship };
  }

  /**
   * Reject a pending offer.
   */
  rejectOffer(offerId: string): boolean {
    const offer = this.configStore.getOffer(offerId);
    if (!offer || offer.status !== 'pending') return false;

    this.configStore.updateOfferStatus(offerId, 'rejected');
    return true;
  }

  /**
   * Process an incoming acceptance of an offer we created.
   * Creates the relationship from the offerer's perspective.
   */
  processAcceptance(acceptance: SharingAcceptance): SharingRelationship | null {
    const offer = this.configStore.getOffer(acceptance.offerId);
    if (!offer || offer.status !== 'pending') return null;

    // Update offer status
    this.configStore.updateOfferStatus(acceptance.offerId, 'accepted');

    // Create relationship from offerer's perspective:
    // - outbound = what I offered to share
    // - inbound = what the acceptor reciprocates
    const relationship = this.configStore.createRelationship({
      localUserId: this.localDeviceId,
      peerId: acceptance.acceptorDeviceId,
      peerDisplayName: acceptance.acceptorDisplayName,
      initiatedBy: 'local',
      outboundCategories: offer.offeredCategories,
      inboundCategories: acceptance.reciprocalOutboundCategories,
      consentAttestationJson: JSON.stringify({ acceptance }),
    });

    return relationship;
  }
}
