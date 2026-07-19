import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import {
  createDefaultExecutionDestinationPolicy,
  loadExecutionDestinationPolicy,
  normalizeExecutionDestinationPolicy,
  saveExecutionDestinationPolicy,
} from '../src/destination-policy-store.js';
import { createExecutionReceiptStore } from '../src/execution-receipt-store.js';
import { buildExecutionPolicyInput } from '../src/policy-input-builder.js';

describe('destination policy store', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns defaults when file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'policy-store-'));
    tempDirs.push(dir);
    const policy = loadExecutionDestinationPolicy(join(dir, 'missing.json'));
    expect(policy.schemaVersion).toBe(1);
    expect(policy.capabilities['chat.reasoning'].destinationPreference).toBe('local');
  });

  it('persists updates to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'policy-store-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'execution-destination-policy.json');
    const initial = normalizeExecutionDestinationPolicy({
      ...createDefaultExecutionDestinationPolicy(),
      capabilities: {
        ...createDefaultExecutionDestinationPolicy().capabilities,
        'email.triage': {
          ...createDefaultExecutionDestinationPolicy().capabilities['email.triage'],
          destinationPreference: 'byo',
        },
      },
    });
    saveExecutionDestinationPolicy(filePath, initial);

    const reloaded = loadExecutionDestinationPolicy(filePath);
    expect(reloaded.capabilities['email.triage'].destinationPreference).toBe('byo');
  });

  it('builds kernel policy input from stored capability config', () => {
    const policyDocument = normalizeExecutionDestinationPolicy({
      schemaVersion: 1,
      localOnlyKillSwitch: true,
      capabilities: {
        'chat.reasoning': {
          destinationPreference: 'ask',
          disclosureCeiling: 42,
          modelClass: 'reasoning',
          budgetCents: 900,
          latencyMaxMs: 12_000,
        },
      },
      updatedAt: new Date().toISOString(),
    });

    const input = buildExecutionPolicyInput({
      policyDocument,
      domain: 'chat',
      taskType: 'reasoning',
      sensitivity: 10,
      localFeasibility: true,
      destinationTrust: { byo: 'verified', selfHosted: 'verified', confidential: 'none' },
      explicitConsent: false,
      estimatedCostCents: 100,
      estimatedLatencyMs: 2_000,
    });

    expect(input.userPreference).toBe('ask');
    expect(input.disclosureCeiling).toBe(42);
    expect(input.localOnlyKillSwitch).toBe(true);
    expect(input.cost?.budgetCents).toBe(900);
    expect(input.latency?.maxMs).toBe(12_000);
  });
});

describe('execution receipt store', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('appends and lists recent receipts newest-first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'receipt-store-'));
    tempDirs.push(dir);
    const store = createExecutionReceiptStore(join(dir, 'execution-receipts.json'));

    store.append({
      id: 'r1',
      requestId: 'req-1',
      capabilityId: 'chat.reasoning',
      domain: 'chat',
      taskType: 'reasoning',
      status: 'success',
      destination: 'local',
      reason: 'local_preferred_and_feasible',
      timestamp: '2026-07-18T10:00:00.000Z',
      model: 'local-primary',
      provider: 'local',
      disclosureReceipt: null,
    });

    store.append({
      id: 'r2',
      requestId: 'req-2',
      capabilityId: 'chat.reasoning',
      domain: 'chat',
      taskType: 'reasoning',
      status: 'ask',
      destination: null,
      reason: 'explicit_consent_required',
      timestamp: '2026-07-18T11:00:00.000Z',
      model: null,
      provider: null,
      disclosureReceipt: null,
    });

    const receipts = store.listRecent(5);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.id).toBe('r2');

    const persisted = JSON.parse(readFileSync(join(dir, 'execution-receipts.json'), 'utf8')) as {
      receipts: Array<{ id: string }>;
    };
    expect(persisted.receipts).toHaveLength(2);
  });
});
