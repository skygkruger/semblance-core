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
  it('classifies a valid legacy JWT as reservation_only (seat #1)', () => {
    const result = verifyFoundingToken(VALID_TOKEN_SEAT_1);
    expect(result).toEqual({ valid: true, kind: 'reservation_only', seat: 1 });
    expect(result).not.toHaveProperty('tier');
    expect(result).not.toHaveProperty('payload');
  });

  it('classifies a valid founding member token (seat #500) as reservation_only', () => {
    const result = verifyFoundingToken(VALID_TOKEN_SEAT_500);
    expect(result).toEqual({ valid: true, kind: 'reservation_only', seat: 500 });
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
    expect(result.kind).toBe('reservation_only');
    expect(result.seat).toBeNull();
  });

  it('rejects a token with wrong tier', () => {
    const result = verifyFoundingToken(WRONG_TIER_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("'founding'");
    expect(result.seat).toBeNull();
  });

  it('rejects a token with missing seat field', () => {
    const result = verifyFoundingToken(MISSING_SEAT_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('seat');
    expect(result.seat).toBeNull();
  });

  it('rejects a token with seat number out of range (>500)', () => {
    const result = verifyFoundingToken(SEAT_OUT_OF_RANGE_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of range');
    expect(result.seat).toBeNull();
  });

  it('rejects an invalid format string (not a JWT)', () => {
    const result = verifyFoundingToken(INVALID_FORMAT_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3 dot-separated segments');
    expect(result.seat).toBeNull();
  });

  it('rejects an empty string', () => {
    const result = verifyFoundingToken(EMPTY_TOKEN);
    expect(result.valid).toBe(false);
    expect(result.seat).toBeNull();
  });
});

describe('verifyFoundingToken: Reservation import deep links', () => {
  it('accepts a reservation import URL and extracts the token', () => {
    const url = `semblance://reservation/import?token=${VALID_TOKEN_SEAT_1}`;
    const result = verifyFoundingToken(url);
    expect(result.valid).toBe(true);
    expect(result.seat).toBe(1);
  });

  it('rejects the paid activation route for reservation tokens', () => {
    const url = `  semblance://activate?tier=founding&token=${VALID_TOKEN_SEAT_500}  `;
    const result = verifyFoundingToken(url);
    expect(result.valid).toBe(false);
  });

  it('rejects ambiguous reservation import parameters', () => {
    const url = `semblance://reservation/import?token=${VALID_TOKEN_SEAT_1}&key=sem_paid`;
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
