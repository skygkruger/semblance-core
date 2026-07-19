// Sovereign Node Client — Mobile peer integration with @semblance/sync.
//
// Wraps Sovereignty Root, encrypted event sync, and compute mesh routing
// using the same Vault/Kernel contracts as desktop via platform adapters.
//
// CRITICAL: No ambient network imports. Relay/direct transport is injected.

import {
  SovereigntyRootService,
  SyncEventService,
  SyncRelayClient,
  ComputeMeshRouter,
  buildComputeExecutionReceipt,
  createMemorySyncSecureStorage,
  createSyncSecureStorageAdapter,
  getOrCreateDeviceKeys,
  openMembershipStore,
  type ComputeExecutionReceipt,
  type ComputeRouteDecision,
  type DirectPeerTransport,
  type RevocationEnforcementResult,
  type SovereigntyRootStatus,
  type SyncRelayTransport,
  type SyncSecureStorageAdapter,
} from '@semblance/sync';
import type { SyncEnvelopeV1 } from '@semblance/protocol';

export interface SovereignNodeClientOptions {
  readonly dataDir: string;
  readonly secureStorage?: SyncSecureStorageAdapter;
  readonly deviceType?: 'mobile' | 'desktop';
  readonly modelTier?: '1.5B' | '3B' | '7B' | 'none';
  readonly relayTransport?: SyncRelayTransport;
  readonly directPeerTransport?: DirectPeerTransport;
}

export interface SovereignNodeStatus {
  readonly root: SovereigntyRootStatus;
  readonly syncReady: boolean;
  readonly computeReady: boolean;
}

export class SovereignNodeClient {
  private readonly dataDir: string;
  private readonly secureStorage: SyncSecureStorageAdapter;
  private readonly deviceType: 'mobile' | 'desktop';
  private readonly modelTier: '1.5B' | '3B' | '7B' | 'none';
  private readonly relayTransport?: SyncRelayTransport;
  private readonly directPeerTransport?: DirectPeerTransport;

  private rootService: SovereigntyRootService | null = null;
  private eventService: SyncEventService | null = null;
  private relayClient: SyncRelayClient | null = null;
  private computeRouter: ComputeMeshRouter | null = null;
  private membershipStore: ReturnType<typeof openMembershipStore> | null = null;

  private constructor(options: SovereignNodeClientOptions) {
    this.dataDir = options.dataDir;
    this.secureStorage = options.secureStorage ?? createMemorySyncSecureStorage();
    this.deviceType = options.deviceType ?? 'mobile';
    this.modelTier = options.modelTier ?? '3B';
    this.relayTransport = options.relayTransport;
    this.directPeerTransport = options.directPeerTransport;
  }

  static async initialize(options: SovereignNodeClientOptions): Promise<SovereignNodeClient> {
    const client = new SovereignNodeClient(options);
    await client.bootstrap();
    return client;
  }

  private async bootstrap(): Promise<void> {
    this.rootService = await SovereigntyRootService.initialize({
      dataDir: this.dataDir,
      secureStorage: this.secureStorage,
    });

    this.membershipStore = openMembershipStore(this.dataDir);
    this.eventService = await SyncEventService.initialize({
      dataDir: this.dataDir,
      secureStorage: this.secureStorage,
      membershipStore: this.membershipStore,
    });

    const status = await this.rootService.getStatus();
    const deviceKeys = await getOrCreateDeviceKeys(this.secureStorage);

    this.computeRouter = new ComputeMeshRouter({
      localDeviceId: deviceKeys.deviceId,
      localDeviceType: this.deviceType,
      localModelTier: this.modelTier,
      localHealth: {
        reachable: true,
        batteryPercent: 100,
        memoryPressure: 'normal',
        lastSeenAt: new Date().toISOString(),
      },
    });

    if (this.relayTransport) {
      this.relayClient = new SyncRelayClient({
        rootId: status.rootId,
        deviceId: deviceKeys.deviceId,
        membershipEpoch: status.membershipEpoch,
        relayTransport: this.relayTransport,
        directPeerTransport: this.directPeerTransport,
      });
    }
  }

  async getStatus(): Promise<SovereignNodeStatus> {
    if (!this.rootService) {
      throw new Error('Sovereign node client is not initialized');
    }
    return {
      root: await this.rootService.getStatus(),
      syncReady: this.eventService !== null,
      computeReady: this.computeRouter !== null,
    };
  }

  async addPeerDevice(params: {
    deviceId: string;
    devicePublicKey: string;
    authorizedByDeviceIds: string[];
  }): Promise<SovereigntyRootStatus> {
    if (!this.rootService) {
      throw new Error('Sovereign node client is not initialized');
    }
    await this.rootService.addDevice(params);
    return this.rootService.getStatus();
  }

  async revokePeerDevice(params: {
    deviceId: string;
    authorizedByDeviceIds: string[];
  }): Promise<RevocationEnforcementResult> {
    if (!this.rootService) {
      throw new Error('Sovereign node client is not initialized');
    }
    return this.rootService.revokeDevice(params);
  }

  async pushVaultEvents(params: {
    domainId: string;
    events: Array<{ eventType: string; payload: unknown }>;
  }): Promise<readonly SyncEnvelopeV1[]> {
    if (!this.eventService) {
      throw new Error('Sync event service is not initialized');
    }
    const result = await this.eventService.pushEvents(params);
    return result.pushed;
  }

  async mergeIncomingEnvelopes(envelopes: readonly SyncEnvelopeV1[]): Promise<number> {
    if (!this.eventService) {
      throw new Error('Sync event service is not initialized');
    }
    const result = await this.eventService.pullMerge({
      incomingEnvelopes: envelopes,
      createCheckpoint: true,
    });
    return result.appliedEventIds.length;
  }

  async syncViaRelay(): Promise<readonly SyncEnvelopeV1[]> {
    if (!this.relayClient || !this.eventService) {
      throw new Error('Relay client is not configured');
    }
    const outgoing = this.eventService.listOutgoingEnvelopes();
    if (outgoing.length > 0) {
      await this.relayClient.pushViaRelay(outgoing);
    }
    const pulled = await this.relayClient.pullViaRelay();
    await this.mergeIncomingEnvelopes(pulled.envelopes);
    return pulled.envelopes;
  }

  routeComputeTask(params: {
    taskType: 'inference' | 'embedding' | 'analysis';
    complexity: 'lightweight' | 'medium' | 'heavy';
    computePayload: unknown;
  }): ComputeRouteDecision {
    if (!this.computeRouter) {
      throw new Error('Compute mesh router is not initialized');
    }
    return this.computeRouter.routeTask(params);
  }

  async buildExecutionReceipt(params: {
    receiptId: string;
    taskType: 'inference' | 'embedding' | 'analysis';
    modelId: string;
    modelProvenance: string;
    computePayload: unknown;
    routeReason: string;
  }): Promise<ComputeExecutionReceipt> {
    const deviceKeys = await getOrCreateDeviceKeys(this.secureStorage);
    return buildComputeExecutionReceipt({
      ...params,
      executedOnDeviceId: deviceKeys.deviceId,
      executedOnDeviceType: this.deviceType,
      devicePrivateKey: deviceKeys.privateKey,
    });
  }

  registerComputePeer(
    health: Parameters<ComputeMeshRouter['registerPeer']>[0],
    capability: Parameters<ComputeMeshRouter['registerPeer']>[1],
  ): void {
    this.computeRouter?.registerPeer(health, capability);
  }

  getEventService(): SyncEventService | null {
    return this.eventService;
  }

  getRootService(): SovereigntyRootService | null {
    return this.rootService;
  }

  async shutdown(): Promise<void> {
    this.eventService?.close();
    this.rootService?.close();
    this.membershipStore?.close();
    this.eventService = null;
    this.rootService = null;
    this.membershipStore = null;
    this.relayClient = null;
    this.computeRouter = null;
  }
}

export function createMobileSyncSecureStorageFromMap(
  initial: Record<string, string> = {},
): SyncSecureStorageAdapter {
  return createMemorySyncSecureStorage(initial);
}

export function createMobileSyncSecureStorageFromKeystore(
  keystore: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  },
): SyncSecureStorageAdapter {
  return createSyncSecureStorageAdapter(keystore);
}

export function createSovereignNodeClient(
  options: SovereignNodeClientOptions,
): Promise<SovereignNodeClient> {
  return SovereignNodeClient.initialize(options);
}
