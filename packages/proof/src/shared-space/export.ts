import { createHash } from 'node:crypto';
import type { SharedSpaceRole } from '@semblance/protocol';

/** Fields that must never appear in organization proof exports. */
export const PERSONAL_VAULT_CONTENT_FIELDS = [
  'payloadPlaintext',
  'personalRecord',
  'personalRootPrivateKey',
  'memberEnrollmentPrivateKey',
  'privateKey',
  'plaintext',
  'body',
  'emailBody',
  'documentContent',
  'personalVaultEvents',
  'personalSources',
  'personalAssertions',
  'sourcePersonalRecordContent',
] as const;

export type PersonalVaultContentField = typeof PERSONAL_VAULT_CONTENT_FIELDS[number];

export type SharedSpaceProofLegalHoldScope = 'organization_shared_data_only';

export interface SharedSpaceProofRetentionBoundaries {
  readonly organizationOwnedOnly: true;
  readonly personalVaultExcluded: true;
  readonly legalHoldScope: SharedSpaceProofLegalHoldScope;
  readonly defaultRetentionDays: number | null;
  readonly legalHoldActive: boolean;
  readonly legalHoldEventIds: readonly string[];
}

export interface SharedSpaceProofMembershipEvidence {
  readonly memberId: string;
  readonly role: SharedSpaceRole;
  readonly consentRecordId: string;
  readonly consentTextHash: string;
  readonly joinedAt: string;
  readonly departedAt: string | null;
  readonly membershipEpoch: number;
}

export interface SharedSpaceProofPolicyEvidence {
  readonly actionId: string;
  readonly actionType: string;
  readonly scope: 'shared_space' | 'organization';
  readonly evaluation: 'allow' | 'deny' | 'needs_approval';
  readonly actorMemberId: string;
  readonly approverMemberIds: readonly string[];
  readonly evaluatedAt: string;
}

export interface SharedSpaceProofActionEvidence {
  readonly eventId: string;
  readonly eventType: string;
  readonly publisherMemberId: string;
  readonly membershipEpoch: number;
  readonly payloadHash: string;
  readonly sourcePersonalRecordHash: string | null;
  readonly occurredAt: string;
  readonly organizationOwned: true;
}

export interface SharedSpaceProofExport {
  readonly schemaVersion: 1;
  readonly exportId: string;
  readonly exportedAt: string;
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly retentionBoundaries: SharedSpaceProofRetentionBoundaries;
  readonly membershipEvidence: readonly SharedSpaceProofMembershipEvidence[];
  readonly policyEvidence: readonly SharedSpaceProofPolicyEvidence[];
  readonly actionEvidence: readonly SharedSpaceProofActionEvidence[];
}

export interface BuildSharedSpaceProofExportInput {
  readonly exportId?: string;
  readonly exportedAt?: string;
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly defaultRetentionDays?: number | null;
  readonly membershipEvidence: readonly SharedSpaceProofMembershipEvidence[];
  readonly policyEvidence: readonly SharedSpaceProofPolicyEvidence[];
  readonly sharedEvents: readonly {
    eventId: string;
    eventType: string;
    publisherMemberId: string;
    membershipEpoch: number;
    payloadPlaintext: string;
    sourcePersonalRecordId: string | null;
    occurredAt: string;
  }[];
  readonly legalHoldEventIds?: readonly string[];
}

export interface SharedSpaceProofExportValidation {
  readonly valid: boolean;
  readonly forbiddenFieldsFound: readonly string[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function hashPayload(payloadPlaintext: string): string {
  return sha256(payloadPlaintext);
}

function hashPersonalRecordReference(recordId: string | null): string | null {
  if (!recordId) {
    return null;
  }
  return sha256(recordId);
}

/**
 * Build an organization-facing shared-space proof export.
 * Includes action/policy evidence for organization-owned shared data only.
 * Personal vault plaintext and private key material are never included.
 */
export function buildSharedSpaceProofExport(
  input: BuildSharedSpaceProofExportInput,
): SharedSpaceProofExport {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const exportId = input.exportId ?? sha256(`${input.sharedSpaceId}|${exportedAt}|${input.membershipEpoch}`);

  const legalHoldEventIds = [...(input.legalHoldEventIds ?? [])];
  const legalHoldActive = legalHoldEventIds.length > 0;

  const actionEvidence: SharedSpaceProofActionEvidence[] = input.sharedEvents.map((event) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    publisherMemberId: event.publisherMemberId,
    membershipEpoch: event.membershipEpoch,
    payloadHash: hashPayload(event.payloadPlaintext),
    sourcePersonalRecordHash: hashPersonalRecordReference(event.sourcePersonalRecordId),
    occurredAt: event.occurredAt,
    organizationOwned: true,
  }));

  const orgPolicyEvidence = input.policyEvidence.filter(
    (entry) => entry.scope === 'shared_space' || entry.scope === 'organization',
  );

  return {
    schemaVersion: 1,
    exportId,
    exportedAt,
    sharedSpaceId: input.sharedSpaceId,
    membershipEpoch: input.membershipEpoch,
    retentionBoundaries: {
      organizationOwnedOnly: true,
      personalVaultExcluded: true,
      legalHoldScope: 'organization_shared_data_only',
      defaultRetentionDays: input.defaultRetentionDays ?? null,
      legalHoldActive,
      legalHoldEventIds,
    },
    membershipEvidence: input.membershipEvidence,
    policyEvidence: orgPolicyEvidence,
    actionEvidence,
  };
}

function collectForbiddenFields(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return [];
  }

  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      hits.push(...collectForbiddenFields(entry, `${path}[${index}]`));
    });
    return hits;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if ((PERSONAL_VAULT_CONTENT_FIELDS as readonly string[]).includes(key)) {
      hits.push(fieldPath);
    }
    hits.push(...collectForbiddenFields(nested, fieldPath));
  }
  return hits;
}

/** Assert that a proof export contains no personal vault content fields. */
export function validateSharedSpaceProofExport(
  exportBundle: SharedSpaceProofExport,
): SharedSpaceProofExportValidation {
  const forbiddenFieldsFound = collectForbiddenFields(exportBundle);
  return {
    valid: forbiddenFieldsFound.length === 0,
    forbiddenFieldsFound,
  };
}

/** Serialize export for auditors; strips any accidental personal fields before returning. */
export function serializeSharedSpaceProofExport(
  exportBundle: SharedSpaceProofExport,
): string {
  const validation = validateSharedSpaceProofExport(exportBundle);
  if (!validation.valid) {
    throw new Error(
      `Shared-space proof export contains personal content fields: ${validation.forbiddenFieldsFound.join(', ')}`,
    );
  }
  return JSON.stringify(exportBundle, null, 2);
}
