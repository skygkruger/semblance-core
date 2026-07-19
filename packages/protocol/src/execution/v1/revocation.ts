import { z } from 'zod';
import { ExecutionProtocolVersionField, IsoDateTime } from './common.js';

export const ExecutionRevocationTargetType = z.enum(['session', 'device', 'node']);
export type ExecutionRevocationTargetType = z.infer<typeof ExecutionRevocationTargetType>;

/** Revocation notice for sessions, devices, or the node itself. */
export const ExecutionRevocationV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    revocationId: z.string().min(1),
    targetType: ExecutionRevocationTargetType,
    targetId: z.string().min(1),
    reason: z.string().min(1),
    revokedAt: IsoDateTime,
    revokedBy: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type ExecutionRevocationV1 = z.infer<typeof ExecutionRevocationV1>;

export const EXECUTION_REVOCATION_V1_SCHEMA_ID = 'execution-revocation-v1';
