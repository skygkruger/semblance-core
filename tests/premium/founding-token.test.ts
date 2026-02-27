/**
 * Founding Member Token Verification Tests
 *
 * Tests the offline Ed25519 JWT verification in founding-token.ts.
 * Uses pre-signed fixture tokens generated with the test keypair.
 */

import { describe, it, expect } from 'vitest';
import { verifyFoundingToken } from '../../packages/core/premium/founding-token.js';
import {
  VALID_TOKEN_SEAT_1,
  VALID_TOKEN_SEAT_500,
  WRONG_TIER_TOKEN,
  MISSING_SEAT_TOKEN,
  SEAT_OUT_OF_RANGE_TOKEN,
  TAMPERED_SIGNATURE_TOKEN,
  INVALID_FORMAT_TOKEN,
  EMPTY_TOKEN,
} from '../fixtures/founding-tokens.js';

describe('verifyFoundingToken: Valid tokens', () => {
  it('accepts a valid founding member token (seat #1)', () => {
    const result = verifyFoundingToken(VALID_TOKEN_SEAT_1);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.tier).toBe('founding');
    expect(result.payload!.seat).toBe(1);
    expect(result.payload!.sub).toBeTruthy();
    expect(result.payload!.iat).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid founding member token (seat #500)', () => {
    const result = verifyFoundingToken(VALID_TOKEN_SEAT_500);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.tier).toBe('founding');
    expect(result.payload!.seat).toBe(500);
    expect(result.error).toBeUndefined();
  });

  it('never throws — always returns structured result', () => {
    // No input should cause an exception
    expect(() => verifyFoundingToken('')).not.toThrow();
    expect(() => verifyFoundingToken('random-junk')).not.toThrow();
    expect(() => verifyFoundingToken('a.b')).not.toThrow();
    expect(() => verifyFoundingToken('a.b.c')).not.toThrow();
    expect(() => verifyFoundingToken(VALID_TOKEN_SEAT_1)).not.toThrow();
  });
});

describe('verifyFoundingToken: Invalid tokens', () => {
  it('rejects a token with tampered signature', () => {
    const result = verifyFoundingToken(TAMPERED_SIGNATURE_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
    expect(result.payload).toBeUndefined();
  });

  it('rejects a token with wrong tier', () => {
    const result = verifyFoundingToken(WRONG_TIER_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("'founding'");
    expect(result.payload).toBeUndefined();
  });

  it('rejects a token with missing seat field', () => {
    const result = verifyFoundingToken(MISSING_SEAT_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('seat');
    expect(result.payload).toBeUndefined();
  });

  it('rejects a token with seat number out of range (>500)', () => {
    const result = verifyFoundingToken(SEAT_OUT_OF_RANGE_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of range');
    expect(result.payload).toBeUndefined();
  });

  it('rejects an invalid format string (not a JWT)', () => {
    const result = verifyFoundingToken(INVALID_FORMAT_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3 dot-separated segments');
    expect(result.payload).toBeUndefined();
  });

  it('rejects an empty string', () => {
    const result = verifyFoundingToken(EMPTY_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.payload).toBeUndefined();
  });
});

describe('verifyFoundingToken: Deep link URL stripping', () => {
  it('accepts a full deep link URL and extracts the token', () => {
    const url = `semblance://activate?tier=founding&token=${VALID_TOKEN_SEAT_1}`;
    const result = verifyFoundingToken(url);
    expect(result.valid).toBe(true);
    expect(result.payload!.seat).toBe(1);
  });

  it('handles deep link URL with extra whitespace', () => {
    const url = `  semblance://activate?tier=founding&token=${VALID_TOKEN_SEAT_500}  `;
    const result = verifyFoundingToken(url);
    expect(result.valid).toBe(true);
    expect(result.payload!.seat).toBe(500);
  });

  it('rejects a deep link URL without a token parameter', () => {
    const url = 'semblance://activate?tier=founding';
    const result = verifyFoundingToken(url);
    expect(result.valid).toBe(false);
  });
});

describe('verifyFoundingToken: No network imports', () => {
  it('founding-token.ts imports only node:crypto — no networking', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const content = readFileSync(
      join(__dirname, '..', '..', 'packages', 'core', 'premium', 'founding-token.ts'),
      'utf-8',
    );

    // Must import node:crypto (expected)
    expect(content).toContain("from 'node:crypto'");

    // Must NOT import any networking
    const forbiddenImports = [
      'node:http', 'node:https', 'node:net', 'node:dgram', 'node:dns', 'node:tls',
      'fetch', 'axios', 'got', 'node-fetch', 'undici', 'superagent',
      'socket.io', 'ws', 'XMLHttpRequest', 'WebSocket',
    ];
    for (const forbidden of forbiddenImports) {
      expect(content).not.toContain(`'${forbidden}'`);
    }
  });
});
