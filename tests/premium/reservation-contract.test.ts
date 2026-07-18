import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { createPrivateKey, sign } from 'node:crypto';
import schema from '../../release/contracts/reservation-token-v0.schema.json';
import fixture from '../../release/contracts/legacy-waitlist-token.fixture.json';
import { verifyFoundingToken } from '../../packages/core/premium/founding-token.js';
import { TEST_PRIVATE_KEY_PEM } from '../fixtures/founding-tokens.js';

function signedToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(
    null,
    Buffer.from(`${header}.${body}`),
    createPrivateKey(TEST_PRIVATE_KEY_PEM),
  ).toString('base64url');
  return `${header}.${body}.${signature}`;
}

describe('cross-repository legacy waitlist reservation contract', () => {
  it('validates the exact waitlist payload fixture', () => {
    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
  });

  it('maps the legacy type-based payload only to reservation_only', () => {
    const result = verifyFoundingToken(signedToken(fixture));
    expect(result).toEqual({ valid: true, kind: 'reservation_only', seat: 1 });
    expect(result).not.toHaveProperty('tier');
  });

  it('rejects a schema-mismatched signed production-shaped token without a tier result', () => {
    const result = verifyFoundingToken(signedToken({
      sub: fixture.sub,
      type: 'paid',
      seat: fixture.seat,
      iat: fixture.iat,
    }));
    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty('tier');
  });
});
