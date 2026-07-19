import type { EncryptedEventEnvelopeV1, SyncEnvelopeV1 } from '@semblance/protocol';
import { getOrCreateDeviceKeys } from '../keys/device-keys.js';
import type { SyncSecureStorageAdapter } from '../keys/secure-storage.js';
import type { MembershipStore } from '../membership/store.js';
import {
  appendSignedAuditEntry,
  createSignedCheckpoint,
  getAuditGenesisHash,
  latestAuditChainHash,
  verifyCheckpoint,
} from './audit.js';
import {
  computeNextLamportClock,
  computeNextVectorClock,
  createSignedEncryptedVaultEvent,
  decryptAndVerifyVaultEvent,
} from './envelope.js';
import { mergeVaultEvents, type MergeableEvent } from './merge.js';
import { openSyncEventStore, type SyncEventStore } from './store.js';
import type {
  PullMergeResult,
  PushEventsResult,
  RebuildIndexesCallback,
  SyncCheckpoint,
} from './types.js';

export interface SyncEventServiceOptions {
  readonly dataDir: string;
  readonly secureStorage: SyncSecureStorageAdapter;
  readonly membershipStore: MembershipStore;
  readonly onRebuildIndexes?: RebuildIndexesCallback;
}

export interface PushVaultEventsInput {
  readonly domainId: string;
  readonly events: ReadonlyArray<{
    readonly eventType: string;
    readonly payload: unknown;
    readonly causalParentIds?: readonly string[];
  }>;
}

export interface PullMergeInput {
  readonly incomingEnvelopes: readonly SyncEnvelopeV1[];
  readonly createCheckpoint?: boolean;
}

export class SyncEventService {
  private readonly store: SyncEventStore;
  private readonly secureStorage: SyncSecureStorageAdapter;
  private readonly membershipStore: MembershipStore;
  private readonly onRebuildIndexes?: RebuildIndexesCallback;
  private localDeviceKeys: Awaited<ReturnType<typeof getOrCreateDeviceKeys>> | null = null;

  private constructor(
    store: SyncEventStore,
    secureStorage: SyncSecureStorageAdapter,
    membershipStore: MembershipStore,
    onRebuildIndexes?: RebuildIndexesCallback,
  ) {
    this.store = store;
    this.secureStorage = secureStorage;
    this.membershipStore = membershipStore;
    this.onRebuildIndexes = onRebuildIndexes;
  }

  static async initialize(options: SyncEventServiceOptions): Promise<SyncEventService> {
    const store = openSyncEventStore(options.dataDir);
    return new SyncEventService(
      store,
      options.secureStorage,
      options.membershipStore,
      options.onRebuildIndexes,
    );
  }

  close(): void {
    this.store.close();
  }

  private async requireLocalDeviceKeys() {
    if (!this.localDeviceKeys) {
      const root = this.membershipStore.getRoot();
      const ownerDeviceId = root?.ownerDeviceId;
      this.localDeviceKeys = await getOrCreateDeviceKeys(this.secureStorage, ownerDeviceId);
    }
    return this.localDeviceKeys;
  }

  private buildDevicePublicKeyMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const device of this.membershipStore.listDevices(true)) {
      map.set(device.deviceId, device.publicKey);
    }
    return map;
  }

  private getMembershipEpoch(): number {
    return this.membershipStore.getRoot()?.membershipEpoch ?? 1;
  }

  private nextAuditSequence(): number {
    const entries = this.store.listAuditEntries();
    return entries.length > 0 ? entries[entries.length - 1]!.sequence + 1 : 1;
  }

  private priorAuditHash(): string {
    const entries = this.store.listAuditEntries();
    return latestAuditChainHash(entries);
  }

  async pushEvents(input: PushVaultEventsInput): Promise<PushEventsResult> {
    const deviceKeys = await this.requireLocalDeviceKeys();
    const membershipEpoch = this.getMembershipEpoch();
    const localEvents = this.store.listMergeableEvents();
    const parentLamports = localEvents.map((event) => event.lamportClock);
    let lamportClock = this.store.getMaxLamportClock();
    let vectorClock: Record<string, number> = { [deviceKeys.deviceId]: 0 };
    for (const event of localEvents) {
      vectorClock = computeNextVectorClock(vectorClock, event.vectorClock, deviceKeys.deviceId);
    }

    const pushed: SyncEnvelopeV1[] = [];
    const eventIds: string[] = [];

    for (const eventInput of input.events) {
      lamportClock = computeNextLamportClock(lamportClock, parentLamports);
      vectorClock = computeNextVectorClock(vectorClock, {}, deviceKeys.deviceId);

      const envelope = await createSignedEncryptedVaultEvent({
        deviceId: deviceKeys.deviceId,
        devicePrivateKey: deviceKeys.privateKey,
        membershipEpoch,
        domainId: input.domainId,
        eventType: eventInput.eventType,
        payload: eventInput.payload,
        causalParentIds: eventInput.causalParentIds,
        lamportClock,
        vectorClock,
        secureStorage: this.secureStorage,
      });

      const payload = envelope.payload as EncryptedEventEnvelopeV1;
      const plaintext = await decryptAndVerifyVaultEvent({
        envelope: payload,
        devicePublicKeys: this.buildDevicePublicKeyMap(),
        secureStorage: this.secureStorage,
      });

      this.store.saveEnvelope(payload, JSON.stringify(plaintext));
      pushed.push(envelope);
      eventIds.push(payload.eventId);
    }

    const auditEntry = appendSignedAuditEntry({
      sequence: this.nextAuditSequence(),
      operation: 'push',
      eventIds,
      priorChainHash: this.priorAuditHash(),
      devicePrivateKey: deviceKeys.privateKey,
    });
    this.store.appendAuditEntry(auditEntry);

    return { pushed, auditEntry };
  }

  async pullMerge(input: PullMergeInput): Promise<PullMergeResult> {
    const deviceKeys = await this.requireLocalDeviceKeys();
    const devicePublicKeys = this.buildDevicePublicKeyMap();
    const membershipEpoch = this.getMembershipEpoch();
    const localEvents = this.store.listMergeableEvents();
    const incomingEvents: MergeableEvent[] = [];

    for (const envelope of input.incomingEnvelopes) {
      if (envelope.envelopeKind !== 'encrypted_event') {
        continue;
      }

      const payload = envelope.payload as EncryptedEventEnvelopeV1;
      const plaintext = await decryptAndVerifyVaultEvent({
        envelope: payload,
        devicePublicKeys,
        secureStorage: this.secureStorage,
      });

      incomingEvents.push({
        eventId: payload.eventId,
        domainId: payload.domainId,
        deviceId: payload.deviceId,
        membershipEpoch: payload.membershipEpoch,
        lamportClock: payload.lamportClock,
        vectorClock: payload.vectorClock,
        causalParentIds: payload.causalParentIds,
        plaintext,
      });

      this.store.saveEnvelope(payload, JSON.stringify(plaintext));
    }

    const mergeResult = mergeVaultEvents({
      localEvents,
      incomingEvents,
      onRebuildIndexes: this.onRebuildIndexes,
    });

    for (const merged of mergeResult.merged) {
      if (mergeResult.appliedEventIds.includes(merged.eventId) || !localEvents.some((e) => e.eventId === merged.eventId)) {
        this.store.saveMergedEvent({
          eventId: merged.eventId,
          domainId: merged.domainId,
          deviceId: merged.deviceId,
          membershipEpoch: merged.membershipEpoch,
          lamportClock: merged.lamportClock,
          vectorClock: merged.vectorClock,
          causalParentIds: merged.causalParentIds,
          plaintext: merged.plaintext,
          conflictGroupId: merged.conflictGroupId,
          isConflictDuplicate: merged.isConflictDuplicate,
        });
      }
    }

    const auditEntry = appendSignedAuditEntry({
      sequence: this.nextAuditSequence(),
      operation: 'merge',
      eventIds: mergeResult.appliedEventIds,
      priorChainHash: this.priorAuditHash(),
      devicePrivateKey: deviceKeys.privateKey,
    });
    this.store.appendAuditEntry(auditEntry);

    let checkpoint: SyncCheckpoint | null = null;
    if (input.createCheckpoint) {
      checkpoint = createSignedCheckpoint({
        deviceId: deviceKeys.deviceId,
        auditChainHash: auditEntry.chainHash,
        eventCount: this.store.countEvents(),
        membershipEpoch,
        devicePrivateKey: deviceKeys.privateKey,
      });
      this.store.saveCheckpoint(checkpoint);
    }

    return {
      ...mergeResult,
      checkpoint,
      auditEntry,
    };
  }

  listOutgoingEnvelopes(sinceLamport?: number): SyncEnvelopeV1[] {
    const envelopes =
      sinceLamport !== undefined
        ? this.store.listEnvelopesSince(sinceLamport)
        : this.store.listEnvelopes();
    return envelopes.map((payload) => this.store.wrapOutgoing(payload));
  }

  getLatestCheckpoint(): SyncCheckpoint | null {
    return this.store.getLatestCheckpoint();
  }

  verifyLatestCheckpoint(): boolean {
    const checkpoint = this.store.getLatestCheckpoint();
    if (!checkpoint) {
      return false;
    }
    const device = this.membershipStore.getDevice(checkpoint.deviceId);
    if (!device) {
      return false;
    }
    return verifyCheckpoint(checkpoint, device.publicKey);
  }

  getAuditGenesisHash(): string {
    return getAuditGenesisHash();
  }
}

export function createSyncEventService(options: SyncEventServiceOptions): Promise<SyncEventService> {
  return SyncEventService.initialize(options);
}
