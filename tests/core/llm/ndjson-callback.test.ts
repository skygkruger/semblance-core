// Tests for NDJSON callback protocol — imports real createCallbackProtocol from source.
//
// LOCKED DECISION: Uses NDJSON callbacks, not Tauri invoke from sidecar.
// This test validates the protocol message format and callback resolution logic.

import { describe, it, expect, beforeEach } from 'vitest';
import { createCallbackProtocol, type CallbackProtocol } from '../../../packages/desktop/src-tauri/sidecar/ndjson-callback';

describe('NDJSON Callback Protocol', () => {
  let protocol: CallbackProtocol;
  let sentMessages: string[];

  beforeEach(() => {
    sentMessages = [];
    protocol = createCallbackProtocol((line: string) => {
      sentMessages.push(line.trimEnd());
    }, 5000);
  });

  it('sends callback request in correct format', () => {
    protocol.sendCallback('native_generate', { prompt: 'test' });

    expect(sentMessages).toHaveLength(1);
    const msg = JSON.parse(sentMessages[0]!);
    expect(msg.type).toBe('callback');
    expect(msg.id).toBe('cb-1');
    expect(msg.method).toBe('native_generate');
    expect(msg.params).toEqual({ prompt: 'test' });
  });

  it('generates unique callback IDs', () => {
    protocol.sendCallback('native_generate', {});
    protocol.sendCallback('native_embed', {});

    const id1 = JSON.parse(sentMessages[0]!).id;
    const id2 = JSON.parse(sentMessages[1]!).id;
    expect(id1).not.toBe(id2);
  });

  it('resolves on callback_response with result', async () => {
    const promise = protocol.sendCallback('native_status', {});

    protocol.handleCallbackResponse({
      id: 'cb-1',
      result: { status: 'ready' },
    });

    const result = await promise;
    expect(result).toEqual({ status: 'ready' });
  });

  it('rejects on callback_response with error', async () => {
    const promise = protocol.sendCallback('native_generate', { prompt: 'test' });

    protocol.handleCallbackResponse({
      id: 'cb-1',
      error: 'Model not loaded',
    });

    await expect(promise).rejects.toBe('Model not loaded');
  });

  it('ignores callback_response for unknown ids', () => {
    protocol.handleCallbackResponse({
      id: 'cb-unknown',
      result: { data: 'ignored' },
    });

    expect(protocol.pendingCallbacks.size).toBe(0);
  });

  it('cleans up pending callback after resolution', async () => {
    const promise = protocol.sendCallback('native_status', {});
    expect(protocol.pendingCallbacks.size).toBe(1);

    protocol.handleCallbackResponse({ id: 'cb-1', result: {} });
    await promise;

    expect(protocol.pendingCallbacks.size).toBe(0);
  });

  it('cleans up pending callback after rejection', async () => {
    const promise = protocol.sendCallback('native_status', {});
    expect(protocol.pendingCallbacks.size).toBe(1);

    protocol.handleCallbackResponse({ id: 'cb-1', error: 'fail' });

    try { await promise; } catch { /* expected */ }
    expect(protocol.pendingCallbacks.size).toBe(0);
  });

  it('callback request format matches expected NDJSON schema', () => {
    protocol.sendCallback('native_embed', { input: ['hello', 'world'] });

    const msg = JSON.parse(sentMessages[0]!);
    expect(msg).toHaveProperty('type', 'callback');
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('method');
    expect(msg).toHaveProperty('params');
    expect(msg.id).toMatch(/^cb-\d+$/);
  });

  it('handles multiple concurrent callbacks', async () => {
    const p1 = protocol.sendCallback('native_generate', { prompt: 'a' });
    const p2 = protocol.sendCallback('native_embed', { input: ['b'] });
    const p3 = protocol.sendCallback('native_status', {});

    expect(protocol.pendingCallbacks.size).toBe(3);

    protocol.handleCallbackResponse({ id: 'cb-2', result: { embeddings: [[1, 2, 3]] } });
    protocol.handleCallbackResponse({ id: 'cb-1', result: { text: 'response' } });
    protocol.handleCallbackResponse({ id: 'cb-3', result: { status: 'ready' } });

    const r1 = await p1;
    const r2 = await p2;
    const r3 = await p3;

    expect(r1).toEqual({ text: 'response' });
    expect(r2).toEqual({ embeddings: [[1, 2, 3]] });
    expect(r3).toEqual({ status: 'ready' });
    expect(protocol.pendingCallbacks.size).toBe(0);
  });
});
