/**
 * Step 27 — TrustedPartyManager + ActivationPackageGenerator tests (Commit 2).
 * Tests passphrase hashing, cascade removal, package encryption, wrong passphrase, roundtrip.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import { TrustedPartyManager } from '@semblance/core/inheritance/trusted-party-manager';
import { ActivationPackageGenerator } from '@semblance/core/inheritance/activation-package-generator';
import { getPlatform } from '@semblance/core/platform/index';
import { nanoid } from 'nanoid';

let db: InstanceType<typeof Database>;
let store: InheritanceConfigStore;
let manager: TrustedPartyManager;
let generator: ActivationPackageGenerator;

const TEST_PASSPHRASE = 'my-secret-passphrase-2024';

beforeEach(() => {
  db = new Database(':memory:');
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
  manager = new TrustedPartyManager({ store });
  generator = new ActivationPackageGenerator({ store });
});

afterEach(() => {
  db.close();
});

describe('TrustedPartyManager + ActivationPackageGenerator (Step 27)', () => {
  it('hashes passphrase on addParty — plaintext never stored', () => {
    const party = manager.addParty({
      name: 'Alice',
      email: 'alice@example.com',
      relationship: 'spouse',
      passphrase: TEST_PASSPHRASE,
    });

    // passphraseHash should be sha256(passphrase), not the plaintext
    expect(party.passphraseHash).not.toBe(TEST_PASSPHRASE);
    expect(party.passphraseHash).toHaveLength(64); // sha256 hex length

    const p = getPlatform();
    const expected = p.crypto.sha256(TEST_PASSPHRASE);
    expect(party.passphraseHash).toBe(expected);
  });

  it('cascade removes actions when party is removed', () => {
    const party = manager.addParty({
      name: 'Bob',
      email: 'bob@example.com',
      relationship: 'sibling',
      passphrase: TEST_PASSPHRASE,
    });

    store.insertAction({
      id: `ia_${nanoid()}`,
      partyId: party.id,
      category: 'notification',
      sequenceOrder: 1,
      actionType: 'email.send',
      payload: { to: ['someone@example.com'] },
      label: 'Notify someone',
      requiresDeletionConsensus: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(store.getActionsForParty(party.id)).toHaveLength(1);

    manager.removeParty(party.id);
    expect(store.getActionsForParty(party.id)).toHaveLength(0);
  });

  it('generates encrypted activation package', async () => {
    const party = manager.addParty({
      name: 'Carol',
      email: 'carol@example.com',
      relationship: 'friend',
      passphrase: TEST_PASSPHRASE,
    });

    store.insertAction({
      id: `ia_${nanoid()}`,
      partyId: party.id,
      category: 'notification',
      sequenceOrder: 1,
      actionType: 'email.send',
      payload: { to: ['recipient@example.com'] },
      label: 'Send notification',
      requiresDeletionConsensus: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pkg = await generator.generate(party.id, TEST_PASSPHRASE);

    // Header is unencrypted
    expect(pkg.header.partyId).toBe(party.id);
    expect(pkg.header.version).toBe(1);
    expect(pkg.header.createdAt).toBeTruthy();

    // Payload is encrypted
    expect(pkg.payload.ciphertext).toBeTruthy();
    expect(pkg.payload.iv).toBeTruthy();
    expect(pkg.payload.tag).toBeTruthy();
  });

  it('rejects package generation with wrong passphrase', async () => {
    const party = manager.addParty({
      name: 'Dave',
      email: 'dave@example.com',
      relationship: 'colleague',
      passphrase: TEST_PASSPHRASE,
    });

    await expect(generator.generate(party.id, 'wrong-passphrase'))
      .rejects.toThrow('Passphrase does not match');
  });

  it('roundtrip serialize/deserialize preserves package', async () => {
    const party = manager.addParty({
      name: 'Eve',
      email: 'eve@example.com',
      relationship: 'attorney',
      passphrase: TEST_PASSPHRASE,
    });

    const pkg = await generator.generate(party.id, TEST_PASSPHRASE);
    const serialized = generator.serializePackage(pkg);
    const deserialized = generator.deserializePackage(serialized);

    expect(deserialized.header.partyId).toBe(party.id);
    expect(deserialized.payload.ciphertext).toBe(pkg.payload.ciphertext);
    expect(deserialized.payload.iv).toBe(pkg.payload.iv);
    expect(deserialized.payload.tag).toBe(pkg.payload.tag);
  });
});
