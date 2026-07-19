export * from './common.js';
export * from './root.js';
export * from './membership.js';
export * from './consent.js';
export * from './publication.js';
export * from './key-rotation.js';
export * from './departure.js';
export * from './recovery.js';

import { SHARED_SPACE_CONSENT_V1_SCHEMA_ID } from './consent.js';
import { SHARED_SPACE_DEPARTURE_V1_SCHEMA_ID } from './departure.js';
import { SHARED_SPACE_KEY_ROTATION_V1_SCHEMA_ID } from './key-rotation.js';
import { SHARED_SPACE_MEMBERSHIP_V1_SCHEMA_ID } from './membership.js';
import { SHARED_SPACE_PUBLICATION_INTENT_V1_SCHEMA_ID } from './publication.js';
import { SHARED_SPACE_RECOVERY_V1_SCHEMA_ID } from './recovery.js';
import { SHARED_SPACE_ROOT_V1_SCHEMA_ID } from './root.js';

export const SHARED_SPACE_V1_SCHEMA_IDS = [
  SHARED_SPACE_ROOT_V1_SCHEMA_ID,
  SHARED_SPACE_MEMBERSHIP_V1_SCHEMA_ID,
  SHARED_SPACE_CONSENT_V1_SCHEMA_ID,
  SHARED_SPACE_PUBLICATION_INTENT_V1_SCHEMA_ID,
  SHARED_SPACE_KEY_ROTATION_V1_SCHEMA_ID,
  SHARED_SPACE_DEPARTURE_V1_SCHEMA_ID,
  SHARED_SPACE_RECOVERY_V1_SCHEMA_ID,
] as const;

export type SharedSpaceV1SchemaId = (typeof SHARED_SPACE_V1_SCHEMA_IDS)[number];
