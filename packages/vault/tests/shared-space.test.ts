import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SHARED_SPACE_PROTOCOL_VERSION } from '@semblance/protocol';
import {
  SharedSpaceService,
  createMemorySharedSpaceSecureStorage,
} from '@semblance/kernel';
import { generateEd25519KeyMaterial } from '../../kernel/src/shared-space/crypto/ed25519.js';
import {
  SharedSpaceVaultService,
  createInMemorySharedSpaceEventLog,
  projectSharedEventsForMember,
  publishPersonalToSharedSpace,
} from '../src/shared-space/service.js';

describe('@semblance/vault shared-space publication and projection', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  async function createTwoMemberSpace() {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-shared-space-vault-'));
    tempDirs.push(dataDir);
    const secureStorage = createMemorySharedSpaceSecureStorage();
    const sharedSpaceService = SharedSpaceService.initialize({ dataDir, secureStorage });
    const ownerKeys = generateEd25519KeyMaterial();
    const memberKeys = generateEd25519KeyMaterial();
    const memberEnrollment = generateEd25519KeyMaterial();

    const created = await sharedSpaceService.createSharedSpace({
      creatorMemberId: 'member-owner-001',
      creatorPersonalRootId: 'root-personal-owner-001',
      creatorPersonalRootPrivateKey: ownerKeys.privateKey,
      creatorPublicKey: ownerKeys.publicKey,
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
      sharedSpaceService,
      vaultService,
      sharedSpaceId: created.root.sharedSpaceId,
      ownerKeys,
    };
  }

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

  it('requires explicit publication and dual approval before writing shared events', async () => {
    const { vaultService, sharedSpaceService, sharedSpaceId } = await createTwoMemberSpace();
    const consent = buildConsent(sharedSpaceId, 'member-alice-001', 'root-personal-alice-001');
    const personalRecord = {
      recordId: 'personal-doc-001',
      recordHash: 'abc123',
      payloadPlaintext: JSON.stringify({ title: 'Family budget', scope: 'personal-only' }),
    };

    const initial = vaultService.publish({
      sharedSpaceId,
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      personalRecord,
      consent,
    });
    expect(initial.status).toBe('needs_approval');
    expect(vaultService.listShared({
      sharedSpaceId,
      viewerMemberId: 'member-owner-001',
    })).toHaveLength(0);

    const ownerApproval = vaultService.approve({
      actionId: initial.actionId,
      approverMemberId: 'member-owner-001',
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      consent,
      personalRecord,
    });
    expect(ownerApproval.status).toBe('needs_approval');

    const published = vaultService.approve({
      actionId: initial.actionId,
      approverMemberId: 'member-alice-001',
      actorMemberId: 'member-alice-001',
      actorPersonalRootId: 'root-personal-alice-001',
      actorRole: 'member',
      consent,
      personalRecord,
    });
    expect(published.status).toBe('published');
    expect(published.event?.sourcePersonalRecordId).toBe('personal-doc-001');

    expect(
      vaultService.evaluateAdminPersonalRead({
        sharedSpaceId,
        actorMemberId: 'member-owner-001',
        actorPersonalRootId: 'root-personal-owner-001',
        actorRole: 'owner',
        targetMemberId: 'member-alice-001',
        actionId: 'admin-read-personal',
      }),
    ).toBe('deny');

    const sharedView = vaultService.listShared({
      sharedSpaceId,
      viewerMemberId: 'member-owner-001',
    });
    expect(sharedView).toHaveLength(1);
    expect(sharedView[0]?.payloadPlaintext).toContain('explicit_personal_to_shared');

    sharedSpaceService.close();
  });

  it('returns empty projection for departed members', async () => {
    const { vaultService, sharedSpaceService, sharedSpaceId } = await createTwoMemberSpace();
    const eventLog = createInMemorySharedSpaceEventLog(Buffer.alloc(32, 7));
    const members = sharedSpaceService.listMembers(sharedSpaceId, false).map((member) => ({
      memberId: member.memberId,
      role: member.role,
      departedAt: member.memberId === 'member-alice-001' ? '2026-07-19T13:00:00.000Z' : member.departedAt,
    }));

    eventLog.append({
      sharedSpaceId,
      publisherMemberId: 'member-owner-001',
      membershipEpoch: 1,
      eventType: 'published_record',
      sourcePersonalRecordId: 'personal-doc-002',
      payloadPlaintext: JSON.stringify({ title: 'Shared note' }),
    });

    const departedView = projectSharedEventsForMember({
      sharedSpaceId,
      viewerMemberId: 'member-alice-001',
      members,
      eventLog,
    });
    expect(departedView).toEqual([]);

    const activeView = projectSharedEventsForMember({
      sharedSpaceId,
      viewerMemberId: 'member-owner-001',
      members,
      eventLog,
    });
    expect(activeView).toHaveLength(1);

    sharedSpaceService.close();
  });

  it('never publishes without explicit personal record reference', () => {
    const eventLog = createInMemorySharedSpaceEventLog(Buffer.alloc(32, 3));
    const space = {
      sharedSpaceId: 'sspace-22222222-2222-4222-8222-222222222222',
      membershipEpoch: 1,
      activeMemberIds: ['member-alice-001', 'member-owner-001'],
    };
    const consent = buildConsent(space.sharedSpaceId, 'member-alice-001', 'root-personal-alice-001');

    const denied = publishPersonalToSharedSpace({
      sharedSpaceId: space.sharedSpaceId,
      membershipEpoch: space.membershipEpoch,
      actor: {
        memberId: 'member-owner-001',
        role: 'owner',
        personalRootId: 'root-personal-owner-001',
      },
      space,
      personalRecord: {
        recordId: 'personal-doc-003',
        recordHash: 'hash-003',
        payloadPlaintext: '{"title":"Not mine"}',
      },
      consent,
      eventLog,
      existingApprovals: [
        {
          approverMemberId: 'member-owner-001',
          actionId: 'forced-publish',
          approvedAt: '2026-07-19T12:00:00.000Z',
        },
        {
          approverMemberId: 'member-alice-001',
          actionId: 'forced-publish',
          approvedAt: '2026-07-19T12:00:01.000Z',
        },
      ],
      actionId: 'forced-publish',
    });

    expect(denied.status).toBe('denied');
    expect(eventLog.listEvents(space.sharedSpaceId)).toHaveLength(0);
  });
});
