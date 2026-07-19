import { createHash } from 'node:crypto';
import { signPayload, canonicalizeRecord } from '../crypto/ed25519.js';

export interface DeviceHealthSnapshot {
  readonly deviceId: string;
  readonly deviceType: 'desktop' | 'mobile' | 'self_hosted' | 'cloud';
  readonly reachable: boolean;
  readonly modelTier: '1.5B' | '3B' | '7B' | 'none';
  readonly batteryPercent?: number;
  readonly memoryPressure?: 'normal' | 'warning' | 'critical';
  readonly lastSeenAt: string;
}

export interface ComputeCapabilityProfile {
  readonly deviceId: string;
  readonly supportsInference: boolean;
  readonly supportsEmbedding: boolean;
  readonly supportsAnalysis: boolean;
  readonly maxContextTokens: number;
}

export interface ComputeRouteDecision {
  readonly targetDeviceId: string;
  readonly targetDeviceType: DeviceHealthSnapshot['deviceType'];
  readonly reason: string;
  readonly degraded: boolean;
  readonly score: number;
}

export interface ComputeMeshRouterOptions {
  readonly localDeviceId: string;
  readonly localDeviceType: DeviceHealthSnapshot['deviceType'];
  readonly localModelTier: DeviceHealthSnapshot['modelTier'];
  readonly localHealth: Omit<DeviceHealthSnapshot, 'deviceId' | 'deviceType' | 'modelTier'>;
}

export class ComputeNotDataAuthoritativeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComputeNotDataAuthoritativeError';
  }
}

const COMPUTE_FORBIDDEN_DATA_FIELDS = [
  'canonicalPayload',
  'sourceData',
  'vaultPlaintext',
  'userContent',
  'rawDocument',
] as const;

export function assertComputeNotDataAuthoritative(payload: unknown): void {
  if (payload === null || typeof payload !== 'object') {
    return;
  }
  const record = payload as Record<string, unknown>;
  for (const field of COMPUTE_FORBIDDEN_DATA_FIELDS) {
    if (field in record) {
      throw new ComputeNotDataAuthoritativeError(
        `Compute node must not carry authoritative source data field: ${field}`,
      );
    }
  }
  if (record.dataAuthoritative === true) {
    throw new ComputeNotDataAuthoritativeError(
      'Compute node must not be marked dataAuthoritative',
    );
  }
}

function scoreDevice(
  local: ComputeMeshRouterOptions,
  peer: DeviceHealthSnapshot,
  capability: ComputeCapabilityProfile,
  taskType: 'inference' | 'embedding' | 'analysis',
): number {
  if (!peer.reachable) {
    return -1;
  }

  let score = 0;
  if (taskType === 'inference' && capability.supportsInference) score += 40;
  if (taskType === 'embedding' && capability.supportsEmbedding) score += 30;
  if (taskType === 'analysis' && capability.supportsAnalysis) score += 35;

  const tierScores: Record<DeviceHealthSnapshot['modelTier'], number> = {
    '7B': 30,
    '3B': 20,
    '1.5B': 10,
    none: 0,
  };
  score += tierScores[peer.modelTier];

  if (peer.deviceType === 'desktop') score += 15;
  if (peer.deviceType === 'self_hosted') score += 10;
  if (peer.memoryPressure === 'critical') score -= 25;
  if (peer.memoryPressure === 'warning') score -= 10;
  if (peer.batteryPercent !== undefined && peer.batteryPercent < 20) score -= 15;

  if (peer.deviceId === local.localDeviceId) {
    score += 5;
  }

  return score;
}

export class ComputeMeshRouter {
  private readonly options: ComputeMeshRouterOptions;
  private peers: DeviceHealthSnapshot[] = [];
  private capabilities = new Map<string, ComputeCapabilityProfile>();

  constructor(options: ComputeMeshRouterOptions) {
    this.options = options;
  }

  registerPeer(health: DeviceHealthSnapshot, capability: ComputeCapabilityProfile): void {
    this.peers = [...this.peers.filter((p) => p.deviceId !== health.deviceId), health];
    this.capabilities.set(capability.deviceId, capability);
  }

  clearPeer(deviceId: string): void {
    this.peers = this.peers.filter((p) => p.deviceId !== deviceId);
    this.capabilities.delete(deviceId);
  }

  routeTask(params: {
    taskType: 'inference' | 'embedding' | 'analysis';
    complexity: 'lightweight' | 'medium' | 'heavy';
    computePayload: unknown;
  }): ComputeRouteDecision {
    assertComputeNotDataAuthoritative(params.computePayload);

    const localHealth: DeviceHealthSnapshot = {
      deviceId: this.options.localDeviceId,
      deviceType: this.options.localDeviceType,
      modelTier: this.options.localModelTier,
      ...this.options.localHealth,
    };

    const localCapability: ComputeCapabilityProfile = {
      deviceId: this.options.localDeviceId,
      supportsInference: this.options.localModelTier !== 'none',
      supportsEmbedding: this.options.localModelTier !== 'none',
      supportsAnalysis: this.options.localModelTier === '7B' || this.options.localModelTier === '3B',
      maxContextTokens: this.options.localModelTier === '7B' ? 8192 : 4096,
    };

    const candidates: Array<{ health: DeviceHealthSnapshot; capability: ComputeCapabilityProfile }> = [
      { health: localHealth, capability: localCapability },
      ...this.peers.map((health) => ({
        health,
        capability: this.capabilities.get(health.deviceId) ?? {
          deviceId: health.deviceId,
          supportsInference: false,
          supportsEmbedding: false,
          supportsAnalysis: false,
          maxContextTokens: 0,
        },
      })),
    ];

    let best: ComputeRouteDecision | null = null;

    for (const candidate of candidates) {
      const score = scoreDevice(
        this.options,
        candidate.health,
        candidate.capability,
        params.taskType,
      );
      if (score < 0) {
        continue;
      }

      if (params.complexity === 'lightweight' && candidate.health.deviceId !== this.options.localDeviceId) {
        continue;
      }

      if (!best || score > best.score) {
        best = {
          targetDeviceId: candidate.health.deviceId,
          targetDeviceType: candidate.health.deviceType,
          reason:
            candidate.health.deviceId === this.options.localDeviceId
              ? 'Local device selected by compute mesh router'
              : `Peer ${candidate.health.deviceId} selected by capability and health score ${score}`,
          degraded:
            params.complexity === 'heavy'
            && candidate.capability.maxContextTokens < 8192
            && candidate.health.deviceId === this.options.localDeviceId,
          score,
        };
      }
    }

    if (!best) {
      return {
        targetDeviceId: this.options.localDeviceId,
        targetDeviceType: this.options.localDeviceType,
        reason: 'No reachable peer — fallback to local degraded execution',
        degraded: true,
        score: 0,
      };
    }

    return best;
  }
}

export interface ComputeExecutionReceiptPayload {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly taskType: 'inference' | 'embedding' | 'analysis';
  readonly executedOnDeviceId: string;
  readonly executedOnDeviceType: DeviceHealthSnapshot['deviceType'];
  readonly modelId: string;
  readonly modelProvenance: string;
  readonly dataAuthoritative: false;
  readonly payloadHash: string;
  readonly completedAt: string;
  readonly routeReason: string;
}

export interface ComputeExecutionReceipt {
  readonly schemaVersion: 1;
  readonly payload: ComputeExecutionReceiptPayload;
  readonly signature: string;
}

export function hashComputePayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

export function buildComputeExecutionReceipt(params: {
  receiptId: string;
  taskType: ComputeExecutionReceiptPayload['taskType'];
  executedOnDeviceId: string;
  executedOnDeviceType: DeviceHealthSnapshot['deviceType'];
  modelId: string;
  modelProvenance: string;
  computePayload: unknown;
  routeReason: string;
  devicePrivateKey: string;
  completedAt?: string;
}): ComputeExecutionReceipt {
  assertComputeNotDataAuthoritative(params.computePayload);

  const payload: ComputeExecutionReceiptPayload = {
    schemaVersion: 1,
    receiptId: params.receiptId,
    taskType: params.taskType,
    executedOnDeviceId: params.executedOnDeviceId,
    executedOnDeviceType: params.executedOnDeviceType,
    modelId: params.modelId,
    modelProvenance: params.modelProvenance,
    dataAuthoritative: false,
    payloadHash: hashComputePayload(params.computePayload),
    completedAt: params.completedAt ?? new Date().toISOString(),
    routeReason: params.routeReason,
  };

  const signature = signPayload(
    canonicalizeRecord(payload as unknown as Record<string, unknown>),
    params.devicePrivateKey,
  );

  return { schemaVersion: 1, payload, signature };
}

export function createComputeMeshRouter(options: ComputeMeshRouterOptions): ComputeMeshRouter {
  return new ComputeMeshRouter(options);
}
