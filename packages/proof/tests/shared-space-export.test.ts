import { describe, expect, it } from 'vitest';
import {
  buildSharedSpaceProofExport,
  PERSONAL_VAULT_CONTENT_FIELDS,
  serializeSharedSpaceProofExport,
  validateSharedSpaceProofExport,
} from '../src/shared-space/export.js';

describe('@semblance/proof shared-space export', () => {
  const baseInput = {
    sharedSpaceId: 'space-family-001',
    membershipEpoch: 2,
    defaultRetentionDays: 365,
    membershipEvidence: [
      {
        memberId: 'member-alice-001',
        role: 'owner' as const,
        consentRecordId: 'consent-alice-v1',
        consentTextHash: 'hash-consent-alice',
        joinedAt: '2026-07-19T12:00:00.000Z',
        departedAt: null,
        membershipEpoch: 1,
      },
    ],
    policyEvidence: [
      {
        actionId: 'publish-action-001',
        actionType: 'publish_personal_to_shared',
        scope: 'shared_space' as const,
        evaluation: 'needs_approval' as const,
        actorMemberId: 'member-alice-001',
        approverMemberIds: ['member-bob-001'],
        evaluatedAt: '2026-07-19T12:05:00.000Z',
      },
    ],
    sharedEvents: [
      {
        eventId: 'event-001',
        eventType: 'published_record',
        publisherMemberId: 'member-alice-001',
        membershipEpoch: 2,
        payloadPlaintext: JSON.stringify({ title: 'Shared grocery list', kind: 'commitment' }),
        sourcePersonalRecordId: 'personal-doc-001',
        occurredAt: '2026-07-19T12:10:00.000Z',
      },
      {
        eventId: 'event-002',
        eventType: 'legal_hold',
        publisherMemberId: 'member-owner-001',
        membershipEpoch: 2,
        payloadPlaintext: JSON.stringify({ holdReason: 'org audit', scope: 'organization_shared_data_only' }),
        sourcePersonalRecordId: null,
        occurredAt: '2026-07-19T12:15:00.000Z',
      },
    ],
    legalHoldEventIds: ['event-002'],
  };

  it('exports organization action/policy evidence without personal vault plaintext', () => {
    const exported = buildSharedSpaceProofExport(baseInput);
    const validation = validateSharedSpaceProofExport(exported);

    expect(validation.valid).toBe(true);
    expect(validation.forbiddenFieldsFound).toEqual([]);
    expect(exported.retentionBoundaries.organizationOwnedOnly).toBe(true);
    expect(exported.retentionBoundaries.personalVaultExcluded).toBe(true);
    expect(exported.retentionBoundaries.legalHoldScope).toBe('organization_shared_data_only');
    expect(exported.retentionBoundaries.legalHoldActive).toBe(true);
    expect(exported.retentionBoundaries.legalHoldEventIds).toEqual(['event-002']);
    expect(exported.actionEvidence).toHaveLength(2);
    expect(exported.actionEvidence[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.actionEvidence[0]?.sourcePersonalRecordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.actionEvidence.every((entry) => entry.organizationOwned)).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('Shared grocery list');
    expect(JSON.stringify(exported)).not.toContain('personal-doc-001');
  });

  it('excludes user-scoped policy evidence from organization export', () => {
    const exported = buildSharedSpaceProofExport({
      ...baseInput,
      policyEvidence: baseInput.policyEvidence,
    });

    expect(exported.policyEvidence).toHaveLength(1);
    expect(exported.policyEvidence[0]?.scope).toBe('shared_space');
  });

  it('rejects serialization when personal content fields are present', () => {
    const exported = buildSharedSpaceProofExport(baseInput);
    const poisoned = {
      ...exported,
      actionEvidence: [
        {
          ...exported.actionEvidence[0]!,
          payloadPlaintext: 'secret personal note',
        },
      ],
    };

    expect(validateSharedSpaceProofExport(poisoned as typeof exported).valid).toBe(false);
    expect(validateSharedSpaceProofExport(poisoned as typeof exported).forbiddenFieldsFound).toContain(
      'actionEvidence[0].payloadPlaintext',
    );
    expect(() => serializeSharedSpaceProofExport(poisoned as typeof exported)).toThrow(
      /personal content fields/i,
    );
  });

  it('documents blocked personal content field names', () => {
    expect(PERSONAL_VAULT_CONTENT_FIELDS).toContain('payloadPlaintext');
    expect(PERSONAL_VAULT_CONTENT_FIELDS).toContain('personalRecord');
    expect(PERSONAL_VAULT_CONTENT_FIELDS).toContain('personalVaultEvents');
  });
});
