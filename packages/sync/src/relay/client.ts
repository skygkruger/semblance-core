import type { SyncEnvelopeV1 } from '@semblance/protocol';
import { randomUUID } from 'node:crypto';
import {
  assertNoFork,
  assertNoReplay,
  assertNoSubstitution,
  assertRelayMessageHasNoPlaintextFields,
  computeBatchMerkleRoot,
  computeDeviceEpochHash,
  computeHeadHash,
  computeRootIdHash,
  decodeEnvelopeBlob,
  encodeEnvelopeBlob,
  SyncRelayIntegrityError,
  SYNC_RELAY_GENESIS_HEAD,
  syncRelayExchangeRequestSchema,
  syncRelayExchangeResponseSchema,
  syncRelayPullRequestSchema,
  syncRelayPullResponseSchema,
  syncRelayPushRequestSchema,
  syncRelayPushResponseSchema,
  verifyPullHeadChain,
  type CiphertextEnvelopeBlob,
  type SyncRelayExchangeRequest,
  type SyncRelayExchangeResponse,
  type SyncRelayPullRequest,
  type SyncRelayPullResponse,
  type SyncRelayPushRequest,
  type SyncRelayPushResponse,
} from './protocol.js';

export interface SyncRelayTransport {
  push(request: SyncRelayPushRequest): Promise<SyncRelayPushResponse>;
  pull(request: SyncRelayPullRequest): Promise<SyncRelayPullResponse>;
}

export interface DirectPeerTransport {
  exchange(
    peerDeviceId: string,
    request: SyncRelayExchangeRequest,
  ): Promise<SyncRelayExchangeResponse>;
}

export interface SyncRelayClientOptions {
  readonly rootId: string;
  readonly deviceId: string;
  readonly membershipEpoch: number;
  readonly relayTransport: SyncRelayTransport;
  readonly directPeerTransport: DirectPeerTransport;
}

export interface SyncRelayPushResult {
  readonly accepted: number;
  readonly headHash: string;
  readonly pushedBlobIds: readonly string[];
}

export interface SyncRelayPullResult {
  readonly envelopes: SyncEnvelopeV1[];
  readonly headHash: string;
  readonly pulledBlobIds: readonly string[];
}

export interface SyncRelayClientState {
  readonly headHash: string;
  readonly seenBlobIds: ReadonlySet<string>;
  readonly merkleRoot: string;
}

export class SyncRelayClient {
  private readonly rootIdHash: string;
  private readonly deviceEpochHash: string;
  private readonly relayTransport: SyncRelayTransport;
  private readonly directPeerTransport: DirectPeerTransport;
  private headHash = SYNC_RELAY_GENESIS_HEAD;
  private merkleRoot = computeBatchMerkleRoot([]);
  private readonly seenBlobIds = new Set<string>();
  private readonly blobHashById = new Map<string, string>();
  private readonly relayBlobStore = new Map<string, CiphertextEnvelopeBlob>();

  constructor(options: SyncRelayClientOptions) {
    this.rootIdHash = computeRootIdHash(options.rootId);
    this.deviceEpochHash = computeDeviceEpochHash(
      options.rootId,
      options.membershipEpoch,
      options.deviceId,
    );
    this.relayTransport = options.relayTransport;
    this.directPeerTransport = options.directPeerTransport;
  }

  getState(): SyncRelayClientState {
    return {
      headHash: this.headHash,
      seenBlobIds: new Set(this.seenBlobIds),
      merkleRoot: this.merkleRoot,
    };
  }

  private encodeOutgoing(envelopes: readonly SyncEnvelopeV1[]): CiphertextEnvelopeBlob[] {
    return envelopes.map((envelope) => encodeEnvelopeBlob(envelope, this.deviceEpochHash));
  }

  private recomputeMerkleRoot(): void {
    this.merkleRoot = computeBatchMerkleRoot([...this.blobHashById.values()]);
  }

  private ingestRemoteBlobs(
    blobs: readonly CiphertextEnvelopeBlob[],
    responseMerkleRoot?: string,
  ): SyncEnvelopeV1[] {
    const envelopes: SyncEnvelopeV1[] = [];
    const newBlobHashes: string[] = [];

    for (const blob of blobs) {
      assertNoSubstitution(blob);
      if (this.seenBlobIds.has(blob.blobId)) {
        envelopes.push(decodeEnvelopeBlob(blob));
        continue;
      }
      this.seenBlobIds.add(blob.blobId);
      this.blobHashById.set(blob.blobId, blob.blobHash);
      this.relayBlobStore.set(blob.blobId, blob);
      newBlobHashes.push(blob.blobHash);
      envelopes.push(decodeEnvelopeBlob(blob));
    }

    if (newBlobHashes.length > 0) {
      this.headHash = computeHeadHash(this.headHash, newBlobHashes);
      this.recomputeMerkleRoot();
    }

    if (responseMerkleRoot !== undefined && blobs.length === 0 && this.seenBlobIds.size > 0) {
      if (responseMerkleRoot !== this.merkleRoot) {
        throw new SyncRelayIntegrityError(
          'deletion',
          `merkle_root_divergence:local=${this.merkleRoot}:remote=${responseMerkleRoot}`,
        );
      }
    }

    return envelopes;
  }

  private buildPushRequest(blobs: readonly CiphertextEnvelopeBlob[]): SyncRelayPushRequest {
    const blobHashes = blobs.map((blob) => blob.blobHash);
    const request: SyncRelayPushRequest = {
      schemaVersion: 1,
      rootIdHash: this.rootIdHash,
      deviceEpochHash: this.deviceEpochHash,
      batchId: randomUUID(),
      blobs: [...blobs],
      batchMerkleRoot: computeBatchMerkleRoot(blobHashes),
      priorHeadHash: this.headHash,
    };
    syncRelayPushRequestSchema.parse(request);
    assertRelayMessageHasNoPlaintextFields(request as unknown as Record<string, unknown>);
    return request;
  }

  private buildPullRequest(sinceLamport?: number): SyncRelayPullRequest {
    const request: SyncRelayPullRequest = {
      schemaVersion: 1,
      rootIdHash: this.rootIdHash,
      deviceEpochHash: this.deviceEpochHash,
      sinceLamport,
      knownHeadHash: this.headHash,
    };
    syncRelayPullRequestSchema.parse(request);
    assertRelayMessageHasNoPlaintextFields(request as unknown as Record<string, unknown>);
    return request;
  }

  async pushViaRelay(envelopes: readonly SyncEnvelopeV1[]): Promise<SyncRelayPushResult> {
    const blobs = this.encodeOutgoing(envelopes);
    for (const blob of blobs) {
      assertNoReplay(blob.blobId, this.seenBlobIds);
    }

    const request = this.buildPushRequest(blobs);
    const response = syncRelayPushResponseSchema.parse(await this.relayTransport.push(request));
    assertNoFork(this.headHash, request.priorHeadHash);

    if (blobs.length > 0) {
      const acceptedHashes = blobs
        .filter((blob) => !response.rejectedBlobIds.includes(blob.blobId))
        .map((blob) => blob.blobHash);
      for (const blob of blobs) {
        if (!response.rejectedBlobIds.includes(blob.blobId)) {
          this.seenBlobIds.add(blob.blobId);
          this.blobHashById.set(blob.blobId, blob.blobHash);
          this.relayBlobStore.set(blob.blobId, blob);
        }
      }
      if (acceptedHashes.length > 0) {
        this.headHash = computeHeadHash(this.headHash, acceptedHashes);
        this.recomputeMerkleRoot();
      }
    }

    return {
      accepted: response.accepted,
      headHash: response.headHash,
      pushedBlobIds: blobs.map((blob) => blob.blobId),
    };
  }

  async pullViaRelay(sinceLamport?: number): Promise<SyncRelayPullResult> {
    const priorHead = this.headHash;
    const request = this.buildPullRequest(sinceLamport);
    const response = syncRelayPullResponseSchema.parse(await this.relayTransport.pull(request));
    verifyPullHeadChain(request.knownHeadHash, response.headHash, priorHead);

    const envelopes = this.ingestRemoteBlobs(response.blobs, response.merkleRoot);
    if (response.headHash !== this.headHash && response.blobs.length === 0) {
      assertNoFork(this.headHash, response.headHash);
    }

    return {
      envelopes,
      headHash: response.headHash,
      pulledBlobIds: response.blobs.map((blob) => blob.blobId),
    };
  }

  async syncViaDirectPeer(
    peerDeviceId: string,
    outgoing: readonly SyncEnvelopeV1[],
  ): Promise<SyncRelayPullResult> {
    const blobs = this.encodeOutgoing(outgoing);
    for (const blob of blobs) {
      assertNoReplay(blob.blobId, this.seenBlobIds);
    }

    const pushRequest = blobs.length > 0 ? this.buildPushRequest(blobs) : undefined;
    const pullRequest = this.buildPullRequest();

    const exchangeRequest: SyncRelayExchangeRequest = {
      schemaVersion: 1,
      push: pushRequest,
      pull: pullRequest,
    };
    syncRelayExchangeRequestSchema.parse(exchangeRequest);

    const exchangeResponse = syncRelayExchangeResponseSchema.parse(
      await this.directPeerTransport.exchange(peerDeviceId, exchangeRequest),
    );

    if (exchangeResponse.push && pushRequest) {
      assertNoFork(this.headHash, pushRequest.priorHeadHash);
      const acceptedHashes = blobs
        .filter((blob) => !exchangeResponse.push!.rejectedBlobIds.includes(blob.blobId))
        .map((blob) => blob.blobHash);
      for (const blob of blobs) {
        if (!exchangeResponse.push.rejectedBlobIds.includes(blob.blobId)) {
          this.seenBlobIds.add(blob.blobId);
          this.blobHashById.set(blob.blobId, blob.blobHash);
        }
      }
      if (acceptedHashes.length > 0) {
        this.headHash = computeHeadHash(this.headHash, acceptedHashes);
      }
    }

    const pullResponse = exchangeResponse.pull;
    if (!pullResponse) {
      return { envelopes: [], headHash: this.headHash, pulledBlobIds: [] };
    }

    const envelopes = this.ingestRemoteBlobs(pullResponse.blobs, pullResponse.merkleRoot);
    return {
      envelopes,
      headHash: pullResponse.headHash,
      pulledBlobIds: pullResponse.blobs.map((blob) => blob.blobId),
    };
  }

  handleIncomingExchange(request: SyncRelayExchangeRequest): SyncRelayExchangeResponse {
    syncRelayExchangeRequestSchema.parse(request);
    const response: SyncRelayExchangeResponse = {};

    if (request.push) {
      assertNoFork(this.headHash, request.push.priorHeadHash);
      const accepted: string[] = [];
      const rejected: string[] = [];
      for (const blob of request.push.blobs) {
        try {
          assertNoSubstitution(blob);
          assertNoReplay(blob.blobId, this.seenBlobIds);
          this.seenBlobIds.add(blob.blobId);
          this.blobHashById.set(blob.blobId, blob.blobHash);
          this.relayBlobStore.set(blob.blobId, blob);
          accepted.push(blob.blobHash);
        } catch {
          rejected.push(blob.blobId);
        }
      }
      if (accepted.length > 0) {
        this.headHash = computeHeadHash(this.headHash, accepted);
        this.recomputeMerkleRoot();
      }
      response.push = {
        accepted: accepted.length,
        headHash: this.headHash,
        rejectedBlobIds: rejected,
      };
    }

    if (request.pull) {
      const sinceLamport = request.pull.sinceLamport ?? 0;
      const blobs = [...this.relayBlobStore.values()].filter(
        (blob) => blob.lamportClock > sinceLamport,
      );
      response.pull = {
        blobs,
        headHash: this.headHash,
        merkleRoot: this.merkleRoot,
      };
    }

    return syncRelayExchangeResponseSchema.parse(response);
  }
}

export function createSyncRelayClient(options: SyncRelayClientOptions): SyncRelayClient {
  return new SyncRelayClient(options);
}
