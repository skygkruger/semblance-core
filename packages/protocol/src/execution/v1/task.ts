import { z } from 'zod';
import { ExecutionProtocolVersionField, IsoDateTime } from './common.js';

/** Encrypted task envelope transported from Gateway to self-hosted node. */
export const ExecutionTaskEnvelopeV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    taskId: z.string().min(1),
    sessionId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    modelId: z.string().min(1),
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    authTag: z.string().min(1),
    taskHash: z.string().min(64).max(64),
    expiresAt: IsoDateTime,
    clientSignature: z.string().min(1),
  })
  .strict();
export type ExecutionTaskEnvelopeV1 = z.infer<typeof ExecutionTaskEnvelopeV1>;

/** Plaintext task payload encrypted inside ExecutionTaskEnvelopeV1. */
export const ExecutionTaskPayloadV1 = z
  .object({
    messages: z.array(
      z
        .object({
          role: z.string().min(1),
          content: z.string(),
        })
        .strict(),
    ).min(1),
    maxTokens: z.number().int().positive(),
    temperature: z.number().min(0).max(2),
  })
  .strict();
export type ExecutionTaskPayloadV1 = z.infer<typeof ExecutionTaskPayloadV1>;

export const EXECUTION_TASK_ENVELOPE_V1_SCHEMA_ID = 'execution-task-envelope-v1';
