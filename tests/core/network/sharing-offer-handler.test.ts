/**
 * Step 28 — SharingOfferHandler tests.
 * Covers signed offers, validation, acceptance, rejection, premium gate, asymmetric consent.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import { SharingOfferHandler } from '@semblance/core/network/sharing-offer-handler';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { AttestationVerifier } from '@semblance/core/attestation/attestation-verifier';
import { PremiumGate } from '@semblance/core/premium/premium-gate';

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeLicenseKey(tier: string): string {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier, exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  return `sem_header.${encoded}.signature`;
}

const SIGNING_KEY = Buffer.from('test-signing-key-32-bytes-long!!');

let db: InstanceType<typeof Database>;
let configStore: NetworkConfigStore;
let premiumGate: PremiumGate;

beforeEach(() => {
  db = new Database(':memory:');
  configStore = new NetworkConfigStore(db as unknown as DatabaseHandle);
  premiumGate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

function createHandler(opts?: { deviceId?: string; displayName?: string }) {
  return new SharingOfferHandler({
    configStore,
    signer: new AttestationSigner({
      signingKey: SIGNING_KEY,
      deviceIdentity: { id: opts?.deviceId ?? 'device-a', platform: 'desktop' },
    }),
    verifier: new AttestationVerifier(),
    premiumGate,
    localDeviceId: opts?.deviceId ?? 'device-a',
    localDisplayName: opts?.displayName ?? 'Alice',
    signingKey: SIGNING_KEY,
  });
}

describe('SharingOfferHandler (Step 28)', () => {
  it('creates a signed offer with valid signature', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));
    const handler = createHandler();

    const offer = handler.createOffer({
      offeredCategories: ['calendar-availability', 'communication-style'],
      requestedCategories: ['project-context'],
    });

    expect(offer).not.toBeNull();
    expect(offer!.id).toMatch(/^so_/);
    expect(offer!.signature).toBeTruthy();
    expect(offer!.offeredCategories).toEqual(['calendar-availability', 'communication-style']);
    expect(offer!.requestedCategories).toEqual(['project-context']);
    expect(offer!.initiatorKeyHalf).toBeTruthy();
  });

  it('validates a valid offer signature', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));
    const handler = createHandler();

    const offer = handler.createOffer({
      offeredCategories: ['calendar-availability'],
      requestedCategories: [],
    })!;

    const isValid = handler.validateOffer(offer, SIGNING_KEY);
    expect(isValid).toBe(true);
  });

  it('rejects an offer with invalid signature', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));
    const handler = createHandler();

    const offer = handler.createOffer({
      offeredCategories: ['calendar-availability'],
      requestedCategories: [],
    })!;

    // Tamper with signature
    offer.signature = 'tampered-signature-value';
    const isValid = handler.validateOffer(offer, SIGNING_KEY);
    expect(isValid).toBe(false);

    // Wrong key
    const wrongKey = Buffer.from('wrong-key-that-is-32-bytes-long!');
    const offer2 = handler.createOffer({
      offeredCategories: ['communication-style'],
      requestedCategories: [],
    })!;
    const isValid2 = handler.validateOffer(offer2, wrongKey);
    expect(isValid2).toBe(false);
  });

  it('acceptance creates a relationship with bilateral asymmetry', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));

    // Offerer creates offer
    const offerer = createHandler({ deviceId: 'device-a', displayName: 'Alice' });
    const offer = offerer.createOffer({
      offeredCategories: ['calendar-availability', 'communication-style'],
      requestedCategories: ['project-context', 'topic-expertise'],
    })!;

    // Acceptor receives and accepts — but only accepts 1 inbound and reciprocates 1 outbound
    const acceptor = createHandler({ deviceId: 'device-b', displayName: 'Bob' });
    const result = acceptor.acceptOffer(offer.id, {
      acceptedInboundCategories: ['calendar-availability'], // only accept calendar, not style
      reciprocalOutboundCategories: ['project-context'], // only share project, not topic
    });

    expect(result).not.toBeNull();
    expect(result!.relationship.status).toBe('active');
    // From acceptor's perspective:
    expect(result!.relationship.outboundCategories).toEqual(['project-context']);
    expect(result!.relationship.inboundCategories).toEqual(['calendar-availability']);
    expect(result!.relationship.initiatedBy).toBe('peer');
    expect(result!.acceptance.acceptorKeyHalf).toBeTruthy();
  });

  it('rejects expired offers', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));
    const handler = createHandler();

    const offer = handler.createOffer({
      offeredCategories: ['calendar-availability'],
      requestedCategories: [],
    })!;

    // Manually expire the offer
    configStore.updateOfferStatus(offer.id, 'pending');
    db.prepare('UPDATE sharing_offers SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), offer.id);

    const result = handler.acceptOffer(offer.id, {
      acceptedInboundCategories: ['calendar-availability'],
      reciprocalOutboundCategories: [],
    });

    expect(result).toBeNull();
  });

  it('premium gate blocks free users from creating offers', () => {
    // No license activated — free tier
    const handler = createHandler();
    const offer = handler.createOffer({
      offeredCategories: ['calendar-availability'],
      requestedCategories: [],
    });
    expect(offer).toBeNull();
  });

  it('processes acceptance from offerer perspective', () => {
    premiumGate.activateLicense(makeLicenseKey('digital-representative'));
    const handler = createHandler({ deviceId: 'device-a', displayName: 'Alice' });

    const offer = handler.createOffer({
      offeredCategories: ['calendar-availability'],
      requestedCategories: ['project-context'],
    })!;

    const relationship = handler.processAcceptance({
      offerId: offer.id,
      acceptorDeviceId: 'device-b',
      acceptorDisplayName: 'Bob',
      acceptedInboundCategories: ['calendar-availability'],
      reciprocalOutboundCategories: ['project-context'],
      acceptorKeyHalf: 'half-key-from-bob',
      signature: 'sig',
      createdAt: new Date().toISOString(),
    });

    expect(relationship).not.toBeNull();
    expect(relationship!.peerId).toBe('device-b');
    expect(relationship!.outboundCategories).toEqual(['calendar-availability']);
    expect(relationship!.inboundCategories).toEqual(['project-context']);
    expect(relationship!.initiatedBy).toBe('local');
  });
});
