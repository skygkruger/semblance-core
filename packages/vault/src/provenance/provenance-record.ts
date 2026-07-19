import { SensitivityLevel, type SensitivityLevel as SensitivityLevelType } from '@semblance/protocol';
import { z } from 'zod';
import {
  assertSourceRefsPresent,
  hasNonEmptySourceRefs,
  parseSourceRefs,
  type SourceRefV1,
} from './source-ref.js';

export const DerivationMethod = z.enum([
  'direct_extraction',
  'user_stated',
  'inferred',
  'corrected',
  'superseded',
]);
export type DerivationMethod = z.infer<typeof DerivationMethod>;

export const RetentionPolicyV1 = z
  .object({
    schemaVersion: z.literal(1),
    policyId: z.string().min(1),
    retainUntil: z.string().datetime(),
  })
  .strict();
export type RetentionPolicyV1 = z.infer<typeof RetentionPolicyV1>;

export const ProvenanceRecordV1 = z
  .object({
    schemaVersion: z.literal(1),
    sourceRefs: z.array(z.unknown()),
    derivationMethod: DerivationMethod,
    confidence: z.number().min(0).max(1),
    sensitivity: SensitivityLevel,
    retention: RetentionPolicyV1,
  })
  .strict();
export type ProvenanceRecordV1 = Omit<z.infer<typeof ProvenanceRecordV1>, 'sourceRefs'> & {
  sourceRefs: SourceRefV1[];
};

export interface CreateProvenanceRecordInput {
  sourceRefs: SourceRefV1[];
  derivationMethod: DerivationMethod;
  confidence: number;
  sensitivity: SensitivityLevelType;
  retention: RetentionPolicyV1;
}

export function parseRetentionPolicy(value: unknown): RetentionPolicyV1 {
  return RetentionPolicyV1.parse(value);
}

export function createRetentionPolicy(input: {
  policyId: string;
  retainUntil: string;
}): RetentionPolicyV1 {
  return parseRetentionPolicy({
    schemaVersion: 1,
    policyId: input.policyId,
    retainUntil: input.retainUntil,
  });
}

export function parseProvenanceRecord(value: unknown): ProvenanceRecordV1 {
  const parsed = ProvenanceRecordV1.parse(value);
  return {
    ...parsed,
    sourceRefs: parseSourceRefs(parsed.sourceRefs),
  };
}

export function createProvenanceRecord(input: CreateProvenanceRecordInput): ProvenanceRecordV1 {
  assertSourceRefsPresent(input.sourceRefs);

  const record = parseProvenanceRecord({
    schemaVersion: 1,
    sourceRefs: input.sourceRefs,
    derivationMethod: input.derivationMethod,
    confidence: input.confidence,
    sensitivity: input.sensitivity,
    retention: input.retention,
  });

  validateRequiredProvenanceFields(record);
  return record;
}

export function validateRequiredProvenanceFields(record: ProvenanceRecordV1): void {
  assertSourceRefsPresent(record.sourceRefs);

  if (record.derivationMethod === undefined) {
    throw new Error('derivationMethod is required');
  }

  if (record.confidence === undefined || Number.isNaN(record.confidence)) {
    throw new Error('confidence is required');
  }

  if (record.sensitivity === undefined) {
    throw new Error('sensitivity is required');
  }

  if (record.retention === undefined) {
    throw new Error('retention is required');
  }

  if (record.derivationMethod !== 'inferred' && !hasNonEmptySourceRefs(record.sourceRefs)) {
    throw new Error('non-inferred assertions require at least one source ref');
  }
}

export function isInferredDerivation(record: ProvenanceRecordV1): boolean {
  return record.derivationMethod === 'inferred';
}
