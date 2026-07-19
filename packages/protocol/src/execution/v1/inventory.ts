import { z } from 'zod';
import { ExecutionProtocolVersionField, IsoDateTime } from './common.js';

export const ExecutionModelEntryV1 = z
  .object({
    modelId: z.string().min(1),
    displayName: z.string().min(1),
    contextLength: z.number().int().positive(),
    capabilities: z.array(z.enum(['chat', 'completion', 'embedding'])).min(1),
    contentHash: z.string().min(64).max(64).optional(),
  })
  .strict();
export type ExecutionModelEntryV1 = z.infer<typeof ExecutionModelEntryV1>;

/** Node model inventory published to authenticated gateways. */
export const ExecutionModelInventoryV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    nodeId: z.string().min(1),
    models: z.array(ExecutionModelEntryV1),
    inventoryHash: z.string().min(64).max(64),
    generatedAt: IsoDateTime,
  })
  .strict();
export type ExecutionModelInventoryV1 = z.infer<typeof ExecutionModelInventoryV1>;

export const EXECUTION_MODEL_INVENTORY_V1_SCHEMA_ID = 'execution-model-inventory-v1';
