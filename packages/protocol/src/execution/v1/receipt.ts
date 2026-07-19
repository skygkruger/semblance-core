import { z } from 'zod';
import {
  ExecutionProtocolVersionField,
  ExecutionTokensUsed,
  IsoDateTime,
} from './common.js';

/** Signed execution receipt returned by the node after task completion. */
export const ExecutionReceiptV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    receiptId: z.string().min(1),
    taskId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    nodeId: z.string().min(1),
    modelId: z.string().min(1),
    taskHash: z.string().min(64).max(64),
    responseHash: z.string().min(64).max(64),
    responseCiphertext: z.string().min(1),
    responseIv: z.string().min(1),
    responseAuthTag: z.string().min(1),
    tokensUsed: ExecutionTokensUsed,
    durationMs: z.number().int().nonnegative(),
    completedAt: IsoDateTime,
    nodeSignature: z.string().min(1),
  })
  .strict();
export type ExecutionReceiptV1 = z.infer<typeof ExecutionReceiptV1>;

export const EXECUTION_RECEIPT_V1_SCHEMA_ID = 'execution-receipt-v1';
