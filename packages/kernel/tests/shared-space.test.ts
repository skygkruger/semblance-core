import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PersonalVaultAccessError,
  SharedSpaceService,
  assertAdminCannotAccessPersonalVault,
  createMemorySharedSpaceSecureStorage,
  decryptSharedSpaceEnvelope,
  encryptSharedSpaceEnvelope,
  openMemberPersonalVaultKey,
  rejectLowerEpochEnvelope,
  sealMemberPersonalVaultKey,
} from '../src/index.js';
import { generateEd25519KeyMaterial } from '../src/shared-space/crypto/ed25519.js';

describe('@semblance/kernel shared-space cryptographic authority', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createHarness() {
    const dataDir = mkdtempSync(join(tmpdir(), 'semblance-shared-space-'));
    tempDirs.push(dataDir);
    const ownerStorage = createMemorySharedSpaceSecureStorage();
    const memberStorage = createMemorySharedSpaceSecureStorage();
    const service = SharedSpaceService.initialize({ dataDir, secureStorage: ownerStorage });
    return { dataDir, ownerStorage, memberStorage, service };
  }

  it('allows two members to share space membership under a distinct shared-space root', async () => {
    const { service } = createHarness();
    const ownerKeys = generateEd25519KeyMaterial();
    const memberKeys = generateEd25519KeyMaterial();
    const memberEnrollment = generateEd25519KeyMaterial();

    const created = await service.createSharedSpace({
      creatorMemberId: 'member-owner-001',
      creatorPersonalRootId: 'root-personal-owner-001',
      creatorPersonalRootPrivateKey: ownerKeys.privateKey,
      creatorPublicKey: ownerKeys.publicKey,
      displayName: 'Family Space',
    });

    expect(created.root.sharedSpaceId.startsWith('sspace-')).toBe(true);
    expect(created.root.sharedSpaceId).not.toBe('root-personal-owner-001');
    expect(created.status.membershipEpoch).toBe(0);
    expect(created.status.activeMemberCount).toBe(1);

    const addResult = await service.addMember({
      sharedSpaceId: created.root.sharedSpaceId,
      memberId: 'member-alice-001',
      personalRootId: 'root-personal-alice-001',
      memberPublicKey: memberKeys.publicKey,
      memberEnrollmentPrivateKey: memberEnrollment.privateKey,
      role: 'member',
      consentTextHash: 'consent-alice-v1',
      authorizedByMemberIds: ['member-owner-001'],
    });

    expect(addResult.membershipEpoch).toBe(1);
    const status = service.getStatus(created.root.sharedSpaceId);
    expect(status.activeMemberCount).toBe(2);
    const members = service.listMembers(created.root.sharedSpaceId);
    expect(members.map((member) => member.memberId).sort()).toEqual([
      'member-alice-001',
      'member-owner-001',
    ]);

    service.close();
  });

  it('prevents user A from decrypting user B personal key material', () => {
    const userAKeys = generateEd25519KeyMaterial();
    const userBKeys = generateEd25519KeyMaterial();
    const personalVaultKey = 'deadbeef'.repeat(8);

    const envelope = sealMemberPersonalVaultKey(
      'member-b-001',
      'root-personal-b-001',
      userBKeys.privateKey,
      personalVaultKey,
    );

    expect(openMemberPersonalVaultKey(envelope, userBKeys.privateKey)).toBe(personalVaultKey);
    expect(() => openMemberPersonalVaultKey(envelope, userAKeys.privateKey)).toThrow();

    expect(() =>
      assertAdminCannotAccessPersonalVault({
        actorMemberId: 'member-admin-001',
        actorRole: 'admin',
        targetMemberId: 'member-b-001',
        targetPersonalEnvelope: envelope,
        actorPersonalRootPrivateKey: userAKeys.privateKey,
      }),
    ).toThrow(PersonalVaultAccessError);
  });

  it('blocks departed member from decrypting future shared envelopes after rotation', async () => {
    const { service, ownerStorage, memberStorage } = createHarness();
    const ownerKeys = generateEd25519KeyMaterial();
    const memberKeys = generateEd25519KeyMaterial();
    const memberEnrollment = generateEd25519KeyMaterial();
    const domainId = 'shared-documents';

    const created = await service.createSharedSpace({
      creatorMemberId: 'member-owner-001',
      creatorPersonalRootId: 'root-personal-owner-001',
      creatorPersonalRootPrivateKey: ownerKeys.privateKey,
      creatorPublicKey: ownerKeys.publicKey,
    });

    await service.addMember({
      sharedSpaceId: created.root.sharedSpaceId,
      memberId: 'member-alice-001',
      personalRootId: 'root-personal-alice-001',
      memberPublicKey: memberKeys.publicKey,
      memberEnrollmentPrivateKey: memberEnrollment.privateKey,
      role: 'member',
      consentTextHash: 'consent-alice-v1',
      authorizedByMemberIds: ['member-owner-001'],
    });

    const epochBeforeDepart = service.getStatus(created.root.sharedSpaceId).membershipEpoch;
    const beforeDepartCiphertext = await encryptSharedSpaceEnvelope({
      secureStorage: ownerStorage,
      sharedSpaceId: created.root.sharedSpaceId,
      domainId,
      membershipEpoch: epochBeforeDepart,
      plaintext: JSON.stringify({ title: 'Before departure' }),
    });

    const aliceCanReadBeforeDepart = await decryptSharedSpaceEnvelope({
      secureStorage: ownerStorage,
      sharedSpaceId: created.root.sharedSpaceId,
      domainId,
      membershipEpoch: epochBeforeDepart,
      ciphertext: beforeDepartCiphertext,
    });
    expect(aliceCanReadBeforeDepart).toContain('Before departure');

    const staleMasterKey = await ownerStorage.get(
      `sharedSpace.${created.root.sharedSpaceId}.domain.${domainId}.masterKey`,
    );
    if (staleMasterKey) {
      await memberStorage.set(
        `sharedSpace.${created.root.sharedSpaceId}.domain.${domainId}.masterKey`,
        staleMasterKey,
      );
    }

    await service.departMember({
      sharedSpaceId: created.root.sharedSpaceId,
      departingMemberId: 'member-alice-001',
      authorizedByMemberIds: ['member-owner-001'],
      domainId,
    });

    const epochAfterDepart = service.getStatus(created.root.sharedSpaceId).membershipEpoch;
    const afterDepartCiphertext = await encryptSharedSpaceEnvelope({
      secureStorage: ownerStorage,
      sharedSpaceId: created.root.sharedSpaceId,
      domainId,
      membershipEpoch: epochAfterDepart,
      plaintext: JSON.stringify({ title: 'After departure' }),
    });

    const ownerDecryptsFuture = await decryptSharedSpaceEnvelope({
      secureStorage: ownerStorage,
      sharedSpaceId: created.root.sharedSpaceId,
      domainId,
      membershipEpoch: epochAfterDepart,
      ciphertext: afterDepartCiphertext,
    });
    expect(ownerDecryptsFuture).toContain('After departure');

    await expect(
      decryptSharedSpaceEnvelope({
        secureStorage: memberStorage,
        sharedSpaceId: created.root.sharedSpaceId,
        domainId,
        membershipEpoch: epochAfterDepart,
        ciphertext: afterDepartCiphertext,
      }),
    ).rejects.toThrow();

    expect(() => rejectLowerEpochEnvelope(epochAfterDepart, epochAfterDepart)).not.toThrow();
    expect(() => rejectLowerEpochEnvelope(epochBeforeDepart, epochAfterDepart)).toThrow(/lower-epoch/i);

    service.close();
  });

  it('rejects admin role as a path to another member personal vault access', async () => {
    const { service } = createHarness();
    const ownerKeys = generateEd25519KeyMaterial();
    const adminKeys = generateEd25519KeyMaterial();
    const adminEnrollment = generateEd25519KeyMaterial();
    const targetKeys = generateEd25519KeyMaterial();

    const created = await service.createSharedSpace({
      creatorMemberId: 'member-owner-001',
      creatorPersonalRootId: 'root-personal-owner-001',
      creatorPersonalRootPrivateKey: ownerKeys.privateKey,
      creatorPublicKey: ownerKeys.publicKey,
    });

    await service.addMember({
      sharedSpaceId: created.root.sharedSpaceId,
      memberId: 'member-admin-001',
      personalRootId: 'root-personal-admin-001',
      memberPublicKey: adminKeys.publicKey,
      memberEnrollmentPrivateKey: adminEnrollment.privateKey,
      role: 'admin',
      consentTextHash: 'consent-admin-v1',
      authorizedByMemberIds: ['member-owner-001'],
    });

    const targetEnvelope = sealMemberPersonalVaultKey(
      'member-target-001',
      'root-personal-target-001',
      targetKeys.privateKey,
      'cafebabe'.repeat(8),
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

    service.close();
  });
});
