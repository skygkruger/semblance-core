import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '../../packages/gateway/audit/trail.js';
import { OpaqueExecutionTransport } from '../../packages/gateway/transports/opaque-execution.js';
import type { CloudBridgeAdapter } from '../../packages/gateway/cloud-bridge/cloud-bridge-adapter.js';
import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';

function exportPublicKeyBase64(publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function encryptPayload(sessionKeyBase64: string, plaintext: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const key = Buffer.from(sessionKeyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

describe('OpaqueExecutionTransport', () => {
  let adapter: CloudBridgeAdapter;
  let auditTrail: AuditTrail;
  let fetchImpl: ReturnType<typeof vi.fn>;
  let nodeKeys: ReturnType<typeof generateKeyPairSync>;
  let sessionKey: string;

  beforeEach(() => {
    const db = new Database(':memory:');
    auditTrail = new AuditTrail(db);

    adapter = {
      execute: vi.fn(async (request) => ({
        requestId: request.id,
        provider: request.provider,
        model: request.model,
        message: { role: 'assistant', content: 'byo response' },
        tokensUsed: { prompt: 5, completion: 7, total: 12 },
        durationMs: 10,
        cached: false,
      })),
    } as unknown as CloudBridgeAdapter;

    nodeKeys = generateKeyPairSync('ed25519');
    sessionKey = randomBytes(32).toString('base64');

    fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('https://node.example.com', '');

      if (path === '/execution/v1/health') {
        return {
          ok: true,
          json: async () => ({
            protocolVersion: 'execution/v1',
            compatibleWith: ['execution/v1'],
            status: 'healthy',
            nodeId: 'node-a',
            uptimeSeconds: 100,
            modelsAvailable: 1,
            activeSessions: 0,
            checkedAt: new Date().toISOString(),
          }),
        };
      }

      if (path === '/execution/v1/inventory') {
        return {
          ok: true,
          json: async () => ({
            protocolVersion: 'execution/v1',
            nodeId: 'node-a',
            models: [
              {
                modelId: 'local-llm',
                displayName: 'Local LLM',
                contextLength: 8192,
                capabilities: ['chat'],
              },
            ],
            inventoryHash: 'a'.repeat(64),
            generatedAt: new Date().toISOString(),
          }),
        };
      }

      if (path === '/execution/v1/handshake/hello' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          json: async () => ({
            protocolVersion: 'execution/v1',
            compatibleWith: ['execution/v1'],
            nodeId: 'node-a',
            nodePublicKey: exportPublicKeyBase64(nodeKeys.publicKey),
            helloNonce: body.nonce,
            nodeNonce: 'node-nonce-test',
            buildHash: 'b'.repeat(64),
            timestamp: new Date().toISOString(),
          }),
        };
      }

      if (path === '/execution/v1/handshake/auth' && init?.method === 'POST') {
        const sessionId = 'session-test';
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
        const unsigned = {
          protocolVersion: 'execution/v1',
          compatibleWith: ['execution/v1'],
          sessionId,
          nodeId: 'node-a',
          clientId: 'gateway-node-a',
          sessionKey,
          expiresAt,
        };
        const nodeSignature = sign(
          null,
          Buffer.from(
            [
              unsigned.protocolVersion,
              unsigned.sessionId,
              unsigned.nodeId,
              unsigned.clientId,
              unsigned.sessionKey,
              unsigned.expiresAt,
              unsigned.compatibleWith.join(','),
            ].join('|'),
            'utf8',
          ),
          nodeKeys.privateKey,
        ).toString('base64');

        return {
          ok: true,
          json: async () => ({
            ...unsigned,
            nodeSignature,
          }),
        };
      }

      if (path === '/execution/v1/tasks' && init?.method === 'POST') {
        const envelope = JSON.parse(String(init.body));
        const decrypted = (() => {
          const key = Buffer.from(sessionKey, 'base64');
          const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
          decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
          return Buffer.concat([
            decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
            decipher.final(),
          ]).toString('utf8');
        })();

        const payload = JSON.parse(decrypted) as { messages: Array<{ content: string }> };
        const responsePlaintext = JSON.stringify({
          content: `self-hosted response to: ${payload.messages[0]?.content ?? ''}`,
        });
        const encryptedResponse = encryptPayload(sessionKey, responsePlaintext);
        const responseHash = 'c'.repeat(64);
        const unsignedReceipt = {
          protocolVersion: 'execution/v1',
          receiptId: 'receipt-test',
          taskId: envelope.taskId,
          idempotencyKey: envelope.idempotencyKey,
          nodeId: 'node-a',
          modelId: envelope.modelId,
          taskHash: envelope.taskHash,
          responseHash,
          responseCiphertext: encryptedResponse.ciphertext,
          responseIv: encryptedResponse.iv,
          responseAuthTag: encryptedResponse.authTag,
          tokensUsed: { prompt: 3, completion: 4, total: 7 },
          durationMs: 12,
          completedAt: new Date().toISOString(),
        };
        const nodeSignature = sign(
          null,
          Buffer.from(
            [
              unsignedReceipt.protocolVersion,
              unsignedReceipt.receiptId,
              unsignedReceipt.taskId,
              unsignedReceipt.idempotencyKey,
              unsignedReceipt.nodeId,
              unsignedReceipt.modelId,
              unsignedReceipt.taskHash,
              unsignedReceipt.responseHash,
              unsignedReceipt.completedAt,
            ].join('|'),
            'utf8',
          ),
          nodeKeys.privateKey,
        ).toString('base64');

        return {
          ok: true,
          json: async () => ({
            ...unsignedReceipt,
            nodeSignature,
          }),
        };
      }

      return {
        ok: false,
        text: async () => `unexpected path ${path}`,
      };
    });
  });

  it('audits and executes BYO through CloudBridgeAdapter with byo receipt label', async () => {
    const transport = new OpaqueExecutionTransport({
      adapter,
      auditTrail,
    });

    const result = await transport.execute({
      requestId: 'req-byo-1',
      destination: 'byo',
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 128,
      temperature: 0.2,
      subagentId: 'sub-1',
      domain: 'general',
      taskType: 'chat',
      promptContentHash: 'a'.repeat(64),
    });

    expect(adapter.execute).toHaveBeenCalledOnce();
    expect(result.content).toBe('byo response');
    expect(result.disclosureReceipt.label).toBe('byo');
    expect(result.disclosureReceipt.destination).toBe('byo');
    expect(result.disclosureReceipt.label).not.toBe('confidential');
  });

  it('executes self-hosted node via execution/v1 protocol with self_hosted receipt label', async () => {
    const transport = new OpaqueExecutionTransport({
      adapter,
      auditTrail,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSelfHostedNode: async () => ({
        nodeId: 'node-a',
        baseUrl: 'https://node.example.com',
        authToken: 'secret-token',
      }),
    });

    const result = await transport.execute({
      requestId: 'req-sh-1',
      destination: 'self_hosted',
      provider: 'self_hosted',
      model: 'local-llm',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 128,
      temperature: 0.2,
      subagentId: 'sub-2',
      domain: 'general',
      taskType: 'chat',
      selfHostedNodeId: 'node-a',
      promptContentHash: 'b'.repeat(64),
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.content).toBe('self-hosted response to: hello');
    expect(result.disclosureReceipt.label).toBe('self_hosted');
    expect(adapter.execute).not.toHaveBeenCalled();
  });
});
