import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionDestinationPolicyInput } from '@semblance/kernel';
import { decideExecutionDestination } from '@semblance/kernel';
import { CloudBroker } from '../src/broker.js';
import type {
  ExecutionRequest,
  GatewayOpaqueTransport,
  LocalExecutionTransport,
} from '../src/types.js';

function basePolicy(overrides: Partial<ExecutionDestinationPolicyInput> = {}): ExecutionDestinationPolicyInput {
  return {
    sensitivity: 20,
    localFeasibility: true,
    destinationTrust: {
      byo: 'verified',
      selfHosted: 'verified',
      confidential: 'none',
    },
    userPreference: 'auto',
    disclosureCeiling: 80,
    attestationAvailable: false,
    localOnlyKillSwitch: false,
    explicitConsent: true,
    ...overrides,
  };
}

function baseRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    requestId: 'req-1',
    messages: [{ role: 'user', content: 'Summarize my inbox' }],
    maxTokens: 512,
    temperature: 0.5,
    subagentId: 'sub-1',
    domain: 'email',
    taskType: 'summarize',
    policyInput: basePolicy(),
    excludedCategories: [],
    provider: 'openai',
    model: 'gpt-4o-mini',
    ...overrides,
  };
}

describe('CloudBroker', () => {
  let localTransport: LocalExecutionTransport;
  let gatewayTransport: GatewayOpaqueTransport;

  beforeEach(() => {
    localTransport = {
      execute: vi.fn(async () => ({
        content: 'local answer',
        tokensUsed: { prompt: 10, completion: 20, total: 30 },
        model: 'local-model',
        provider: 'local',
      })),
    };

    gatewayTransport = {
      execute: vi.fn(async (request) => ({
        content: `${request.destination} answer`,
        tokensUsed: { prompt: 12, completion: 18, total: 30 },
        model: request.model,
        provider: request.provider,
        responseContentHash: 'abc123',
        disclosureReceipt: {
          schemaVersion: 1,
          label: request.destination === 'byo' ? 'byo' : 'self_hosted',
          requestId: request.requestId,
          destination: request.destination,
          provider: request.provider,
          model: request.model,
          promptContentHash: request.promptContentHash,
          responseContentHash: 'abc123',
          timestamp: new Date().toISOString(),
          tokensUsed: { prompt: 12, completion: 18, total: 30 },
        },
      })),
      executeConfidential: vi.fn(async () => {
        throw new Error('executeConfidential not expected in this test');
      }),
    };
  });

  it('returns ask when policy requires consent', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
    });

    const result = await broker.execute(baseRequest({
      policyInput: basePolicy({
        userPreference: 'byo',
        explicitConsent: false,
      }),
    }));

    expect(result.status).toBe('ask');
    if (result.status === 'ask') {
      expect(result.requiresConsent).toBe(true);
      expect(result.reason).toBe('explicit_consent_required');
    }
  });

  it('returns reject when policy rejects remote execution', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
    });

    const result = await broker.execute(baseRequest({
      policyInput: basePolicy({
        userPreference: 'byo',
        sensitivity: 95,
        disclosureCeiling: 50,
        explicitConsent: true,
      }),
    }));

    expect(result.status).toBe('reject');
    if (result.status === 'reject') {
      expect(result.reason).toBe('sensitivity_exceeds_disclosure_ceiling');
    }
  });

  it('executes locally when policy selects local', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
    });

    const result = await broker.execute(baseRequest({
      policyInput: basePolicy({ userPreference: 'local' }),
    }));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('local');
      expect(result.content).toBe('local answer');
      expect(result.disclosureReceipt).toBeUndefined();
    }
    expect(localTransport.execute).toHaveBeenCalledOnce();
    expect(gatewayTransport.execute).not.toHaveBeenCalled();
  });

  it('executes through BYO gateway transport with disclosure receipt', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
    });

    const result = await broker.execute(baseRequest({
      policyInput: basePolicy({
        userPreference: 'byo',
        localFeasibility: false,
        explicitConsent: true,
      }),
    }));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('byo');
      expect(result.disclosureReceipt?.label).toBe('byo');
      expect(result.disclosureReceipt?.destination).toBe('byo');
    }
    expect(gatewayTransport.execute).toHaveBeenCalledOnce();
  });

  it('executes through self-hosted gateway transport', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
    });

    const result = await broker.execute(baseRequest({
      selfHostedNodeId: 'node-a',
      policyInput: basePolicy({
        userPreference: 'self_hosted',
        localFeasibility: false,
        explicitConsent: true,
      }),
    }));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('self_hosted');
      expect(result.disclosureReceipt?.label).toBe('self_hosted');
    }
  });
});
