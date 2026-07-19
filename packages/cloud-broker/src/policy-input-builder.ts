import type {
  DestinationTrustFacts,
  ExecutionDestinationPolicyInput,
} from '@semblance/kernel';
import type { CapabilityDestinationConfig, ExecutionDestinationPolicyDocument } from './destination-policy-store.js';
import { mapCapabilityPreferenceToKernel, resolveCapabilityId } from './destination-policy-store.js';

export interface BuildPolicyInputParams {
  readonly policyDocument: ExecutionDestinationPolicyDocument;
  readonly domain: string;
  readonly taskType: string;
  readonly sensitivity: number;
  readonly localFeasibility: boolean;
  readonly destinationTrust: DestinationTrustFacts;
  readonly explicitConsent: boolean;
  readonly estimatedCostCents?: number;
  readonly estimatedLatencyMs?: number;
  readonly labeledConfidential?: boolean;
}

export function resolveCapabilityConfig(
  policyDocument: ExecutionDestinationPolicyDocument,
  domain: string,
  taskType: string,
): CapabilityDestinationConfig {
  const capabilityId = resolveCapabilityId(domain, taskType);
  return policyDocument.capabilities[capabilityId] ?? {
    destinationPreference: 'local',
    disclosureCeiling: 60,
    modelClass: 'balanced',
    budgetCents: 500,
    latencyMaxMs: 30_000,
  };
}

export function buildExecutionPolicyInput(params: BuildPolicyInputParams): ExecutionDestinationPolicyInput {
  const capability = resolveCapabilityConfig(params.policyDocument, params.domain, params.taskType);
  const estimatedCostCents = params.estimatedCostCents ?? 0;
  const estimatedLatencyMs = params.estimatedLatencyMs ?? 0;

  return {
    sensitivity: params.sensitivity,
    localFeasibility: params.localFeasibility,
    destinationTrust: params.destinationTrust,
    userPreference: mapCapabilityPreferenceToKernel(capability.destinationPreference),
    disclosureCeiling: capability.disclosureCeiling,
    cost: {
      budgetCents: capability.budgetCents,
      estimatedCents: estimatedCostCents,
    },
    latency: {
      maxMs: capability.latencyMaxMs,
      estimatedMs: estimatedLatencyMs,
    },
    attestationAvailable: false,
    localOnlyKillSwitch: params.policyDocument.localOnlyKillSwitch,
    explicitConsent: params.explicitConsent,
    labeledConfidential: params.labeledConfidential ?? false,
  };
}
