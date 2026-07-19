import { IsoDateTime } from '@semblance/protocol';
import { z } from 'zod';
import {
  createProvenanceRecord,
  isInferredDerivation,
  parseProvenanceRecord,
  type CreateProvenanceRecordInput,
  type ProvenanceRecordV1,
} from './provenance-record.js';
import { hasNonEmptySourceRefs, mergeSourceRefs, type SourceRefV1 } from './source-ref.js';

export const AssertionStatus = z.enum(['proposed', 'confirmed', 'corrected', 'superseded']);
export type AssertionStatus = z.infer<typeof AssertionStatus>;

export const VaultAssertionV1 = z
  .object({
    schemaVersion: z.literal(1),
    assertionId: z.string().min(1),
    status: AssertionStatus,
    subject: z.string().min(1),
    predicate: z.string().min(1),
    object: z.string().min(1),
    provenance: z.unknown(),
    priorAssertionId: z.string().min(1).optional(),
    userConfirmation: z.boolean().optional(),
    createdAt: IsoDateTime,
    lastConfirmedAt: IsoDateTime.optional(),
  })
  .strict();
export type VaultAssertionV1 = Omit<z.infer<typeof VaultAssertionV1>, 'provenance'> & {
  provenance: ProvenanceRecordV1;
};

export type VaultProvenanceErrorCode =
  | 'MISSING_PROVENANCE_FIELD'
  | 'INVALID_ASSERTION_STATUS'
  | 'INFERRED_CONFIRMATION_BLOCKED'
  | 'MISSING_PRIOR_ASSERTION';

export class VaultProvenanceError extends Error {
  readonly code: VaultProvenanceErrorCode;

  constructor(code: VaultProvenanceErrorCode, message: string) {
    super(message);
    this.name = 'VaultProvenanceError';
    this.code = code;
  }
}

export interface ProposeAssertionInput {
  assertionId: string;
  subject: string;
  predicate: string;
  object: string;
  provenance: CreateProvenanceRecordInput;
  createdAt: string;
}

export interface ConfirmAssertionInput {
  confirmedAt: string;
  sourceRefs?: SourceRefV1[];
  userConfirmation?: boolean;
}

export interface CorrectAssertionInput {
  assertionId: string;
  subject: string;
  predicate: string;
  object: string;
  provenance: CreateProvenanceRecordInput;
  createdAt: string;
}

export interface SupersedeAssertionInput {
  assertionId: string;
  subject: string;
  predicate: string;
  object: string;
  provenance: CreateProvenanceRecordInput;
  createdAt: string;
}

export function parseAssertion(value: unknown): VaultAssertionV1 {
  const parsed = VaultAssertionV1.parse(value);
  return {
    ...parsed,
    provenance: parseProvenanceRecord(parsed.provenance),
  };
}

export function proposeAssertion(input: ProposeAssertionInput): VaultAssertionV1 {
  let provenance: ProvenanceRecordV1;
  try {
    provenance = createProvenanceRecord(input.provenance);
  } catch (error) {
    throw new VaultProvenanceError(
      'MISSING_PROVENANCE_FIELD',
      error instanceof Error ? error.message : 'provenance record is incomplete',
    );
  }

  return parseAssertion({
    schemaVersion: 1,
    assertionId: input.assertionId,
    status: 'proposed',
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    provenance,
    createdAt: input.createdAt,
  });
}

export function confirmAssertion(
  assertion: VaultAssertionV1,
  input: ConfirmAssertionInput,
): VaultAssertionV1 {
  if (assertion.status !== 'proposed') {
    throw new VaultProvenanceError(
      'INVALID_ASSERTION_STATUS',
      `only proposed assertions can be confirmed; current status is ${assertion.status}`,
    );
  }

  const mergedSourceRefs = mergeSourceRefs(assertion.provenance.sourceRefs, input.sourceRefs);
  const hasSources = hasNonEmptySourceRefs(mergedSourceRefs);
  const userConfirmed = input.userConfirmation === true;

  if (isInferredDerivation(assertion.provenance) && !hasSources && !userConfirmed) {
    throw new VaultProvenanceError(
      'INFERRED_CONFIRMATION_BLOCKED',
      'inferred assertions cannot become confirmed without source refs or explicit userConfirmation: true',
    );
  }

  const provenance: ProvenanceRecordV1 = {
    ...assertion.provenance,
    sourceRefs: mergedSourceRefs,
  };

  return parseAssertion({
    ...assertion,
    status: 'confirmed',
    provenance,
    userConfirmation: userConfirmed ? true : assertion.userConfirmation,
    lastConfirmedAt: input.confirmedAt,
  });
}

export function correctAssertion(
  priorAssertion: VaultAssertionV1,
  input: CorrectAssertionInput,
): VaultAssertionV1 {
  if (priorAssertion.status === 'superseded') {
    throw new VaultProvenanceError(
      'INVALID_ASSERTION_STATUS',
      'superseded assertions cannot be corrected',
    );
  }

  const provenance = createProvenanceRecord({
    ...input.provenance,
    derivationMethod: 'corrected',
  });

  const corrected = parseAssertion({
    schemaVersion: 1,
    assertionId: input.assertionId,
    status: 'corrected',
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    provenance,
    priorAssertionId: priorAssertion.assertionId,
    createdAt: input.createdAt,
  });

  return corrected;
}

export function supersedeAssertion(
  priorAssertion: VaultAssertionV1,
  input: SupersedeAssertionInput,
): { priorAssertion: VaultAssertionV1; replacementAssertion: VaultAssertionV1 } {
  if (priorAssertion.status === 'superseded') {
    throw new VaultProvenanceError(
      'INVALID_ASSERTION_STATUS',
      'assertion is already superseded',
    );
  }

  const provenance = createProvenanceRecord({
    ...input.provenance,
    derivationMethod: 'superseded',
  });

  const replacementAssertion = parseAssertion({
    schemaVersion: 1,
    assertionId: input.assertionId,
    status: 'confirmed',
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    provenance,
    priorAssertionId: priorAssertion.assertionId,
    createdAt: input.createdAt,
    lastConfirmedAt: input.createdAt,
  });

  const supersededPrior = parseAssertion({
    ...priorAssertion,
    status: 'superseded',
  });

  return {
    priorAssertion: supersededPrior,
    replacementAssertion,
  };
}

export function assertCorrectionChain(current: VaultAssertionV1, prior: VaultAssertionV1): void {
  if (current.priorAssertionId !== prior.assertionId) {
    throw new VaultProvenanceError(
      'MISSING_PRIOR_ASSERTION',
      `expected priorAssertionId ${prior.assertionId}, received ${current.priorAssertionId ?? 'none'}`,
    );
  }
}
