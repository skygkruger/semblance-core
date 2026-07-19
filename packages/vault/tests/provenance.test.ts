import { describe, expect, it } from 'vitest';
import {
  assertCorrectionChain,
  confirmAssertion,
  correctAssertion,
  createProvenanceRecord,
  createRetentionPolicy,
  createSourceRef,
  proposeAssertion,
  VaultProvenanceError,
} from '../src/index.js';

const RETENTION = createRetentionPolicy({
  policyId: 'retention-default-365d',
  retainUntil: '2027-07-18T00:00:00.000Z',
});

const EMAIL_SOURCE = createSourceRef({
  sourceId: 'email-msg-001',
  sourceType: 'email',
  uri: 'email://gmail/INBOX/abc123',
  ingestedAt: '2026-07-18T11:59:00.000Z',
});

function createInferredProvenanceInput(overrides: Partial<Parameters<typeof createProvenanceRecord>[0]> = {}) {
  return {
    sourceRefs: [],
    derivationMethod: 'inferred' as const,
    confidence: 0.62,
    sensitivity: 'personal' as const,
    retention: RETENTION,
    ...overrides,
  };
}

describe('vault provenance assertions', () => {
  it('requires source refs, derivation, confidence, sensitivity, and retention', () => {
    expect(() =>
      createProvenanceRecord({
        derivationMethod: 'direct_extraction',
        confidence: 0.95,
        sensitivity: 'personal',
        retention: RETENTION,
        sourceRefs: [EMAIL_SOURCE],
      }),
    ).not.toThrow();

    expect(() =>
      createProvenanceRecord({
        derivationMethod: 'direct_extraction',
        confidence: 0.95,
        sensitivity: 'personal',
        retention: RETENTION,
        sourceRefs: undefined as unknown as [],
      }),
    ).toThrow(/sourceRefs are required/);

    expect(() =>
      createProvenanceRecord({
        derivationMethod: undefined as unknown as 'direct_extraction',
        confidence: 0.95,
        sensitivity: 'personal',
        retention: RETENTION,
        sourceRefs: [EMAIL_SOURCE],
      }),
    ).toThrow();

    expect(() =>
      createProvenanceRecord({
        derivationMethod: 'direct_extraction',
        confidence: undefined as unknown as number,
        sensitivity: 'personal',
        retention: RETENTION,
        sourceRefs: [EMAIL_SOURCE],
      }),
    ).toThrow();

    expect(() =>
      createProvenanceRecord({
        derivationMethod: 'direct_extraction',
        confidence: 0.95,
        sensitivity: undefined as unknown as 'personal',
        retention: RETENTION,
        sourceRefs: [EMAIL_SOURCE],
      }),
    ).toThrow();

    expect(() =>
      createProvenanceRecord({
        derivationMethod: 'direct_extraction',
        confidence: 0.95,
        sensitivity: 'personal',
        retention: undefined as unknown as typeof RETENTION,
        sourceRefs: [EMAIL_SOURCE],
      }),
    ).toThrow();
  });

  it('rejects inferred to confirmed without source refs or user confirmation', () => {
    const proposed = proposeAssertion({
      assertionId: 'assertion-inferred-001',
      subject: 'user:sky',
      predicate: 'prefers',
      object: 'morning brief at 7am',
      provenance: createInferredProvenanceInput(),
      createdAt: '2026-07-18T12:00:00.000Z',
    });

    expect(proposed.status).toBe('proposed');
    expect(proposed.provenance.derivationMethod).toBe('inferred');

    expect(() =>
      confirmAssertion(proposed, {
        confirmedAt: '2026-07-18T12:05:00.000Z',
      }),
    ).toThrow(VaultProvenanceError);

    expect(() =>
      confirmAssertion(proposed, {
        confirmedAt: '2026-07-18T12:05:00.000Z',
      }),
    ).toThrow(/inferred assertions cannot become confirmed/);
  });

  it('accepts inferred to confirmed with user confirmation', () => {
    const proposed = proposeAssertion({
      assertionId: 'assertion-inferred-002',
      subject: 'user:sky',
      predicate: 'prefers',
      object: 'morning brief at 7am',
      provenance: createInferredProvenanceInput(),
      createdAt: '2026-07-18T12:00:00.000Z',
    });

    const confirmed = confirmAssertion(proposed, {
      confirmedAt: '2026-07-18T12:05:00.000Z',
      userConfirmation: true,
    });

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.userConfirmation).toBe(true);
    expect(confirmed.lastConfirmedAt).toBe('2026-07-18T12:05:00.000Z');
  });

  it('links correction chain through priorAssertionId', () => {
    const original = proposeAssertion({
      assertionId: 'assertion-original-001',
      subject: 'user:sky',
      predicate: 'works_at',
      object: 'Veridian Synthetics',
      provenance: {
        sourceRefs: [EMAIL_SOURCE],
        derivationMethod: 'direct_extraction',
        confidence: 0.91,
        sensitivity: 'personal',
        retention: RETENTION,
      },
      createdAt: '2026-07-18T12:00:00.000Z',
    });

    const confirmed = confirmAssertion(original, {
      confirmedAt: '2026-07-18T12:01:00.000Z',
    });

    const corrected = correctAssertion(confirmed, {
      assertionId: 'assertion-corrected-001',
      subject: 'user:sky',
      predicate: 'works_at',
      object: 'Semblance Labs',
      provenance: {
        sourceRefs: [EMAIL_SOURCE],
        derivationMethod: 'user_stated',
        confidence: 1,
        sensitivity: 'personal',
        retention: RETENTION,
      },
      createdAt: '2026-07-18T12:10:00.000Z',
    });

    expect(corrected.priorAssertionId).toBe(confirmed.assertionId);
    expect(corrected.provenance.derivationMethod).toBe('corrected');
    expect(() => assertCorrectionChain(corrected, confirmed)).not.toThrow();
  });
});
