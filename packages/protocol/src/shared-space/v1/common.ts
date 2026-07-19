import { z } from 'zod';
import { IsoDateTime, SchemaVersion } from '../../common.js';

/** Canonical shared-space protocol version identifier. */
export const SHARED_SPACE_PROTOCOL_VERSION = 'shared-space/v1' as const;
export type SharedSpaceProtocolVersion = typeof SHARED_SPACE_PROTOCOL_VERSION;

export const SharedSpaceProtocolVersionField = z.literal(SHARED_SPACE_PROTOCOL_VERSION);
export type SharedSpaceProtocolVersionField = z.infer<typeof SharedSpaceProtocolVersionField>;

export const SharedSpaceRole = z.enum(['owner', 'admin', 'member', 'viewer']);
export type SharedSpaceRole = z.infer<typeof SharedSpaceRole>;

export const SharedSpaceId = z
  .string()
  .min(1)
  .regex(/^sspace-[0-9a-f-]{36}$/);
export type SharedSpaceId = z.infer<typeof SharedSpaceId>;

export { IsoDateTime, SchemaVersion };
