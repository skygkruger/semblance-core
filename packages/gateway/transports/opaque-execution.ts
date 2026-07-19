/**
 * Opaque Execution Transport — sole Gateway path for BYO and self-hosted network calls.
 * Schema-validates requests, audits before execute, returns BYO-labeled disclosure receipts.
 */

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { sha256 } from '@semblance/core';
import type { CloudBridgeRequest, CloudBridgeResponse } from '@semblance/core';
import { buildDisclosureReceipt, type DisclosureReceipt } from '@semblance/cloud-broker';
import type { AuditTrail } from '../audit/trail.js';
import { runWithGatewayNetwork } from '@semblance/core/security/egress-guard.js';
import type { CloudBridgeAdapter } from '../cloud-bridge/cloud-bridge-adapter.js';
import { createExecutionV1Client } from './execution-v1-client.js';
import {
  buildOpaqueEnvelope,
  ObliviousRelayTransport,
  type ObliviousRelayEndpoint,
} from './oblivious-relay.js';

const executionMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string(),
});

export const opaqueExecutionRequestSchema = z.object({
  requestId: z.string().min(1),
  destination: z.enum(['byo', 'self_hosted']),
  provider: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(executionMessageSchema).min(1),
  maxTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2),
  subagentId: z.string().min(1),
  domain: z.string().min(1),
  taskType: z.string().min(1),
  selfHostedNodeId: z.string().min(1).optional(),
  promptContentHash: z.string().min(64).max(64),
});

export const confidentialExecutionRequestSchema = z.object({
  requestId: z.string().min(1),
  destination: z.literal('confidential'),
  deviceEphemeralPublicKey: z.string().min(1),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  promptContentHash: z.string().length(64),
  model: z.string().min(1),
  maxTokens: z.number().int().positive(),
  subagentId: z.string().min(1),
  domain: z.string().min(1),
  taskType: z.string().min(1),
  voucher: z.object({
    spentDigest: z.string().length(64),
    coarseClass: z.string().min(1),
    quantity: z.number().int().positive(),
    billingPeriod: z.string().min(1),
    signature: z.string().min(1),
    issuerKeyId: z.string().min(1),
  }),
}).strict();

export type OpaqueExecutionRequest = z.infer<typeof opaqueExecutionRequestSchema>;
export type ConfidentialExecutionRequest = z.infer<typeof confidentialExecutionRequestSchema>;

export interface OpaqueExecutionResponse {
  readonly content: string;
  readonly tokensUsed: { prompt: number; completion: number; total: number };
  readonly model: string;
  readonly provider: string;
  readonly responseContentHash: string;
  readonly disclosureReceipt: DisclosureReceipt;
}

export interface ConfidentialExecutionResponse {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly tokensUsed: { prompt: number; completion: number; total: number };
  readonly model: string;
  readonly provider: string;
  readonly responseContentHash: string;
}

export interface ConfidentialWorkloadEndpoint {
  readonly baseUrl: string;
  readonly authToken: string;
}

export interface OpaqueExecutionTransportDeps {
  readonly adapter: CloudBridgeAdapter;
  readonly auditTrail?: AuditTrail;
  readonly getSelfHostedNode?: (nodeId: string) => Promise<SelfHostedNodeCredential | null>;
  readonly getConfidentialEndpoint?: () => Promise<ConfidentialWorkloadEndpoint | null>;
  readonly getObliviousRelayEndpoint?: () => Promise<ObliviousRelayEndpoint | null>;
  readonly fetchImpl?: typeof fetch;
}

export interface SelfHostedNodeCredential {
  readonly nodeId: string;
  readonly baseUrl: string;
  readonly authToken: string;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const PLAINTEXT_FIELD_BAN = ['messages', 'content', 'prompt', 'plaintext', 'temperature'] as const;

function assertConfidentialCiphertextOnly(raw: Record<string, unknown>): void {
  for (const field of PLAINTEXT_FIELD_BAN) {
    if (field in raw) {
      throw new Error(`confidential_transport_plaintext_field:${field}`);
    }
  }
}

export class OpaqueExecutionTransport {
  private readonly adapter: CloudBridgeAdapter;
  private readonly auditTrail?: AuditTrail;
  private readonly getSelfHostedNode: (nodeId: string) => Promise<SelfHostedNodeCredential | null>;
  private readonly getConfidentialEndpoint: () => Promise<ConfidentialWorkloadEndpoint | null>;
  private readonly getObliviousRelayEndpoint: () => Promise<ObliviousRelayEndpoint | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(deps: OpaqueExecutionTransportDeps) {
    this.adapter = deps.adapter;
    this.auditTrail = deps.auditTrail;
    this.getSelfHostedNode = deps.getSelfHostedNode ?? (async () => null);
    this.getConfidentialEndpoint = deps.getConfidentialEndpoint ?? (async () => null);
    this.getObliviousRelayEndpoint = deps.getObliviousRelayEndpoint ?? (async () => null);
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  }

  async execute(rawRequest: OpaqueExecutionRequest): Promise<OpaqueExecutionResponse> {
    const request = opaqueExecutionRequestSchema.parse(rawRequest);
    const auditRequestId = request.requestId || nanoid();

    if (this.auditTrail) {
      this.auditTrail.append({
        requestId: auditRequestId,
        timestamp: new Date().toISOString(),
        action: 'service.api_call',
        direction: 'request',
        status: 'pending',
        payloadHash: sha256(JSON.stringify({
          destination: request.destination,
          provider: request.provider,
          model: request.model,
          promptContentHash: request.promptContentHash,
        })),
        signature: 'opaque-execution',
        metadata: {
          opaqueDestination: request.destination,
          disclosureLabel: request.destination === 'byo' ? 'byo' : 'self_hosted',
          subagentId: request.subagentId,
          domain: request.domain,
          taskType: request.taskType,
        },
      });
    }

    let bridgeResponse: CloudBridgeResponse;
    if (request.destination === 'byo') {
      const bridgeRequest: CloudBridgeRequest = {
        id: auditRequestId,
        subagentId: request.subagentId,
        provider: request.provider,
        model: request.model,
        messages: request.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        metadata: {
          taskType: request.taskType,
          domain: request.domain,
          contentCategories: [],
          estimatedCost: null,
        },
      };
      bridgeResponse = await this.adapter.execute(bridgeRequest);
    } else {
      bridgeResponse = await this.executeSelfHosted(request, auditRequestId);
    }

    const responseContentHash = hashContent(bridgeResponse.message.content);
    const disclosureReceipt = buildDisclosureReceipt({
      label: request.destination === 'byo' ? 'byo' : 'self_hosted',
      requestId: auditRequestId,
      destination: request.destination,
      provider: bridgeResponse.provider,
      model: bridgeResponse.model,
      promptContentHash: request.promptContentHash,
      responseContentHash,
      tokensUsed: bridgeResponse.tokensUsed,
    });

    if (this.auditTrail) {
      this.auditTrail.append({
        requestId: auditRequestId,
        timestamp: new Date().toISOString(),
        action: 'service.api_call',
        direction: 'response',
        status: 'success',
        payloadHash: sha256(responseContentHash),
        signature: disclosureReceipt.label,
        metadata: {
          opaqueDestination: request.destination,
          disclosureLabel: disclosureReceipt.label,
          provider: bridgeResponse.provider,
          model: bridgeResponse.model,
          tokensIn: bridgeResponse.tokensUsed.prompt,
          tokensOut: bridgeResponse.tokensUsed.completion,
        },
      });
    }

    return {
      content: bridgeResponse.message.content,
      tokensUsed: bridgeResponse.tokensUsed,
      model: bridgeResponse.model,
      provider: bridgeResponse.provider,
      responseContentHash,
      disclosureReceipt,
    };
  }

  async executeConfidential(rawRequest: ConfidentialExecutionRequest): Promise<ConfidentialExecutionResponse> {
    assertConfidentialCiphertextOnly(rawRequest as unknown as Record<string, unknown>);
    const request = confidentialExecutionRequestSchema.parse(rawRequest);
    const auditRequestId = request.requestId || nanoid();

    if (this.auditTrail) {
      this.auditTrail.append({
        requestId: auditRequestId,
        timestamp: new Date().toISOString(),
        action: 'service.api_call',
        direction: 'request',
        status: 'pending',
        payloadHash: sha256(JSON.stringify({
          destination: 'confidential',
          promptContentHash: request.promptContentHash,
          deviceEphemeralPublicKey: request.deviceEphemeralPublicKey,
        })),
        signature: 'confidential-execution',
        metadata: {
          opaqueDestination: 'confidential',
          disclosureLabel: 'confidential',
          subagentId: request.subagentId,
          domain: request.domain,
          taskType: request.taskType,
        },
      });
    }

    const endpoint = await this.getConfidentialEndpoint();
    if (!endpoint) {
      throw new Error('Confidential workload endpoint not configured');
    }

    const relayPayload = {
      deviceEphemeralPublicKey: request.deviceEphemeralPublicKey,
      ciphertext: request.ciphertext,
      iv: request.iv,
      authTag: request.authTag,
      promptContentHash: request.promptContentHash,
      model: request.model,
      maxTokens: request.maxTokens,
      voucher: request.voucher,
    };

    assertConfidentialCiphertextOnly(relayPayload);

    const relayEndpoint = await this.getObliviousRelayEndpoint();
    let payload: {
      ciphertext: string;
      iv: string;
      authTag: string;
      tokensUsed?: { prompt: number; completion: number; total: number };
      model?: string;
      provider?: string;
    };

    if (relayEndpoint) {
      const obliviousRelay = new ObliviousRelayTransport({
        getRelayEndpoint: async () => relayEndpoint,
        fetchImpl: this.fetchImpl,
      });
      const envelope = buildOpaqueEnvelope(relayPayload);
      const relayResult = await obliviousRelay.forward(envelope);
      const decodedJson = Buffer.from(relayResult.responsePayload, 'base64url').toString('utf8');
      const expectedHash = createHash('sha256').update(decodedJson, 'utf8').digest('hex');
      if (expectedHash !== relayResult.responsePayloadHash) {
        throw new Error('oblivious_relay_response_hash_mismatch');
      }
      payload = JSON.parse(decodedJson) as typeof payload;
    } else {
      const response = await runWithGatewayNetwork(() =>
        this.fetchImpl(`${endpoint.baseUrl.replace(/\/$/, '')}/confidential/v1/tasks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${endpoint.authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(relayPayload),
        }),
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Confidential workload request failed: ${response.status} ${errorText}`);
      }

      payload = await response.json() as typeof payload;
    }

    if (!payload.ciphertext || !payload.iv || !payload.authTag) {
      throw new Error('Confidential workload returned invalid ciphertext envelope');
    }

    const responseContentHash = hashContent(`${payload.ciphertext}:${payload.iv}:${payload.authTag}`);
    const tokensUsed = payload.tokensUsed ?? { prompt: 0, completion: 0, total: 0 };

    if (this.auditTrail) {
      this.auditTrail.append({
        requestId: auditRequestId,
        timestamp: new Date().toISOString(),
        action: 'service.api_call',
        direction: 'response',
        status: 'success',
        payloadHash: sha256(responseContentHash),
        signature: 'confidential',
        metadata: {
          opaqueDestination: 'confidential',
          disclosureLabel: 'confidential',
          provider: payload.provider ?? 'confidential',
          model: payload.model ?? request.model,
          tokensIn: tokensUsed.prompt,
          tokensOut: tokensUsed.completion,
        },
      });
    }

    return {
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      authTag: payload.authTag,
      tokensUsed,
      model: payload.model ?? request.model,
      provider: payload.provider ?? 'confidential',
      responseContentHash,
    };
  }

  private async executeSelfHosted(
    request: OpaqueExecutionRequest,
    requestId: string,
  ): Promise<CloudBridgeResponse> {
    const nodeId = request.selfHostedNodeId ?? 'default';
    const node = await this.getSelfHostedNode(nodeId);
    if (!node) {
      throw new Error(`Self-hosted node not configured: ${nodeId}`);
    }

    const startTime = Date.now();
    const client = createExecutionV1Client({
      baseUrl: node.baseUrl,
      clientId: `gateway-${nodeId}`,
      authToken: node.authToken,
      fetchImpl: this.fetchImpl,
    });

    const health = await runWithGatewayNetwork(() => client.getHealth());
    if (health.status === 'unhealthy') {
      throw new Error(`Self-hosted node unhealthy: ${nodeId}`);
    }

    const inventory = await runWithGatewayNetwork(() => client.getInventory());
    const modelAvailable = inventory.models.some((entry) => entry.modelId === request.model);
    if (!modelAvailable) {
      throw new Error(`Self-hosted node ${nodeId} does not expose model ${request.model}`);
    }

    const taskResult = await runWithGatewayNetwork(() =>
      client.submitTask({
        modelId: request.model,
        messages: request.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        idempotencyKey: requestId,
      }),
    );

    const tokensIn = taskResult.tokensUsed.prompt;
    const tokensOut = taskResult.tokensUsed.completion;

    return {
      requestId,
      provider: 'self_hosted',
      model: taskResult.modelId,
      message: {
        role: 'assistant',
        content: taskResult.content,
      },
      tokensUsed: {
        prompt: tokensIn,
        completion: tokensOut,
        total: tokensIn + tokensOut,
      },
      durationMs: Date.now() - startTime,
      cached: false,
    };
  }
}
