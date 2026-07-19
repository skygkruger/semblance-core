import type {
  decideExecutionDestination,
  ExecutionDestinationDecision,
  ExecutionDestinationPolicyInput,
} from '@semblance/kernel';
import type { DisclosureReceipt } from './disclosure-receipt.js';

export type PolicyDecider = typeof decideExecutionDestination;

export interface ExecutionMessage {
  readonly role: string;
  readonly content: string;
}

export interface ExecutionRequest {
  readonly requestId: string;
  readonly messages: readonly ExecutionMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly subagentId: string;
  readonly domain: string;
  readonly taskType: string;
  readonly policyInput: ExecutionDestinationPolicyInput;
  readonly excludedCategories: readonly string[];
  /** Preferred BYO provider when policy selects byo. */
  readonly provider?: string;
  /** Preferred model when remote execution is selected. */
  readonly model?: string;
  /** Self-hosted node id when policy selects self_hosted. */
  readonly selfHostedNodeId?: string;
  /** Pre-fetched attestation evidence for confidential destination (avoids broker fetch). */
  readonly attestationEvidence?: unknown;
  /** Maximum minimized plaintext bytes permitted for confidential disclosure. */
  readonly maxDisclosureBytes?: number;
}

export interface ExecutionSuccessResult {
  readonly status: 'success';
  readonly destination: Exclude<ExecutionDestinationDecision['destination'], 'ask' | 'reject'>;
  readonly content: string;
  readonly tokensUsed: { prompt: number; completion: number; total: number };
  readonly model: string;
  readonly provider: string;
  readonly reason: string;
  readonly minimization: {
    readonly tokensBefore: number;
    readonly tokensAfter: number;
  };
  readonly disclosureReceipt?: DisclosureReceipt;
}

export interface ExecutionAskResult {
  readonly status: 'ask';
  readonly reason: string;
  readonly requiresConsent: true;
}

export interface ExecutionRejectResult {
  readonly status: 'reject';
  readonly reason: string;
}

export type ExecutionResult = ExecutionSuccessResult | ExecutionAskResult | ExecutionRejectResult;

export interface LocalExecutionParams {
  readonly messages: readonly ExecutionMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly subagentId: string;
  readonly domain: string;
  readonly taskType: string;
}

export interface LocalExecutionResponse {
  readonly content: string;
  readonly tokensUsed: { prompt: number; completion: number; total: number };
  readonly model: string;
  readonly provider: string;
}

export interface OpaqueGatewayRequest {
  readonly requestId: string;
  readonly destination: 'byo' | 'self_hosted';
  readonly provider: string;
  readonly model: string;
  readonly messages: readonly ExecutionMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly subagentId: string;
  readonly domain: string;
  readonly taskType: string;
  readonly selfHostedNodeId?: string;
  readonly promptContentHash: string;
}

export interface OpaqueGatewayResponse {
  readonly content: string;
  readonly tokensUsed: { prompt: number; completion: number; total: number };
  readonly model: string;
  readonly provider: string;
  readonly responseContentHash: string;
  readonly disclosureReceipt: DisclosureReceipt;
}

export interface ConfidentialGatewayRequest {
  readonly requestId: string;
  readonly destination: 'confidential';
  readonly deviceEphemeralPublicKey: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly promptContentHash: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly subagentId: string;
  readonly domain: string;
  readonly taskType: string;
}

export interface ConfidentialGatewayResponse {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly tokensUsed: { prompt: number; completion: number; total: number };
  readonly model: string;
  readonly provider: string;
  readonly responseContentHash: string;
}

/** Injected transport — Broker never opens sockets. */
export interface GatewayOpaqueTransport {
  execute(request: OpaqueGatewayRequest): Promise<OpaqueGatewayResponse>;
  executeConfidential(request: ConfidentialGatewayRequest): Promise<ConfidentialGatewayResponse>;
}

export interface LocalExecutionTransport {
  execute(params: LocalExecutionParams): Promise<LocalExecutionResponse>;
}
