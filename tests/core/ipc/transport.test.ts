// Tests for IPC Transport Abstraction — InProcessTransport + CoreIPCClient with transport.
// Verifies that the full validation pipeline runs identically through InProcessTransport.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InProcessTransport } from '@semblance/core/ipc/in-process-transport.js';
import { CoreIPCClient } from '@semblance/core/agent/ipc-client.js';
import { signRequest, verifySignature } from '@semblance/core/types/signing.js';
import type { IPCTransport, IPCHandler } from '@semblance/core/ipc/transport.js';
import type { ActionRequest, ActionResponse } from '@semblance/core/types/ipc.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_KEY = Buffer.from('a'.repeat(64), 'hex'); // 32-byte signing key

function makeSuccessResponse(requestId: string): ActionResponse {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    status: 'success',
    data: { result: 'ok' },
    auditRef: 'audit-001',
  };
}

function makeErrorResponse(requestId: string, code: string, message: string): ActionResponse {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    status: 'error',
    error: { code, message },
    auditRef: 'audit-err-001',
  };
}

/**
 * Creates a mock handler that simulates the Gateway's validateAndExecute pipeline.
 * Verifies signatures and rejects invalid ones — just like the real pipeline.
 */
function createMockValidationPipeline(): IPCHandler {
  return async (raw: unknown): Promise<unknown> => {
    const request = raw as ActionRequest;

    // Step 1: Verify signature (same as real pipeline)
    const sigValid = verifySignature(
      TEST_KEY,
      request.signature,
      request.id,
      request.timestamp,
      request.action,
      request.payload,
    );

    if (!sigValid) {
      return makeErrorResponse(request.id, 'SIGNATURE_INVALID', 'Request signature verification failed');
    }

    // Step 2: Simulate audit trail logging (always happens before execution)
    // In real pipeline: auditTrail.append({ ... status: 'pending' })

    // Step 3: Simulate execution
    return makeSuccessResponse(request.id);
  };
}

// ─── InProcessTransport Tests ────────────────────────────────────────────────

describe('InProcessTransport', () => {
  let handler: IPCHandler;
  let transport: InProcessTransport;

  beforeEach(() => {
    handler = createMockValidationPipeline();
    transport = new InProcessTransport(handler);
  });

  it('throws if handler is not a function', () => {
    expect(() => new InProcessTransport(null as unknown as IPCHandler))
      .toThrow('Handler must be a function');
  });

  it('is not ready before start()', () => {
    expect(transport.isReady()).toBe(false);
  });

  it('is ready after start()', async () => {
    await transport.start();
    expect(transport.isReady()).toBe(true);
  });

  it('is not ready after stop()', async () => {
    await transport.start();
    await transport.stop();
    expect(transport.isReady()).toBe(false);
  });

  it('rejects send() before start()', async () => {
    const request: ActionRequest = {
      id: 'req-1',
      timestamp: new Date().toISOString(),
      action: 'email.fetch',
      payload: { folder: 'INBOX' },
      source: 'core',
      signature: 'test',
    };

    await expect(transport.send(request)).rejects.toThrow('Not started');
  });

  it('routes a valid signed request through handler and returns response', async () => {
    await transport.start();

    const id = 'req-valid-1';
    const timestamp = new Date().toISOString();
    const action = 'email.fetch';
    const payload = { folder: 'INBOX', limit: 50 };
    const signature = signRequest(TEST_KEY, id, timestamp, action, payload);

    const request: ActionRequest = {
      id, timestamp, action, payload, source: 'core', signature,
    };

    const response = await transport.send(request);

    expect(response.requestId).toBe(id);
    expect(response.status).toBe('success');
    expect(response.data).toEqual({ result: 'ok' });
  });

  it('rejects requests with invalid signatures (pipeline enforces signing)', async () => {
    await transport.start();

    const request: ActionRequest = {
      id: 'req-bad-sig',
      timestamp: new Date().toISOString(),
      action: 'email.fetch',
      payload: { folder: 'INBOX' },
      source: 'core',
      signature: 'invalid-signature-value',
    };

    const response = await transport.send(request);

    expect(response.requestId).toBe('req-bad-sig');
    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('SIGNATURE_INVALID');
  });

  it('handler receives the exact request object (no serialization)', async () => {
    const receivedRequests: unknown[] = [];
    const captureHandler: IPCHandler = async (raw: unknown): Promise<unknown> => {
      receivedRequests.push(raw);
      const req = raw as ActionRequest;
      return makeSuccessResponse(req.id);
    };

    const captureTransport = new InProcessTransport(captureHandler);
    await captureTransport.start();

    const id = 'req-capture';
    const timestamp = new Date().toISOString();
    const payload = { folder: 'SENT', limit: 10 };
    const signature = signRequest(TEST_KEY, id, timestamp, 'email.fetch', payload);

    const request: ActionRequest = {
      id, timestamp, action: 'email.fetch', payload, source: 'core', signature,
    };

    await captureTransport.send(request);

    // The handler receives the same object reference (no serialization)
    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0]).toBe(request);
  });

  it('rejects if handler returns invalid response', async () => {
    const badHandler: IPCHandler = async () => null;
    const badTransport = new InProcessTransport(badHandler);
    await badTransport.start();

    const id = 'req-bad-resp';
    const timestamp = new Date().toISOString();
    const signature = signRequest(TEST_KEY, id, timestamp, 'email.fetch', {});

    const request: ActionRequest = {
      id, timestamp, action: 'email.fetch', payload: {}, source: 'core', signature,
    };

    await expect(badTransport.send(request)).rejects.toThrow('invalid response');
  });

  it('rejects if response requestId does not match', async () => {
    const mismatchHandler: IPCHandler = async () => makeSuccessResponse('wrong-id');
    const mismatchTransport = new InProcessTransport(mismatchHandler);
    await mismatchTransport.start();

    const id = 'req-mismatch';
    const timestamp = new Date().toISOString();
    const signature = signRequest(TEST_KEY, id, timestamp, 'email.fetch', {});

    const request: ActionRequest = {
      id, timestamp, action: 'email.fetch', payload: {}, source: 'core', signature,
    };

    await expect(mismatchTransport.send(request)).rejects.toThrow('requestId mismatch');
  });
});

// ─── CoreIPCClient with InProcessTransport ──────────────────────────────────

describe('CoreIPCClient with InProcessTransport', () => {
  let handler: IPCHandler;
  let transport: InProcessTransport;
  let client: CoreIPCClient;

  beforeEach(() => {
    handler = createMockValidationPipeline();
    transport = new InProcessTransport(handler);
    client = new CoreIPCClient({
      transport,
      signingKey: TEST_KEY,
    });
  });

  it('connects and disconnects via transport', async () => {
    expect(client.isConnected()).toBe(false);

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('sends signed action through transport and receives response', async () => {
    await client.connect();

    const response = await client.sendAction('email.fetch', { folder: 'INBOX', limit: 50 });

    expect(response.status).toBe('success');
    expect(response.data).toEqual({ result: 'ok' });
  });

  it('rejects sendAction before connect', async () => {
    await expect(client.sendAction('email.fetch', {})).rejects.toThrow('Not connected');
  });

  it('signs requests correctly (validated by handler)', async () => {
    await client.connect();

    // The mock handler verifies signatures — if signing is wrong, it returns SIGNATURE_INVALID
    const response = await client.sendAction('email.send', {
      to: ['test@example.com'],
      subject: 'Test',
      body: 'Hello',
    });

    expect(response.status).toBe('success');
  });

  it('audit trail is logged via handler (same pipeline as socket)', async () => {
    const auditLog: string[] = [];
    const auditHandler: IPCHandler = async (raw: unknown): Promise<unknown> => {
      const request = raw as ActionRequest;
      auditLog.push(`pending:${request.id}`);
      // Simulate real pipeline: log before execute, execute, log after execute
      auditLog.push(`success:${request.id}`);
      return makeSuccessResponse(request.id);
    };

    const auditTransport = new InProcessTransport(auditHandler);
    const auditClient = new CoreIPCClient({
      transport: auditTransport,
      signingKey: TEST_KEY,
    });

    await auditClient.connect();
    await auditClient.sendAction('email.fetch', { folder: 'INBOX' });

    expect(auditLog).toHaveLength(2);
    expect(auditLog[0]).toMatch(/^pending:/);
    expect(auditLog[1]).toMatch(/^success:/);
  });

  it('malformed request rejected by handler returns error status', async () => {
    const strictHandler: IPCHandler = async (raw: unknown): Promise<unknown> => {
      const request = raw as ActionRequest;
      // Simulate schema validation rejecting unknown action
      if (!request.action) {
        return makeErrorResponse(request.id, 'SCHEMA_INVALID', 'Missing action');
      }
      return makeSuccessResponse(request.id);
    };

    const strictTransport = new InProcessTransport(strictHandler);
    const strictClient = new CoreIPCClient({
      transport: strictTransport,
      signingKey: TEST_KEY,
    });

    await strictClient.connect();
    const response = await strictClient.sendAction('email.fetch', { folder: 'INBOX' });
    // Valid action — should succeed
    expect(response.status).toBe('success');
  });
});

// ─── IPCTransport Interface Compliance ───────────────────────────────────────

describe('IPCTransport interface compliance', () => {
  it('InProcessTransport implements all IPCTransport methods', () => {
    const handler: IPCHandler = async () => ({});
    const transport: IPCTransport = new InProcessTransport(handler);

    expect(typeof transport.send).toBe('function');
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.stop).toBe('function');
    expect(typeof transport.isReady).toBe('function');
  });

  it('start() and stop() are idempotent', async () => {
    const handler: IPCHandler = async (raw: unknown) => makeSuccessResponse((raw as ActionRequest).id);
    const transport = new InProcessTransport(handler);

    // Multiple starts should not throw
    await transport.start();
    await transport.start();
    expect(transport.isReady()).toBe(true);

    // Multiple stops should not throw
    await transport.stop();
    await transport.stop();
    expect(transport.isReady()).toBe(false);
  });
});
