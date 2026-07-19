import { z } from 'zod';
import { IsoDateTime, SchemaVersion } from './common.js';

export const ProofReceiptType = z.enum([
  'consent',
  'vault_access',
  'disclosure',
  'action',
  'attestation',
  'usage',
  'sync',
  'deletion',
]);
export type ProofReceiptType = z.infer<typeof ProofReceiptType>;

export const ProofReceiptV1 = z
  .object({
    schemaVersion: SchemaVersion,
    receiptId: z.string().min(1),
    receiptType: ProofReceiptType,
    principalId: z.string().min(1),
    deviceId: z.string().min(1),
    workflowId: z.string().min(1),
    capabilityId: z.string().nullable(),
    occurredAt: IsoDateTime,
    evidenceHash: z.string().min(1),
    priorReceiptHash: z.string().nullable(),
    policyEpoch: z.number().int().nonnegative(),
    signature: z.string().min(1),
  })
  .strict();
export type ProofReceiptV1 = z.infer<typeof ProofReceiptV1>;

export const PROOF_RECEIPT_V1_SCHEMA_ID = 'proof-receipt-v1';
