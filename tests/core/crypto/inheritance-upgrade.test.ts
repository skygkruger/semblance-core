// Inheritance Protocol Crypto Upgrade Tests — Argon2id packages, v1 backward compat.

import { describe, it, expect, beforeAll } from 'vitest';
import { ActivationPackageGenerator } from '@semblance/core/inheritance/activation-package-generator.js';
import { ActivationHandler } from '@semblance/core/inheritance/activation-handler.js';
import { setPlatform, getPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import type { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store.js';
import type { ActivationPackage } from '@semblance/core/inheritance/types.js';

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

function createMockStore(): InheritanceConfigStore {
  const p = getPlatform();
  const passphrase = 'test-passphrase-123';
  const passphraseHash = p.crypto.sha256(passphrase);
  const activations: Record<string, unknown> = {};

  return {
    getParty: (id: string) => id === 'party-001' ? {
      id: 'party-001',
      name: 'Alice',
      email: 'alice@example.com',
      relationship: 'spouse',
      passphraseHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } : null,
    getActionsForParty: () => [{
      id: 'act-001',
      partyId: 'party-001',
      category: 'notification' as const,
      sequenceOrder: 1,
      actionType: 'email.send',
      payload: { to: 'bob@example.com' },
      label: 'Notify Bob',
      requiresDeletionConsensus: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    getTemplatesForParty: () => [],
    getConfig: () => ({
      timeLockHours: 72,
      requireStepConfirmation: false,
      requireAllPartiesForDeletion: true,
      lastReviewedAt: null,
    }),
    insertActivation: (a: unknown) => { activations[(a as { id: string }).id] = a; },
    getActivation: (id: string) => (activations[id] as ReturnType<InheritanceConfigStore['getActivation']>) ?? null,
    updateActivation: () => {},
    getActiveActivations: () => [],
  } as unknown as InheritanceConfigStore;
}

describe('Inheritance Protocol v2 — Argon2id', () => {
  it('generates v2 package with kdf and salt in header', async () => {
    const store = createMockStore();
    const gen = new ActivationPackageGenerator({ store });
    const pkg = await gen.generate('party-001', 'test-passphrase-123');
    expect(pkg.header.version).toBe(2);
    expect(pkg.header.kdf).toBe('argon2id');
    expect(pkg.header.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(pkg.header.partyId).toBe('party-001');
  });

  it('v2 package encrypt+decrypt roundtrip via handler', async () => {
    const store = createMockStore();
    const gen = new ActivationPackageGenerator({ store });
    const handler = new ActivationHandler({ store });
    const pkg = await gen.generate('party-001', 'test-passphrase-123');
    const result = await handler.activate(pkg, 'test-passphrase-123');
    expect(result.success).toBe(true);
    expect(result.state).toBe('time_locked');
    expect(result.activationId).toBeTruthy();
  });

  it('v2 package activation fails with wrong passphrase', async () => {
    const store = createMockStore();
    const gen = new ActivationPackageGenerator({ store });
    const handler = new ActivationHandler({ store });
    const pkg = await gen.generate('party-001', 'test-passphrase-123');
    const result = await handler.activate(pkg, 'wrong-passphrase');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid passphrase');
  });
});

describe('Inheritance Protocol v1 — Backward Compatibility', () => {
  it('handler decrypts v1 package (no kdf field) using legacy SHA-256', async () => {
    const p = getPlatform();
    const store = createMockStore();
    const handler = new ActivationHandler({ store });
    const passphrase = 'test-passphrase-123';
    const keyHex = p.crypto.sha256(passphrase);

    // Simulate v1 package: encrypted with sha256(passphrase)
    const payloadData = {
      party: { id: 'party-001', name: 'Alice' },
      actions: [{ id: 'act-001', label: 'Notify' }],
    };
    const encrypted = await p.crypto.encrypt(JSON.stringify(payloadData), keyHex);
    const v1Pkg: ActivationPackage = {
      header: {
        partyId: 'party-001',
        version: 1,
        createdAt: new Date().toISOString(),
      },
      payload: encrypted,
    };
    const result = await handler.activate(v1Pkg, passphrase);
    expect(result.success).toBe(true);
    expect(result.state).toBe('time_locked');
  });

  it('serialization roundtrip preserves v2 header fields', () => {
    const gen = new ActivationPackageGenerator({ store: createMockStore() });
    const pkg: ActivationPackage = {
      header: {
        partyId: 'party-001',
        version: 2,
        createdAt: new Date().toISOString(),
        kdf: 'argon2id',
        salt: 'abcdef1234567890abcdef1234567890',
      },
      payload: { ciphertext: 'ct', iv: 'iv', tag: 'tag' },
    };
    const serialized = gen.serializePackage(pkg);
    const deserialized = gen.deserializePackage(serialized);
    expect(deserialized.header.kdf).toBe('argon2id');
    expect(deserialized.header.salt).toBe('abcdef1234567890abcdef1234567890');
  });
});
