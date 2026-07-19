import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { UserDestinationPreference } from '@semblance/kernel';

export type CapabilityDestinationPreference = 'local' | 'self_hosted' | 'byo' | 'ask';

export type CapabilityModelClass = 'fast' | 'balanced' | 'reasoning';

export interface CapabilityDestinationConfig {
  readonly destinationPreference: CapabilityDestinationPreference;
  readonly disclosureCeiling: number;
  readonly modelClass: CapabilityModelClass;
  readonly budgetCents: number;
  readonly latencyMaxMs: number;
}

export interface ExecutionDestinationPolicyDocument {
  readonly schemaVersion: 1;
  readonly localOnlyKillSwitch: boolean;
  readonly capabilities: Record<string, CapabilityDestinationConfig>;
  readonly updatedAt: string;
}

export const DEFAULT_CAPABILITY_IDS = [
  'chat.reasoning',
  'chat.summarize',
  'email.triage',
  'calendar.planning',
] as const;

const DEFAULT_CAPABILITY_CONFIG: CapabilityDestinationConfig = {
  destinationPreference: 'local',
  disclosureCeiling: 60,
  modelClass: 'balanced',
  budgetCents: 500,
  latencyMaxMs: 30_000,
};

export function createDefaultExecutionDestinationPolicy(): ExecutionDestinationPolicyDocument {
  const capabilities = Object.fromEntries(
    DEFAULT_CAPABILITY_IDS.map((capabilityId) => [capabilityId, { ...DEFAULT_CAPABILITY_CONFIG }]),
  ) as Record<string, CapabilityDestinationConfig>;

  return {
    schemaVersion: 1,
    localOnlyKillSwitch: false,
    capabilities,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeExecutionDestinationPolicy(
  input: unknown,
): ExecutionDestinationPolicyDocument {
  const defaults = createDefaultExecutionDestinationPolicy();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }

  const record = input as Partial<ExecutionDestinationPolicyDocument>;
  const capabilities: Record<string, CapabilityDestinationConfig> = { ...defaults.capabilities };

  if (record.capabilities && typeof record.capabilities === 'object') {
    for (const [capabilityId, rawConfig] of Object.entries(record.capabilities)) {
      if (!rawConfig || typeof rawConfig !== 'object') continue;
      const config = rawConfig as Partial<CapabilityDestinationConfig>;
      capabilities[capabilityId] = {
        destinationPreference: isDestinationPreference(config.destinationPreference)
          ? config.destinationPreference
          : defaults.capabilities[capabilityId]?.destinationPreference ?? 'local',
        disclosureCeiling: clampNumber(config.disclosureCeiling, 0, 100, DEFAULT_CAPABILITY_CONFIG.disclosureCeiling),
        modelClass: isModelClass(config.modelClass)
          ? config.modelClass
          : defaults.capabilities[capabilityId]?.modelClass ?? 'balanced',
        budgetCents: clampNumber(config.budgetCents, 0, 1_000_000, DEFAULT_CAPABILITY_CONFIG.budgetCents),
        latencyMaxMs: clampNumber(config.latencyMaxMs, 1, 600_000, DEFAULT_CAPABILITY_CONFIG.latencyMaxMs),
      };
    }
  }

  return {
    schemaVersion: 1,
    localOnlyKillSwitch: Boolean(record.localOnlyKillSwitch),
    capabilities,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

export function loadExecutionDestinationPolicy(filePath: string): ExecutionDestinationPolicyDocument {
  if (!existsSync(filePath)) {
    return createDefaultExecutionDestinationPolicy();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return normalizeExecutionDestinationPolicy(parsed);
  } catch {
    return createDefaultExecutionDestinationPolicy();
  }
}

export function saveExecutionDestinationPolicy(
  filePath: string,
  policy: ExecutionDestinationPolicyDocument,
): ExecutionDestinationPolicyDocument {
  const normalized = normalizeExecutionDestinationPolicy({
    ...policy,
    updatedAt: new Date().toISOString(),
  });
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function resolveCapabilityId(domain: string, taskType: string): string {
  return `${domain}.${taskType}`;
}

export function mapCapabilityPreferenceToKernel(
  preference: CapabilityDestinationPreference,
): UserDestinationPreference {
  switch (preference) {
    case 'local':
      return 'local';
    case 'self_hosted':
      return 'self_hosted';
    case 'byo':
      return 'byo';
    case 'ask':
      return 'ask';
  }
}

function isDestinationPreference(value: unknown): value is CapabilityDestinationPreference {
  return value === 'local'
    || value === 'self_hosted'
    || value === 'byo'
    || value === 'ask';
}

function isModelClass(value: unknown): value is CapabilityModelClass {
  return value === 'fast' || value === 'balanced' || value === 'reasoning';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
