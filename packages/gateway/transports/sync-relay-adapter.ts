/**
 * Gateway sync relay adapter — forwards ciphertext sync blobs only.
 *
 * The Gateway is the sole network egress for sync relay traffic. It never
 * decrypts vault envelopes; merge authority stays on devices via @semblance/sync.
 */

import {
  assertRelayMessageHasNoPlaintextFields,
  syncRelayPullRequestSchema,
  syncRelayPullResponseSchema,
  syncRelayPushRequestSchema,
  syncRelayPushResponseSchema,
  type SyncRelayPullRequest,
  type SyncRelayPullResponse,
  type SyncRelayPushRequest,
  type SyncRelayPushResponse,
} from '@semblance/sync';
import { gatewayFetch } from '../security/gateway-network.js';

export interface SyncRelayEndpoint {
  readonly baseUrl: string;
  readonly authToken: string;
}

export interface GatewaySyncRelayAdapterDeps {
  readonly getRelayEndpoint: () => Promise<SyncRelayEndpoint | null>;
  readonly fetchImpl?: typeof fetch;
}

export class GatewaySyncRelayAdapter {
  private readonly getRelayEndpoint: () => Promise<SyncRelayEndpoint | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(deps: GatewaySyncRelayAdapterDeps) {
    this.getRelayEndpoint = deps.getRelayEndpoint;
    this.fetchImpl = deps.fetchImpl ?? gatewayFetch;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    assertRelayMessageHasNoPlaintextFields(body as Record<string, unknown>);
    const endpoint = await this.getRelayEndpoint();
    if (!endpoint) {
      throw new Error('sync_relay_not_configured');
    }

    const response = await this.fetchImpl(`${endpoint.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`sync_relay_request_failed:${response.status}:${errorText}`);
    }

    return (await response.json()) as T;
  }

  async push(request: SyncRelayPushRequest): Promise<SyncRelayPushResponse> {
    const parsed = syncRelayPushRequestSchema.parse(request);
    return syncRelayPushResponseSchema.parse(await this.post('/sync/v1/push', parsed));
  }

  async pull(request: SyncRelayPullRequest): Promise<SyncRelayPullResponse> {
    const parsed = syncRelayPullRequestSchema.parse(request);
    return syncRelayPullResponseSchema.parse(await this.post('/sync/v1/pull', parsed));
  }
}

export interface GatewayDirectPeerTransportDeps {
  readonly resolvePeerBaseUrl: (peerDeviceId: string) => Promise<string | null>;
  readonly fetchImpl?: typeof fetch;
}

export class GatewayDirectPeerTransport {
  private readonly resolvePeerBaseUrl: (peerDeviceId: string) => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(deps: GatewayDirectPeerTransportDeps) {
    this.resolvePeerBaseUrl = deps.resolvePeerBaseUrl;
    this.fetchImpl = deps.fetchImpl ?? gatewayFetch;
  }

  async exchange(
    peerDeviceId: string,
    request: import('@semblance/sync').SyncRelayExchangeRequest,
  ): Promise<import('@semblance/sync').SyncRelayExchangeResponse> {
    assertRelayMessageHasNoPlaintextFields(request as unknown as Record<string, unknown>);
    const baseUrl = await this.resolvePeerBaseUrl(peerDeviceId);
    if (!baseUrl) {
      throw new Error(`direct_peer_unavailable:${peerDeviceId}`);
    }

    const response = await this.fetchImpl(`${baseUrl.replace(/\/$/, '')}/sync/v1/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`direct_peer_exchange_failed:${response.status}:${errorText}`);
    }

    return (await response.json()) as import('@semblance/sync').SyncRelayExchangeResponse;
  }
}
