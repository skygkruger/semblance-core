import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '../../packages/gateway/audit/trail.js';
import { OpaqueExecutionTransport } from '../../packages/gateway/transports/opaque-execution.js';
import type { CloudBridgeAdapter } from '../../packages/gateway/cloud-bridge/cloud-bridge-adapter.js';

describe('OpaqueExecutionTransport', () => {
  let adapter: CloudBridgeAdapter;
  let auditTrail: AuditTrail;
  let fetchImpl: ReturnType<typeof vi.fn>;

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

    fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'self-hosted response' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        model: 'node-model',
      }),
    }));
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

  it('executes self-hosted node via fetch with self_hosted receipt label', async () => {
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

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.content).toBe('self-hosted response');
    expect(result.disclosureReceipt.label).toBe('self_hosted');
    expect(adapter.execute).not.toHaveBeenCalled();
  });
});
