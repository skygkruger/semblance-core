import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTION_REQUEST_V1_SCHEMA_ID,
  ACTION_RESPONSE_V1_SCHEMA_ID,
} from './action.js';
import { CAPABILITY_GRANT_V1_SCHEMA_ID } from './capability.js';
import { SIGNED_ENTITLEMENT_V1_SCHEMA_ID } from './entitlement.js';
import { EXTENSION_MANIFEST_V1_SCHEMA_ID } from './extension.js';
import {
  PROCESS_ACK_V1_SCHEMA_ID,
  PROCESS_HELLO_V1_SCHEMA_ID,
} from './handshake.js';
import { PROOF_RECEIPT_V1_SCHEMA_ID } from './proof.js';
import { SYNC_ENVELOPE_V1_SCHEMA_ID } from './sync.js';
import { VAULT_EVENT_V1_SCHEMA_ID } from './vault.js';
import {
  EXECUTION_HANDSHAKE_AUTH_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_CHALLENGE_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_HELLO_V1_SCHEMA_ID,
  EXECUTION_HANDSHAKE_SESSION_V1_SCHEMA_ID,
  EXECUTION_HEALTH_V1_SCHEMA_ID,
  EXECUTION_IDEMPOTENCY_KEY_V1_SCHEMA_ID,
  EXECUTION_MODEL_INVENTORY_V1_SCHEMA_ID,
  EXECUTION_RECEIPT_V1_SCHEMA_ID,
  EXECUTION_REVOCATION_V1_SCHEMA_ID,
  EXECUTION_TASK_ENVELOPE_V1_SCHEMA_ID,
} from './execution/v1/index.js';
import {
  SHARED_SPACE_CONSENT_V1_SCHEMA_ID,
  SHARED_SPACE_DEPARTURE_V1_SCHEMA_ID,
  SHARED_SPACE_KEY_ROTATION_V1_SCHEMA_ID,
  SHARED_SPACE_MEMBERSHIP_V1_SCHEMA_ID,
  SHARED_SPACE_PUBLICATION_INTENT_V1_SCHEMA_ID,
  SHARED_SPACE_RECOVERY_V1_SCHEMA_ID,
  SHARED_SPACE_ROOT_V1_SCHEMA_ID,
} from './shared-space/v1/index.js';

export const PROTOCOL_SCHEMA_IDS = [
  PROCESS_HELLO_V1_SCHEMA_ID,
  PROCESS_ACK_V1_SCHEMA_ID,
  CAPABILITY_GRANT_V1_SCHEMA_ID,
  ACTION_REQUEST_V1_SCHEMA_ID,
  ACTION_RESPONSE_V1_SCHEMA_ID,
  SIGNED_ENTITLEMENT_V1_SCHEMA_ID,
  EXTENSION_MANIFEST_V1_SCHEMA_ID,
  PROOF_RECEIPT_V1_SCHEMA_ID,
  VAULT_EVENT_V1_SCHEMA_ID,
  SYNC_ENVELOPE_V1_SCHEMA_ID,
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
  SHARED_SPACE_ROOT_V1_SCHEMA_ID,
  SHARED_SPACE_MEMBERSHIP_V1_SCHEMA_ID,
  SHARED_SPACE_CONSENT_V1_SCHEMA_ID,
  SHARED_SPACE_PUBLICATION_INTENT_V1_SCHEMA_ID,
  SHARED_SPACE_KEY_ROTATION_V1_SCHEMA_ID,
  SHARED_SPACE_DEPARTURE_V1_SCHEMA_ID,
  SHARED_SPACE_RECOVERY_V1_SCHEMA_ID,
] as const;

export type ProtocolSchemaId = (typeof PROTOCOL_SCHEMA_IDS)[number];

export interface SchemaCompatibilityResult {
  compatible: boolean;
  reason?: string;
  errors?: ErrorObject[] | null;
}

const packageRoot = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(packageRoot, '..', 'schemas');

let ajvInstance: Ajv2020 | undefined;
const validators = new Map<ProtocolSchemaId, ValidateFunction>();

function getAjv(): Ajv2020 {
  if (!ajvInstance) {
    ajvInstance = new Ajv2020({ allErrors: true, strict: true, validateSchema: true });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

export function loadProtocolSchema(schemaId: ProtocolSchemaId): Record<string, unknown> {
  const schemaPath = join(schemasDir, `${schemaId}.schema.json`);
  const raw = readFileSync(schemaPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

export function getProtocolSchemaValidator(schemaId: ProtocolSchemaId): ValidateFunction {
  const cached = validators.get(schemaId);
  if (cached) {
    return cached;
  }

  const ajv = getAjv();
  const schema = loadProtocolSchema(schemaId);
  const validate = ajv.compile(schema);
  validators.set(schemaId, validate);
  return validate;
}

export function validateProtocolDocument(
  schemaId: ProtocolSchemaId,
  document: unknown,
): SchemaCompatibilityResult {
  const validate = getProtocolSchemaValidator(schemaId);
  const compatible = validate(document);
  if (compatible) {
    return { compatible: true };
  }
  return {
    compatible: false,
    reason: 'document failed JSON Schema validation',
    errors: validate.errors,
  };
}

function collectRequiredFieldPaths(
  schema: Record<string, unknown>,
  prefix = '',
): string[] {
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  const paths = required.map((field) => (prefix ? `${prefix}.${field}` : field));

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (childSchema && typeof childSchema === 'object' && !Array.isArray(childSchema)) {
        paths.push(
          ...collectRequiredFieldPaths(
            childSchema as Record<string, unknown>,
            prefix ? `${prefix}.${key}` : key,
          ),
        );
      }
    }
  }

  return paths;
}

function hasPath(value: unknown, path: string): boolean {
  const segments = path.split('.');
  let current: unknown = value;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current !== undefined;
}

export function schemaCompatibility(
  schemaId: ProtocolSchemaId,
  baselineDocument: unknown,
  candidateDocument: unknown,
): SchemaCompatibilityResult {
  const baselineResult = validateProtocolDocument(schemaId, baselineDocument);
  if (!baselineResult.compatible) {
    return {
      compatible: false,
      reason: 'baseline fixture is invalid',
      errors: baselineResult.errors,
    };
  }

  const schema = loadProtocolSchema(schemaId);
  const requiredPaths = collectRequiredFieldPaths(schema);
  const removedRequiredFields = requiredPaths.filter(
    (path) => hasPath(baselineDocument, path) && !hasPath(candidateDocument, path),
  );
  if (removedRequiredFields.length > 0) {
    return {
      compatible: false,
      reason: `removed required fields: ${removedRequiredFields.join(', ')}`,
    };
  }

  return validateProtocolDocument(schemaId, candidateDocument);
}

export function assertSchemaCompatible(
  schemaId: ProtocolSchemaId,
  baselineDocument: unknown,
  candidateDocument: unknown,
): void {
  const result = schemaCompatibility(schemaId, baselineDocument, candidateDocument);
  if (!result.compatible) {
    throw new Error(result.reason ?? 'schema compatibility check failed');
  }
}

export function assertSchemaIncompatible(
  schemaId: ProtocolSchemaId,
  baselineDocument: unknown,
  candidateDocument: unknown,
): void {
  const result = schemaCompatibility(schemaId, baselineDocument, candidateDocument);
  if (result.compatible) {
    throw new Error('expected schema compatibility check to fail');
  }
}
