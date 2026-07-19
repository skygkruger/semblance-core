import { z } from 'zod';
import {
  ExecutionCompatibleWithField,
  ExecutionProtocolVersionField,
  IsoDateTime,
} from './common.js';

export const ExecutionHealthStatus = z.enum(['healthy', 'degraded', 'unhealthy']);
export type ExecutionHealthStatus = z.infer<typeof ExecutionHealthStatus>;

/** Node health probe response for gateway preflight and monitoring. */
export const ExecutionHealthV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    compatibleWith: ExecutionCompatibleWithField,
    status: ExecutionHealthStatus,
    nodeId: z.string().min(1),
    uptimeSeconds: z.number().int().nonnegative(),
    modelsAvailable: z.number().int().nonnegative(),
    activeSessions: z.number().int().nonnegative(),
    checkedAt: IsoDateTime,
  })
  .strict();
export type ExecutionHealthV1 = z.infer<typeof ExecutionHealthV1>;

export const EXECUTION_HEALTH_V1_SCHEMA_ID = 'execution-health-v1';
