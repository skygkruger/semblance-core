// Tests for NDJSON callback protocol — the reverse-call mechanism for Node.js → Rust.
//
// LOCKED DECISION: Uses NDJSON callbacks, not Tauri invoke from sidecar.
// This test validates the protocol message format and callback resolution logic.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the callback infrastructure (mirrors bridge.ts implementation)
type CallbackResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

describe('NDJSON Callback Protocol', () => {
  let pendingCallbacks: Map<string, CallbackResolver>;
  let callbackIdCounter: number;
  let sentMessages: string[];

  function sendCallback(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `cb-${++callbackIdCounter}`;
      const timeout = setTimeout(() => {
        pendingCallbacks.delete(id);
        reject(`Callback ${method} timed out`);
      }, 5000);

      pendingCallbacks.set(id, { resolve, reject, timeout });
      sentMessages.push(JSON.stringify({ type: 'callback', id, method, params }));
    });
  }

  function handleCallbackResponse(msg: { id: string; result?: unknown; error?: string }): void {
    const pending = pendingCallbacks.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCallbacks.delete(msg.id);
    if (msg.error) {
      pending.reject(msg.error);
    } else {
      pending.resolve(msg.result);
    }
  }

  beforeEach(() => {
    pendingCallbacks = new Map();
    callbackIdCounter = 0;
    sentMessages = [];
  });

  it('sends callback request in correct format', () => {
    sendCallback('native_generate', { prompt: 'test' });

    expect(sentMessages).toHaveLength(1);
    const msg = JSON.parse(sentMessages[0]);
    expect(msg.type).toBe('callback');
    expect(msg.id).toBe('cb-1');
    expect(msg.method).toBe('native_generate');
    expect(msg.params).toEqual({ prompt: 'test' });
  });

  it('generates unique callback IDs', () => {
    sendCallback('native_generate', {});
    sendCallback('native_embed', {});

    const id1 = JSON.parse(sentMessages[0]).id;
    const id2 = JSON.parse(sentMessages[1]).id;
    expect(id1).not.toBe(id2);
  });

  it('resolves on callback_response with result', async () => {
    const promise = sendCallback('native_status', {});

    // Simulate Rust sending back a response
    handleCallbackResponse({
      id: 'cb-1',
      result: { status: 'ready' },
    });

    const result = await promise;
    expect(result).toEqual({ status: 'ready' });
  });

  it('rejects on callback_response with error', async () => {
    const promise = sendCallback('native_generate', { prompt: 'test' });

    handleCallbackResponse({
      id: 'cb-1',
      error: 'Model not loaded',
    });

    await expect(promise).rejects.toBe('Model not loaded');
  });

  it('ignores callback_response for unknown ids', () => {
    // Should not throw
    handleCallbackResponse({
      id: 'cb-unknown',
      result: { data: 'ignored' },
    });

    expect(pendingCallbacks.size).toBe(0);
  });

  it('cleans up pending callback after resolution', async () => {
    const promise = sendCallback('native_status', {});
    expect(pendingCallbacks.size).toBe(1);

    handleCallbackResponse({ id: 'cb-1', result: {} });
    await promise;

    expect(pendingCallbacks.size).toBe(0);
  });

  it('cleans up pending callback after rejection', async () => {
    const promise = sendCallback('native_status', {});
    expect(pendingCallbacks.size).toBe(1);

    handleCallbackResponse({ id: 'cb-1', error: 'fail' });

    try { await promise; } catch { /* expected */ }
    expect(pendingCallbacks.size).toBe(0);
  });

  it('callback request format matches expected NDJSON schema', () => {
    sendCallback('native_embed', { input: ['hello', 'world'] });

    const msg = JSON.parse(sentMessages[0]);
    // Required fields
    expect(msg).toHaveProperty('type', 'callback');
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('method');
    expect(msg).toHaveProperty('params');
    // ID starts with cb-
    expect(msg.id).toMatch(/^cb-\d+$/);
  });

  it('handles multiple concurrent callbacks', async () => {
    const p1 = sendCallback('native_generate', { prompt: 'a' });
    const p2 = sendCallback('native_embed', { input: ['b'] });
    const p3 = sendCallback('native_status', {});

    expect(pendingCallbacks.size).toBe(3);

    handleCallbackResponse({ id: 'cb-2', result: { embeddings: [[1, 2, 3]] } });
    handleCallbackResponse({ id: 'cb-1', result: { text: 'response' } });
    handleCallbackResponse({ id: 'cb-3', result: { status: 'ready' } });

    const r1 = await p1;
    const r2 = await p2;
    const r3 = await p3;

    expect(r1).toEqual({ text: 'response' });
    expect(r2).toEqual({ embeddings: [[1, 2, 3]] });
    expect(r3).toEqual({ status: 'ready' });
    expect(pendingCallbacks.size).toBe(0);
  });
});
