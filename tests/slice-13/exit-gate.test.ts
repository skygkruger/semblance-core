import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SHARED_SPACE_PROTOCOL_VERSION } from '@semblance/protocol';
import {
  PersonalVaultAccessError,
  SharedSpaceService,
  assertAdminCannotAccessPersonalVault,
  createMemorySharedSpaceSecureStorage,
  decideOrgScopedExecutionDestination,
  decryptSharedSpaceEnvelope,
  encryptSharedSpaceEnvelope,
  evaluateSharedAction,
  openMemberPersonalVaultKey,
  rejectLowerEpochEnvelope,
  sealMemberPersonalVaultKey,
} from '@semblance/kernel';
import { generateEd25519KeyMaterial } from '../../packages/kernel/src/shared-space/crypto/ed25519.js';
import {
  SharedSpaceVaultService,
  createInMemorySharedSpaceEventLog,
  projectSharedEventsForMember,
} from '../../packages/vault/src/shared-space/service.js';
import {
  buildSharedSpaceProofExport,
  serializeSharedSpaceProofExport,
  validateSharedSpaceProofExport,
} from '../../packages/proof/src/shared-space/export.js';

describe('Slice 13 exit gate — shared space sovereignty', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function buildConsent(sharedSpaceId: string, memberId: string, personalRootId: string) {
    return {
      schemaVersion: 1 as const,
      protocolVersion: SHARED_SPACE_PROTOCOL_VERSION,
      consentRecordId: `consent-${memberId}`,
      sharedSpaceId,
      memberId,
      personalRootId,
      requestedRole: 'member' as const,
      consentTextHash: 'consent-hash-v1',
      grantedAt: '2026-07-19T12:00:00.000Z',
      memberSignature: 'sig-consent',
    };
  }

  async function createTwoMemberHarness() {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice13-exit-gate-'));
    tempDirs.push(dataDir);
    const ownerStorage = createMemorySharedSpaceSecureStorage();
    const memberStorage = createMemorySharedSpaceSecureStorage();
    const sharedSpaceService = SharedSpaceService.initialize({ dataDir, secureStorage: ownerStorage });
    const ownerKeys = generateEd25519KeyMaterial();
    const memberKeys = generateEd25519KeyMaterial();
    const memberEnrollment = generateEd25519KeyMaterial();

    const created = await sharedSpaceService.createSharedSpace({
      creatorMemberId: 'member-owner-001',
      creatorPersonalRootId: 'root-personal-owner-001',
      creatorPersonalRootPrivateKey: ownerKeys.privateKey,
      creatorPublicKey: ownerKeys.publicKey,
      displayName: 'Family Space',
    });

    await sharedSpaceService.addMember({
      sharedSpaceId: created.root.sharedSpaceId,
      memberId: 'member-alice-001',
      personalRootId: 'root-personal-alice-001',
      memberPublicKey: memberKeys.publicKey,
      memberEnrollmentPrivateKey: memberEnrollment.privateKey,
      role: 'member',
      consentTextHash: 'consent-alice-v1',
      authorizedByMemberIds: ['member-owner-001'],
    });

    const vaultService = SharedSpaceVaultService.initialize({
      dataDir,
      sharedSpaceService,
    });

    return {
      dataDir,
      ownerStorage,
      memberStorage,
      sharedSpaceService,
      vaultService,
      sharedSpaceId: created.root.sharedSpaceId,
      ownerKeys,
      memberKeys,
    };
  }

  it('allows two users to share selected records and actions via shared space', async () => {
    const { vaultService, sharedSpaceService, sharedSpaceId } = await createTwoMemberHarness();
    const consent = buildConsent(sharedSpaceId, 'member-alice-001', 'root-personal-alice-001');
    const personalRecord = {
      recordId: 'personal-commitment-001',
      recordHash: 'hash-commitment-001',
      payloadPlaintext: JSON.stringify({
        title: 'Weekly grocery run',
        kind: 'commitment',
        scope: 'explicit_personal_to_shared',
      }),
    };

    const pending = vaultService.publish({
      sharedSpaceId,
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      personalRecord,
      consent,
    });
    expect(pending.status).toBe('needs_approval');

    vaultService.approve({
      actionId: pending.actionId,
      approverMemberId: 'member-owner-001',
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      consent,
      personalRecord,
    });

    const published = vaultService.approve({
      actionId: pending.actionId,
      approverMemberId: 'member-alice-001',
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      consent,
      personalRecord,
    });
    expect(published.status).toBe('published');
    expect(published.event?.sourcePersonalRecordId).toBe('personal-commitment-001');

    const ownerView = vaultService.listShared({
      sharedSpaceId,
      viewerMemberId: 'member-owner-001',
    });
    expect(ownerView).toHaveLength(1);
    expect(ownerView[0]?.payloadPlaintext).toContain('Weekly grocery run');

    sharedSpaceService.close();
  });

  it('keeps private graphs cryptographically inaccessible between members', () => {
    const userAKeys = generateEd25519KeyMaterial();
    const userBKeys = generateEd25519KeyMaterial();
    const personalVaultKey = 'aabbccdd'.repeat(8);

    const userBEnvelope = sealMemberPersonalVaultKey(
      'member-b-001',
      'root-personal-b-001',
      userBKeys.privateKey,
      personalVaultKey,
    );

    expect(openMemberPersonalVaultKey(userBEnvelope, userBKeys.privateKey)).toBe(personalVaultKey);
    expect(() => openMemberPersonalVaultKey(userBEnvelope, userAKeys.privateKey)).toThrow();

    const userAEnvelope = sealMemberPersonalVaultKey(
      'member-a-001',
      'root-personal-a-001',
      userAKeys.privateKey,
      '11223344'.repeat(8),
    );
    expect(() => openMemberPersonalVaultKey(userAEnvelope, userBKeys.privateKey)).toThrow();
  });

  it('blocks administrators from decrypting or accessing personal vault material', async () => {
    const { sharedSpaceService } = await createTwoMemberHarness();
    const adminKeys = generateEd25519KeyMaterial();
    const targetKeys = generateEd25519KeyMaterial();
    const targetEnvelope = sealMemberPersonalVaultKey(
      'member-target-001',
      'root-personal-target-001',
      targetKeys.privateKey,
      'deadbeef'.repeat(8),
    );

    expect(() =>
      assertAdminCannotAccessPersonalVault({
        actorMemberId: 'member-admin-001',
        actorRole: 'admin',
        targetMemberId: 'member-target-001',
        targetPersonalEnvelope: targetEnvelope,
        actorPersonalRootPrivateKey: adminKeys.privateKey,
      }),
    ).toThrow(PersonalVaultAccessError);

    const adminRead = evaluateSharedAction({
      actor: {
        memberId: 'member-admin-001',
        role: 'admin',
        personalRootId: 'root-personal-admin-001',
      },
      space: {
        sharedSpaceId: 'sspace-test',
        membershipEpoch: 1,
        activeMemberIds: ['member-admin-001', 'member-target-001'],
      },
      action: {
        actionId: 'admin-read-personal',
        type: 'read_personal_vault',
        scope: 'user',
        targetMemberId: 'member-target-001',
      },
      approvals: [],
    });
    expect(adminRead).toBe('deny');

    sharedSpaceService.close();
  });

  it('requires dual approval before sensitive personal-to-shared publication', async () => {
    const { vaultService, sharedSpaceService, sharedSpaceId } = await createTwoMemberHarness();
    const consent = buildConsent(sharedSpaceId, 'member-alice-001', 'root-personal-alice-001');
    const personalRecord = {
      recordId: 'personal-sensitive-001',
      recordHash: 'hash-sensitive-001',
      payloadPlaintext: JSON.stringify({ title: 'Medical appointment', scope: 'personal-only' }),
    };
    const actionId = 'publish-sensitive-001';

    const policyBeforeApproval = evaluateSharedAction({
      actor: {
        memberId: 'member-alice-001',
        role: 'member',
        personalRootId: 'root-personal-alice-001',
      },
      space: {
        sharedSpaceId,
        membershipEpoch: 1,
        activeMemberIds: ['member-owner-001', 'member-alice-001'],
      },
      action: {
        actionId,
        type: 'publish_personal_to_shared',
        scope: 'user',
        targetMemberId: 'member-alice-001',
      },
      approvals: [],
    });
    expect(policyBeforeApproval).toBe('needs_approval');

    const initial = vaultService.publish({
      sharedSpaceId,
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      personalRecord,
      consent,
    });
    expect(initial.status).toBe('needs_approval');
    expect(vaultService.listShared({ sharedSpaceId, viewerMemberId: 'member-owner-001' })).toHaveLength(0);

    sharedSpaceService.close();
  });

  it('does not let org execution destination policy override personal destinations', () => {
    const personalFacts = {
      sensitivity: 20,
      localFeasibility: true,
      destinationTrust: { confidential: 'attested' },
      userPreference: 'local' as const,
      disclosureCeiling: 80,
      attestationAvailable: true,
      explicitConsent: true,
    };

    const personalDecision = decideOrgScopedExecutionDestination({
      ...personalFacts,
      dataScope: 'user',
      orgDestinationPreference: 'confidential',
    });
    expect(personalDecision.destination).toBe('local');

    const orgDecision = decideOrgScopedExecutionDestination({
      ...personalFacts,
      dataScope: 'organization',
      orgDestinationPreference: 'confidential',
    });
    expect(orgDecision.destination).toBe('confidential');
  });

  it('exports proof evidence without personal vault plaintext or record identifiers', () => {
    const personalPlaintext = 'secret therapy notes — must never appear in export';
    const exported = buildSharedSpaceProofExport({
      sharedSpaceId: 'space-team-001',
      membershipEpoch: 2,
      defaultRetentionDays: 365,
      membershipEvidence: [
        {
          memberId: 'member-alice-001',
          role: 'owner',
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
          scope: 'shared_space',
          evaluation: 'needs_approval',
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
          payloadPlaintext: personalPlaintext,
          sourcePersonalRecordId: 'personal-doc-secret-001',
          occurredAt: '2026-07-19T12:10:00.000Z',
        },
      ],
      legalHoldEventIds: [],
    });

    const validation = validateSharedSpaceProofExport(exported);
    expect(validation.valid).toBe(true);
    expect(validation.forbiddenFieldsFound).toEqual([]);
    expect(exported.retentionBoundaries.personalVaultExcluded).toBe(true);

    const serialized = serializeSharedSpaceProofExport(exported);
    expect(serialized).not.toContain(personalPlaintext);
    expect(serialized).not.toContain('personal-doc-secret-001');
    expect(JSON.stringify(exported)).not.toContain(personalPlaintext);
  });

  it('blocks departed members from future shared envelopes and returns empty projections', async () => {
    const {
      ownerStorage,
      memberStorage,
      sharedSpaceService,
      vaultService,
      sharedSpaceId,
    } = await createTwoMemberHarness();
    const domainId = 'shared-documents';
    const epochBeforeDepart = sharedSpaceService.getStatus(sharedSpaceId).membershipEpoch;

    const beforeDepartCiphertext = await encryptSharedSpaceEnvelope({
      secureStorage: ownerStorage,
      sharedSpaceId,
      domainId,
      membershipEpoch: epochBeforeDepart,
      plaintext: JSON.stringify({ title: 'Before departure' }),
    });

    const staleMasterKey = await ownerStorage.get(
      `sharedSpace.${sharedSpaceId}.domain.${domainId}.masterKey`,
    );
    if (staleMasterKey) {
      await memberStorage.set(
        `sharedSpace.${sharedSpaceId}.domain.${domainId}.masterKey`,
        staleMasterKey,
      );
    }

    await sharedSpaceService.departMember({
      sharedSpaceId,
      departingMemberId: 'member-alice-001',
      authorizedByMemberIds: ['member-owner-001'],
      domainId,
    });

    const epochAfterDepart = sharedSpaceService.getStatus(sharedSpaceId).membershipEpoch;
    const afterDepartCiphertext = await encryptSharedSpaceEnvelope({
      secureStorage: ownerStorage,
      sharedSpaceId,
      domainId,
      membershipEpoch: epochAfterDepart,
      plaintext: JSON.stringify({ title: 'After departure' }),
    });

    await expect(
      decryptSharedSpaceEnvelope({
        secureStorage: memberStorage,
        sharedSpaceId,
        domainId,
        membershipEpoch: epochAfterDepart,
        ciphertext: afterDepartCiphertext,
      }),
    ).rejects.toThrow();

    expect(() => rejectLowerEpochEnvelope(epochBeforeDepart, epochAfterDepart)).toThrow(/lower-epoch/i);

    const members = sharedSpaceService.listMembers(sharedSpaceId, false).map((member) => ({
      memberId: member.memberId,
      role: member.role,
      departedAt: member.departedAt,
    }));
    const eventLog = createInMemorySharedSpaceEventLog(Buffer.alloc(32, 9));
    eventLog.append({
      sharedSpaceId,
      publisherMemberId: 'member-owner-001',
      membershipEpoch: epochAfterDepart,
      eventType: 'published_record',
      sourcePersonalRecordId: 'personal-doc-post-depart',
      payloadPlaintext: JSON.stringify({ title: 'Post-departure shared note' }),
    });

    const departedView = projectSharedEventsForMember({
      sharedSpaceId,
      viewerMemberId: 'member-alice-001',
      members,
      eventLog,
    });
    expect(departedView).toEqual([]);

    expect(vaultService.listShared({
      sharedSpaceId,
      viewerMemberId: 'member-alice-001',
    })).toEqual([]);

    sharedSpaceService.close();
  });
});
