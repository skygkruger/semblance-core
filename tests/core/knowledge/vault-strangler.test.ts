import { afterEach, describe, expect, it } from 'vitest';
import { isVaultCanonicalReadEnabled } from '../../../packages/core/knowledge/vault-strangler.js';

describe('vault strangler flag', () => {
  const original = process.env.SEMBLANCE_VAULT_CANONICAL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SEMBLANCE_VAULT_CANONICAL;
    } else {
      process.env.SEMBLANCE_VAULT_CANONICAL = original;
    }
  });

  it('returns false by default', () => {
    delete process.env.SEMBLANCE_VAULT_CANONICAL;
    expect(isVaultCanonicalReadEnabled()).toBe(false);
  });

  it('returns true when SEMBLANCE_VAULT_CANONICAL=1', () => {
    expect(isVaultCanonicalReadEnabled({ SEMBLANCE_VAULT_CANONICAL: '1' })).toBe(true);
  });

  it('returns false for other values', () => {
    expect(isVaultCanonicalReadEnabled({ SEMBLANCE_VAULT_CANONICAL: 'true' })).toBe(false);
    expect(isVaultCanonicalReadEnabled({ SEMBLANCE_VAULT_CANONICAL: '0' })).toBe(false);
  });
});
