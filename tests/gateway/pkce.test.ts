/**
 * PKCE Tests — Verifies code_verifier generation and code_challenge derivation.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
} from '../../packages/gateway/services/base-pkce-adapter.js';

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('produces a string of valid base64url characters', () => {
      const verifier = generateCodeVerifier();
      // base64url: A-Z, a-z, 0-9, -, _
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('produces a string between 43 and 128 characters (RFC 7636)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('generates unique verifiers on successive calls', () => {
      const a = generateCodeVerifier();
      const b = generateCodeVerifier();
      expect(a).not.toBe(b);
    });
  });

  describe('deriveCodeChallenge', () => {
    it('produces a base64url-encoded SHA-256 hash without padding', () => {
      const challenge = deriveCodeChallenge('test-verifier');
      // base64url without padding
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(challenge).not.toContain('=');
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
    });

    it('matches manual SHA-256 base64url computation', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expected = createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const challenge = deriveCodeChallenge(verifier);
      expect(challenge).toBe(expected);
    });

    it('produces deterministic output for same input', () => {
      const verifier = generateCodeVerifier();
      const a = deriveCodeChallenge(verifier);
      const b = deriveCodeChallenge(verifier);
      expect(a).toBe(b);
    });
  });
});
