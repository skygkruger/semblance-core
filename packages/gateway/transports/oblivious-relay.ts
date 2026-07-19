/**
 * Oblivious relay transport — forwards opaque envelopes only.
 *
 * The relay sees source network metadata + ciphertext envelope. It does not
 * log user ids, account ids, or task content. Used by the confidential path
 * when a privacy relay endpoint is configured.
 */

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { runWithGatewayNetwork } from '@semblance/core/security/egress-guard.js';

const FORBIDDEN_LOG_FIELDS = [
  'accountId',
  'customerId',
  'memberId',
  'userId',
  'taskId',
  'requestId',
  'subagentId',
  'domain',
  'taskType',
  'messages',
  'content',
  'prompt',
  'plaintext',
  'serial',
] as const;

export const opaqueEnvelopeSchema = z.object({
  envelopeId: z.string().min(1),
  relayToken: z.string().min(1),
  payload: z.string().min(1),
  payloadHash: z.string().length(64),
}).strict();

export type OpaqueEnvelope = z.infer<typeof opaqueEnvelopeSchema>;

export interface ObliviousRelayEndpoint {
  readonly baseUrl: string;
  readonly authToken: string;
}

export interface ObliviousRelayForwardResult {
  readonly envelopeId: string;
  readonly responsePayload: string;
  readonly responsePayloadHash: string;
}

export interface ObliviousRelayLogEntry {
  readonly timestamp: string;
  readonly envelopeId: string;
  readonly payloadHash: string;
  readonly sourceNetwork: string;
  readonly direction: 'request' | 'response';
}

export interface ObliviousRelayDeps {
  readonly getRelayEndpoint: () => Promise<ObliviousRelayEndpoint | null>;
  readonly fetchImpl?: typeof fetch;
  readonly sourceNetwork?: string;
  readonly logSink?: (entry: ObliviousRelayLogEntry) => void;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertNoForbiddenFields(raw: Record<string, unknown>): void {
  for (const field of FORBIDDEN_LOG_FIELDS) {
    if (field in raw) {
      throw new Error(`oblivious_relay_forbidden_field:${field}`);
    }
  }
}

export function buildOpaqueEnvelope(payload: Record<string, unknown>): OpaqueEnvelope {
  assertNoForbiddenFields(payload);
  const serialized = JSON.stringify(payload);
  return {
    envelopeId: randomBytes(16).toString('hex'),
    relayToken: randomBytes(24).toString('hex'),
    payload: Buffer.from(serialized, 'utf8').toString('base64url'),
    payloadHash: sha256Hex(serialized),
  };
}

export function decodeOpaqueEnvelope(envelope: OpaqueEnvelope): Record<string, unknown> {
  const parsed = opaqueEnvelopeSchema.parse(envelope);
  const serialized = Buffer.from(parsed.payload, 'base64url').toString('utf8');
  if (sha256Hex(serialized) !== parsed.payloadHash) {
    throw new Error('opaque_envelope_hash_mismatch');
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

export class ObliviousRelayTransport {
  private readonly getRelayEndpoint: () => Promise<ObliviousRelayEndpoint | null>;
  private readonly fetchImpl: typeof fetch;
  private readonly sourceNetwork: string;
  private readonly logSink?: (entry: ObliviousRelayLogEntry) => void;
  readonly relayLog: ObliviousRelayLogEntry[] = [];

  constructor(deps: ObliviousRelayDeps) {
    this.getRelayEndpoint = deps.getRelayEndpoint;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    this.sourceNetwork = deps.sourceNetwork ?? 'gateway-local';
    this.logSink = deps.logSink;
  }

  private record(entry: ObliviousRelayLogEntry): void {
    assertNoForbiddenFields(entry as unknown as Record<string, unknown>);
    this.relayLog.push(entry);
    this.logSink?.(entry);
  }

  async forward(envelope: OpaqueEnvelope): Promise<ObliviousRelayForwardResult> {
    const parsed = opaqueEnvelopeSchema.parse(envelope);
    const endpoint = await this.getRelayEndpoint();
    if (!endpoint) {
      throw new Error('oblivious_relay_not_configured');
    }

    this.record({
      timestamp: new Date().toISOString(),
      envelopeId: parsed.envelopeId,
      payloadHash: parsed.payloadHash,
      sourceNetwork: this.sourceNetwork,
      direction: 'request',
    });

    const response = await runWithGatewayNetwork(() =>
      this.fetchImpl(`${endpoint.baseUrl.replace(/\/$/, '')}/relay/v1/forward`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${endpoint.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          envelopeId: parsed.envelopeId,
          relayToken: parsed.relayToken,
          payload: parsed.payload,
          payloadHash: parsed.payloadHash,
        }),
      }),
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`oblivious_relay_forward_failed:${response.status}:${errorText}`);
    }

    const body = await response.json() as {
      envelopeId: string;
      responsePayload: string;
      responsePayloadHash: string;
    };

    this.record({
      timestamp: new Date().toISOString(),
      envelopeId: body.envelopeId,
      payloadHash: body.responsePayloadHash,
      sourceNetwork: this.sourceNetwork,
      direction: 'response',
    });

    return {
      envelopeId: body.envelopeId,
      responsePayload: body.responsePayload,
      responsePayloadHash: body.responsePayloadHash,
    };
  }
}

export function assertRelayLogHasNoAccountLinkage(log: readonly ObliviousRelayLogEntry[]): void {
  for (const entry of log) {
    const serialized = JSON.stringify(entry);
    if (/accountId|customerId|memberId|userId|taskId|requestId|subagentId|serial/i.test(serialized)) {
      throw new Error('account_linkage_detected_in_relay_log');
    }
  }
}
