// Audit Trail Types — Shared between Core and Gateway
// CRITICAL: No networking imports. Pure type definitions + Zod schemas only.

import { z } from 'zod';
import { ActionType } from './ipc.js';

export const AuditEntry = z.object({
  id: z.string(),
  requestId: z.string(),
  timestamp: z.string().datetime(),
  action: ActionType,
  direction: z.enum(['request', 'response']),
  status: z.enum(['pending', 'success', 'error', 'rejected', 'rate_limited']),
  payloadHash: z.string(),
  signature: z.string(),
  chainHash: z.string(),
  metadata: z.record(z.unknown()).optional(),
  estimatedTimeSavedSeconds: z.number().int().min(0).default(0),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
