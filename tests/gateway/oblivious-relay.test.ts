import { describe, expect, it, vi } from 'vitest';
import {
  assertRelayLogHasNoAccountLinkage,
  buildOpaqueEnvelope,
  ObliviousRelayTransport,
} from '../../packages/gateway/transports/oblivious-relay.js';

describe('ObliviousRelayTransport', () => {
  it('forwards opaque envelope without logging account or task fields', async () => {
    const responsePayload = Buffer.from(JSON.stringify({
      ciphertext: 'resp-ciphertext',
      iv: Buffer.alloc(12, 1).toString('base64url'),
      authTag: Buffer.alloc(16, 2).toString('base64url'),
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
      model: 'confidential-default',
      provider: 'confidential',
    }), 'utf8').toString('base64url');

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        envelopeId: 'env-1',
        responsePayload,
        responsePayloadHash: 'abc',
      }),
    }));

    const transport = new ObliviousRelayTransport({
      getRelayEndpoint: async () => ({
        baseUrl: 'https://relay.example.com',
        authToken: 'relay-token',
      }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sourceNetwork: 'test-network',
    });

    const envelope = buildOpaqueEnvelope({
      ciphertext: 'task-ciphertext',
      iv: Buffer.alloc(12, 3).toString('base64url'),
      authTag: Buffer.alloc(16, 4).toString('base64url'),
      promptContentHash: 'd'.repeat(64),
      voucher: {
        spentDigest: 'e'.repeat(64),
        coarseClass: 'inference-standard',
        quantity: 1,
        billingPeriod: '2026-07',
        signature: 'sig',
        issuerKeyId: 'key-1',
      },
    });

    await transport.forward(envelope);

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.accountId).toBeUndefined();
    expect(body.taskId).toBeUndefined();
    expect(body.subagentId).toBeUndefined();
    expect(body.payload).toBeTruthy();

    assertRelayLogHasNoAccountLinkage(transport.relayLog);
    expect(JSON.stringify(transport.relayLog)).not.toMatch(/accountId|customerId|taskId|subagentId/i);
  });
});
