import { z } from 'zod';
import {
  CapabilityResource,
  ExecutionDestination,
  IsoDateTime,
  ProcessType,
  SchemaVersion,
  SensitivityLevel,
} from './common.js';

export const CapabilityDataScopeV1 = z
  .object({
    domains: z.array(z.string()),
    accounts: z.array(z.string()),
    sources: z.array(z.string()),
    recordClasses: z.array(z.string()),
  })
  .strict();
export type CapabilityDataScopeV1 = z.infer<typeof CapabilityDataScopeV1>;

export const CapabilityConstraintsV1 = z
  .object({
    accounts: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    destinations: z.array(z.string()).optional(),
    sensitivityCeiling: SensitivityLevel.optional(),
    resultLimit: z.number().int().positive().optional(),
    valueLimitMinorUnits: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type CapabilityConstraintsV1 = z.infer<typeof CapabilityConstraintsV1>;

export const CapabilityGrantV1 = z
  .object({
    schemaVersion: SchemaVersion,
    capabilityId: z.string().min(1),
    principalId: z.string().min(1),
    deviceId: z.string().min(1),
    processId: z.string().min(1),
    sessionId: z.string().min(1),
    processType: ProcessType,
    extensionInstanceId: z.string().nullable(),
    workflowId: z.string().min(1),
    consentReceiptId: z.string().nullable(),
    executionDestination: ExecutionDestination,
    resource: CapabilityResource,
    operations: z.array(z.string()).min(1),
    purpose: z.string().min(1),
    dataScope: CapabilityDataScopeV1.optional(),
    constraints: CapabilityConstraintsV1,
    issuedAt: IsoDateTime,
    expiresAt: IsoDateTime,
    policyEpoch: z.number().int().nonnegative(),
    revocationEpoch: z.number().int().nonnegative(),
    auditCorrelationId: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type CapabilityGrantV1 = z.infer<typeof CapabilityGrantV1>;

export const CAPABILITY_GRANT_V1_SCHEMA_ID = 'capability-grant-v1';
