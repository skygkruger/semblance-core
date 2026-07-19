export * from './common.js';
export * from './handshake.js';
export * from './inventory.js';
export * from './idempotency.js';
export * from './task.js';
export * from './receipt.js';
export * from './health.js';
export * from './revocation.js';

import {
  EXECUTION_HANDSHAKE_AUTH_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_CHALLENGE_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_HELLO_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_SESSION_V1_SCHEMA_ID,
} from './handshake.js';
import { EXECUTION_HEALTH_V1_SCHEMA_ID } from './health.js';
import { EXECUTION_IDEMPOTENCY_KEY_V1_SCHEMA_ID } from './idempotency.js';
import { EXECUTION_MODEL_INVENTORY_V1_SCHEMA_ID } from './inventory.js';
import { EXECUTION_RECEIPT_V1_SCHEMA_ID } from './receipt.js';
import { EXECUTION_REVOCATION_V1_SCHEMA_ID } from './revocation.js';
import { EXECUTION_TASK_ENVELOPE_V1_SCHEMA_ID } from './task.js';

export const EXECUTION_V1_SCHEMA_IDS = [
  EXECUTION_HANDSHAKE_HELLO_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_CHALLENGE_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_AUTH_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_SESSION_V1_SCHEMA_ID,
  EXECUTION_MODEL_INVENTORY_V1_SCHEMA_ID,
  EXECUTION_IDEMPOTENCY_KEY_V1_SCHEMA_ID,
  EXECUTION_TASK_ENVELOPE_V1_SCHEMA_ID,
  EXECUTION_RECEIPT_V1_SCHEMA_ID,
  EXECUTION_HEALTH_V1_SCHEMA_ID,
  EXECUTION_REVOCATION_V1_SCHEMA_ID,
] as const;

export type ExecutionV1SchemaId = (typeof EXECUTION_V1_SCHEMA_IDS)[number];
