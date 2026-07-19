import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionDestinationPolicyInput } from '@semblance/kernel';
import { decideExecutionDestination } from '@semblance/kernel';
import { CloudBroker } from '@semblance/cloud-broker';
import type {
  ExecutionRequest,
  GatewayOpaqueTransport,
  LocalExecutionTransport,
} from '@semblance/cloud-broker';
import {
  buildExecutionPolicyInput,
  createDefaultExecutionDestinationPolicy,
  normalizeExecutionDestinationPolicy,
  saveExecutionDestinationPolicy,
  type CapabilityDestinationPreference,
} from '@semblance/cloud-broker';
import { readdirSync, readFileSync as readFile, statSync } from 'node:fs';

const FIXED_DOMAIN = 'chat';
const FIXED_TASK_TYPE = 'reasoning';
const FIXED_MESSAGES = [{ role: 'user', content: 'Summarize the quarterly budget for my team.' }];

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

const BANNED_NETWORK_IMPORTS = [
  /import\s+.*\bfrom\s+['"](?:node:)?https?['"]/,
  /import\s+.*\bfrom\s+['"](?:node:)?net['"]/,
  /import\s+.*\bfrom\s+['"]axios['"]/,
  /import\s+.*\bfrom\s+['"]got['"]/,
  /import\s+.*\bfrom\s+['"]node-fetch['"]/,
  /import\s+.*\bfrom\s+['"]undici['"]/,
  /import\s+.*\bfrom\s+['"]socket\.io['"]/,
  /import\s+.*\bfrom\s+['"]ws['"]/,
];

function baseTrust() {
  return {
    byo: 'verified' as const,
    selfHosted: 'verified' as const,
    confidential: 'none' as const,
  };
}

function policyWithPreference(
  preference: CapabilityDestinationPreference,
  capabilityOverrides: Partial<{
    disclosureCeiling: number;
    budgetCents: number;
    latencyMaxMs: number;
  }> = {},
) {
  const base = createDefaultExecutionDestinationPolicy();
  return normalizeExecutionDestinationPolicy({
    ...base,
    capabilities: {
      ...base.capabilities,
      'chat.reasoning': {
        ...base.capabilities['chat.reasoning'],
        destinationPreference: preference,
        ...capabilityOverrides,
      },
    },
  });
}

function fixedRequest(
  policyInput: ExecutionDestinationPolicyInput,
  overrides: Partial<ExecutionRequest> = {},
): ExecutionRequest {
  return {
    requestId: 'slice8-fixed-task',
    messages: FIXED_MESSAGES,
    maxTokens: 256,
    temperature: 0.2,
    subagentId: 'slice8-subagent',
    domain: FIXED_DOMAIN,
    taskType: FIXED_TASK_TYPE,
    policyInput,
    excludedCategories: [],
    provider: 'openai',
    model: 'gpt-4o-mini',
    selfHostedNodeId: 'node-a',
    ...overrides,
  };
}

describe('Slice 8 exit gate — CloudBroker destination routing', () => {
  let localTransport: LocalExecutionTransport;
  let gatewayTransport: GatewayOpaqueTransport;
  let tempDirs: string[] = [];

  beforeEach(() => {
    localTransport = {
      execute: vi.fn(async () => ({
        content: 'local slice8 answer',
        tokensUsed: { prompt: 8, completion: 16, total: 24 },
        model: 'local-primary',
        provider: 'local',
      })),
    };

    gatewayTransport = {
      execute: vi.fn(async (request) => ({
        content: `${request.destination} slice8 answer`,
        tokensUsed: { prompt: 10, completion: 20, total: 30 },
        model: request.model,
        provider: request.provider,
        responseContentHash: 'response-hash-slice8',
        disclosureReceipt: {
          schemaVersion: 1,
          label: request.destination === 'byo' ? 'byo' : 'self_hosted',
          requestId: request.requestId,
          destination: request.destination,
          provider: request.provider,
          model: request.model,
          promptContentHash: request.promptContentHash,
          responseContentHash: 'response-hash-slice8',
          timestamp: new Date().toISOString(),
          tokensUsed: { prompt: 10, completion: 20, total: 30 },
        },
      })),
      executeConfidential: vi.fn(async () => {
        throw new Error('executeConfidential not expected in slice8 exit gate');
      }),
    };
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function createBroker() {
    return new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
    });
  }

  it('fixed task runs local when policy says local', async () => {
    const broker = createBroker();
    const policyDocument = policyWithPreference('local');

    const result = await broker.execute(fixedRequest(buildExecutionPolicyInput({
      policyDocument,
      domain: FIXED_DOMAIN,
      taskType: FIXED_TASK_TYPE,
      sensitivity: 20,
      localFeasibility: true,
      destinationTrust: baseTrust(),
      explicitConsent: true,
    })));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('local');
      expect(result.content).toBe('local slice8 answer');
    }
    expect(localTransport.execute).toHaveBeenCalledOnce();
    expect(gatewayTransport.execute).not.toHaveBeenCalled();
  });

  it('fixed task runs self_hosted when policy says self_hosted', async () => {
    const broker = createBroker();
    const policyDocument = policyWithPreference('self_hosted');

    const result = await broker.execute(fixedRequest(buildExecutionPolicyInput({
      policyDocument,
      domain: FIXED_DOMAIN,
      taskType: FIXED_TASK_TYPE,
      sensitivity: 20,
      localFeasibility: true,
      destinationTrust: baseTrust(),
      explicitConsent: true,
    })));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('self_hosted');
      expect(result.disclosureReceipt?.label).toBe('self_hosted');
    }
    expect(gatewayTransport.execute).toHaveBeenCalledOnce();
    expect(localTransport.execute).not.toHaveBeenCalled();
  });

  it('fixed task runs BYO when policy says byo', async () => {
    const broker = createBroker();
    const policyDocument = policyWithPreference('byo');

    const result = await broker.execute(fixedRequest(buildExecutionPolicyInput({
      policyDocument,
      domain: FIXED_DOMAIN,
      taskType: FIXED_TASK_TYPE,
      sensitivity: 20,
      localFeasibility: true,
      destinationTrust: baseTrust(),
      explicitConsent: true,
    })));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('byo');
      expect(result.disclosureReceipt?.label).toBe('byo');
    }
    expect(gatewayTransport.execute).toHaveBeenCalledOnce();
  });

  it('without consent, remote preference returns ask (not auto-execute)', async () => {
    const broker = createBroker();
    const policyDocument = policyWithPreference('byo');

    const result = await broker.execute(fixedRequest(buildExecutionPolicyInput({
      policyDocument,
      domain: FIXED_DOMAIN,
      taskType: FIXED_TASK_TYPE,
      sensitivity: 20,
      localFeasibility: true,
      destinationTrust: baseTrust(),
      explicitConsent: false,
    })));

    expect(result.status).toBe('ask');
    if (result.status === 'ask') {
      expect(result.requiresConsent).toBe(true);
      expect(result.reason).toBe('explicit_consent_required');
    }
    expect(localTransport.execute).not.toHaveBeenCalled();
    expect(gatewayTransport.execute).not.toHaveBeenCalled();
  });

  it('kernel rejects when sensitivity exceeds disclosure ceiling', async () => {
    const broker = createBroker();
    const policyDocument = policyWithPreference('byo', { disclosureCeiling: 30 });

    const result = await broker.execute(fixedRequest(buildExecutionPolicyInput({
      policyDocument,
      domain: FIXED_DOMAIN,
      taskType: FIXED_TASK_TYPE,
      sensitivity: 95,
      localFeasibility: true,
      destinationTrust: baseTrust(),
      explicitConsent: true,
    })));

    expect(result.status).toBe('reject');
    if (result.status === 'reject') {
      expect(result.reason).toBe('sensitivity_exceeds_disclosure_ceiling');
    }
  });

  it('persists destination policy through JSON store (live read/write path)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slice8-policy-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'execution-destination-policy.json');
    const saved = saveExecutionDestinationPolicy(filePath, policyWithPreference('self_hosted'));
    const reloaded = JSON.parse(readFileSync(filePath, 'utf8')) as {
      capabilities: Record<string, { destinationPreference: string }>;
    };
    expect(reloaded.capabilities['chat.reasoning'].destinationPreference).toBe('self_hosted');
    expect(saved.capabilities['chat.reasoning'].destinationPreference).toBe('self_hosted');
  });
});

describe('Slice 8 exit gate — Core + cloud-broker socket ban', () => {
  const root = join(import.meta.dirname, '..', '..');

  it('packages/core has no banned network socket imports', () => {
    const coreFiles = findTsFiles(join(root, 'packages/core'));
    const approved = new Set([
      join(root, 'packages/core/ipc/socket-transport.ts').replace(/\\/g, '/'),
    ]);
    const violations: string[] = [];

    for (const file of coreFiles) {
      const normalized = file.replace(/\\/g, '/');
      if (approved.has(normalized)) continue;
      const content = readFile(file, 'utf8');
      for (const pattern of BANNED_NETWORK_IMPORTS) {
        if (pattern.test(content)) {
          violations.push(`${normalized}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('packages/cloud-broker has no banned network socket imports', () => {
    const brokerFiles = findTsFiles(join(root, 'packages/cloud-broker/src'));
    const violations: string[] = [];

    for (const file of brokerFiles) {
      const content = readFile(file, 'utf8');
      for (const pattern of BANNED_NETWORK_IMPORTS) {
        if (pattern.test(content)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('Slice 8 exit gate — dependent package suites', () => {
  it('kernel execution-destination-policy suite is present', () => {
    const testPath = join(import.meta.dirname, '../../packages/kernel/tests/execution-destination-policy.test.ts');
    expect(statSync(testPath).isFile()).toBe(true);
  });

  it('protocol execution-v1 suite is present', () => {
    const testPath = join(import.meta.dirname, '../../packages/protocol/tests/execution-v1.test.ts');
    expect(statSync(testPath).isFile()).toBe(true);
  });

  it('cloud-broker unit suite is present', () => {
    const testPath = join(import.meta.dirname, '../../packages/cloud-broker/tests/broker.test.ts');
    expect(statSync(testPath).isFile()).toBe(true);
  });

  it('semblance-node conformance path is available', () => {
    const nodeRoot = join(import.meta.dirname, '../../../semblance-node');
    const conformancePath = join(nodeRoot, 'tests/conformance.test.ts');
    expect(statSync(conformancePath).isFile()).toBe(true);
  });
});
