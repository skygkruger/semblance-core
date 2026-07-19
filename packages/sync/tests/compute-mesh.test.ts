import { describe, expect, it } from 'vitest';
import {
  ComputeMeshRouter,
  ComputeNotDataAuthoritativeError,
  assertComputeNotDataAuthoritative,
  buildComputeExecutionReceipt,
  generateEd25519KeyMaterial,
} from '../src/index.js';

describe('@semblance/sync compute mesh', () => {
  it('routes heavy tasks to healthier desktop peer', () => {
    const router = new ComputeMeshRouter({
      localDeviceId: 'device-phone-001',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      localHealth: {
        reachable: true,
        batteryPercent: 40,
        memoryPressure: 'normal',
        lastSeenAt: new Date().toISOString(),
      },
    });

    router.registerPeer(
      {
        deviceId: 'device-desktop-001',
        deviceType: 'desktop',
        reachable: true,
        modelTier: '7B',
        memoryPressure: 'normal',
        lastSeenAt: new Date().toISOString(),
      },
      {
        deviceId: 'device-desktop-001',
        supportsInference: true,
        supportsEmbedding: true,
        supportsAnalysis: true,
        maxContextTokens: 8192,
      },
    );

    const decision = router.routeTask({
      taskType: 'inference',
      complexity: 'heavy',
      computePayload: { taskRef: 'meeting_prep', inputHash: 'abc123' },
    });

    expect(decision.targetDeviceId).toBe('device-desktop-001');
    expect(decision.score).toBeGreaterThan(0);
  });

  it('asserts compute node is never data-authoritative', () => {
    expect(() =>
      assertComputeNotDataAuthoritative({ sourceData: 'secret' }),
    ).toThrow(ComputeNotDataAuthoritativeError);

    expect(() =>
      buildComputeExecutionReceipt({
        receiptId: 'receipt-001',
        taskType: 'inference',
        executedOnDeviceId: 'device-desktop-001',
        executedOnDeviceType: 'desktop',
        modelId: 'llama-3.2-3b-q4',
        modelProvenance: 'local-ollama',
        computePayload: { vaultPlaintext: 'must-not' },
        routeReason: 'test',
        devicePrivateKey: generateEd25519KeyMaterial().privateKey,
      }),
    ).toThrow(ComputeNotDataAuthoritativeError);
  });

  it('builds signed execution receipt with device/model provenance', () => {
    const keys = generateEd25519KeyMaterial();
    const receipt = buildComputeExecutionReceipt({
      receiptId: 'receipt-mesh-001',
      taskType: 'analysis',
      executedOnDeviceId: 'device-desktop-001',
      executedOnDeviceType: 'desktop',
      modelId: 'llama-3.1-8b-q4',
      modelProvenance: 'local-ollama:11434',
      computePayload: { taskRef: 'document.analyze', inputHash: 'deadbeef' },
      routeReason: 'Desktop selected by capability score',
      devicePrivateKey: keys.privateKey,
    });

    expect(receipt.payload.dataAuthoritative).toBe(false);
    expect(receipt.payload.modelId).toBe('llama-3.1-8b-q4');
    expect(receipt.payload.modelProvenance).toContain('local-ollama');
    expect(receipt.signature.length).toBeGreaterThan(0);
  });
});
