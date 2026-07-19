import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
  SharedSpaceRole,
} from './common.js';

export const SharedSpaceConsentV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    consentRecordId: z.string().min(1),
    sharedSpaceId: SharedSpaceId,
    memberId: z.string().min(1),
    personalRootId: z.string().min(1),
    requestedRole: SharedSpaceRole,
    consentTextHash: z.string().min(1),
    grantedAt: IsoDateTime,
    memberSignature: z.string().min(1),
  })
  .strict();
export type SharedSpaceConsentV1 = z.infer<typeof SharedSpaceConsentV1>;

export const SHARED_SPACE_CONSENT_V1_SCHEMA_ID = 'shared-space-consent-v1';
