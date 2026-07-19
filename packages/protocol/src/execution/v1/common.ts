import { z } from 'zod';
import { IsoDateTime } from '../../common.js';

/** Canonical execution protocol version identifier. */
export const EXECUTION_PROTOCOL_VERSION = 'execution/v1' as const;
export type ExecutionProtocolVersion = typeof EXECUTION_PROTOCOL_VERSION;

/**
 * Previous-compatible protocol markers. v1 is self-compatible; future versions
 * append prior identifiers here without removing v1 until a breaking change.
 */
export const EXECUTION_COMPATIBLE_WITH = ['execution/v1'] as const;
export type ExecutionCompatibleWith = typeof EXECUTION_COMPATIBLE_WITH;

export const ExecutionProtocolVersionField = z.literal(EXECUTION_PROTOCOL_VERSION);
export type ExecutionProtocolVersionField = z.infer<typeof ExecutionProtocolVersionField>;

export const ExecutionCompatibleWithField = z
  .array(z.literal(EXECUTION_PROTOCOL_VERSION))
  .min(1);
export type ExecutionCompatibleWithField = z.infer<typeof ExecutionCompatibleWithField>;

export const ExecutionTokensUsed = z
  .object({
    prompt: z.number().int().nonnegative(),
    completion: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type ExecutionTokensUsed = z.infer<typeof ExecutionTokensUsed>;

export { IsoDateTime };
