import { describe, expect, it, vi } from 'vitest';
import {
  GatewaySyncRelayAdapter,
  GatewayDirectPeerTransport,
} from '../../packages/gateway/transports/sync-relay-adapter.js';
import { SYNC_RELAY_GENESIS_HEAD } from '@semblance/sync';

describe('GatewaySyncRelayAdapter', () => {
  it('forwards ciphertext-only push and pull without plaintext fields', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty('plaintext');
      expect(body).not.toHaveProperty('content');
      expect(body).not.toHaveProperty('email');
      expect(JSON.stringify(body)).not.toMatch(/accountId|userId|email/i);

      if (url.endsWith('/sync/v1/push')) {
        return new Response(
          JSON.stringify({ accepted: 1, headHash: 'a'.repeat(64), rejectedBlobIds: [] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ blobs: [], headHash: SYNC_RELAY_GENESIS_HEAD, merkleRoot: 'b'.repeat(64) }),
        { status: 200 },
      );
    });

    const adapter = new GatewaySyncRelayAdapter({
      getRelayEndpoint: async () => ({ baseUrl: 'https://relay.example.com', authToken: 'token' }),
      fetchImpl: fetchImpl as typeof fetch,
    });

    await adapter.push({
      schemaVersion: 1,
      rootIdHash: 'c'.repeat(64),
      deviceEpochHash: 'd'.repeat(64),
      batchId: 'batch-1',
      blobs: [
        {
          blobId: 'e'.repeat(64),
          deviceEpochHash: 'd'.repeat(64),
          envelopeBlob: Buffer.from('{"ciphertext":"opaque"}', 'utf8').toString('base64url'),
          blobHash: 'f'.repeat(64),
          lamportClock: 1,
        },
      ],
      batchMerkleRoot: 'a'.repeat(64),
      priorHeadHash: SYNC_RELAY_GENESIS_HEAD,
    });

    await adapter.pull({
      schemaVersion: 1,
      rootIdHash: 'c'.repeat(64),
      deviceEpochHash: 'd'.repeat(64),
      knownHeadHash: SYNC_RELAY_GENESIS_HEAD,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('direct peer transport posts ciphertext exchange payloads only', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toMatch(/plaintext|accountId|email/i);
      return new Response(JSON.stringify({ schemaVersion: 1, pull: { blobs: [], headHash: SYNC_RELAY_GENESIS_HEAD, merkleRoot: 'a'.repeat(64) } }), {
        status: 200,
      });
    });

    const transport = new GatewayDirectPeerTransport({
      resolvePeerBaseUrl: async () => 'http://100.64.0.2:51821',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await transport.exchange('device-phone-001', {
      schemaVersion: 1,
      pull: {
        schemaVersion: 1,
        rootIdHash: 'b'.repeat(64),
        deviceEpochHash: 'c'.repeat(64),
        knownHeadHash: SYNC_RELAY_GENESIS_HEAD,
      },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
