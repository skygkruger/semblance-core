import { z } from 'zod';
import { ExecutionProtocolVersionField, IsoDateTime } from './common.js';

export const ExecutionIdempotencyScope = z.enum(['task', 'session']);
export type ExecutionIdempotencyScope = z.infer<typeof ExecutionIdempotencyScope>;

/** Idempotency key binding for encrypted task submission and receipt replay. */
export const ExecutionIdempotencyKeyV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    idempotencyKey: z.string().min(1),
    clientId: z.string().min(1),
    scope: ExecutionIdempotencyScope,
    createdAt: IsoDateTime,
  })
  .strict();
export type ExecutionIdempotencyKeyV1 = z.infer<typeof ExecutionIdempotencyKeyV1>;

export const EXECUTION_IDEMPOTENCY_KEY_V1_SCHEMA_ID = 'execution-idempotency-key-v1';
