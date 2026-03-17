// Tests for Channel Infrastructure — registry, inbound pipeline, pairing, adapters.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelRegistry } from '../../packages/gateway/channels/channel-registry.js';
import { PairingManager } from '../../packages/gateway/channels/pairing-manager.js';
import { IMessageAdapter } from '../../packages/gateway/channels/imessage/imessage-adapter.js';
import { TelegramAdapter } from '../../packages/gateway/channels/telegram/telegram-adapter.js';
import type { ChannelAdapter, ChannelStatus, InboundMessage, OutboundMessage } from '../../packages/gateway/channels/types.js';
import Database from 'better-sqlite3';

// ─── Mock Adapter ───────────────────────────────────────────────────────────

function createMockAdapter(id: string): ChannelAdapter {
  let running = false;
  let msgCount = 0;
  return {
    channelId: id,
    displayName: `Mock ${id}`,
    start: vi.fn(async () => { running = true; }),
    stop: vi.fn(async () => { running = false; }),
    send: vi.fn(async () => {}),
    getStatus: () => ({ running, connected: running, messageCount: msgCount }),
    isRunning: () => running,
  };
}

// ─── ChannelRegistry ────────────────────────────────────────────────────────

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  it('registers and lists adapters', () => {
    registry.register(createMockAdapter('imessage'));
    registry.register(createMockAdapter('telegram'));
    const all = registry.listAll();
    expect(all).toHaveLength(2);
    expect(all.map(a => a.channelId)).toContain('imessage');
    expect(all.map(a => a.channelId)).toContain('telegram');
  });

  it('starts a specific adapter', async () => {
    const adapter = createMockAdapter('test');
    registry.register(adapter);
    await registry.start('test');
    expect(adapter.start).toHaveBeenCalled();
    expect(registry.getStatus('test')?.running).toBe(true);
  });

  it('startAll starts all adapters', async () => {
    const a1 = createMockAdapter('a1');
    const a2 = createMockAdapter('a2');
    registry.register(a1);
    registry.register(a2);
    await registry.startAll();
    expect(a1.start).toHaveBeenCalled();
    expect(a2.start).toHaveBeenCalled();
  });

  it('stops a specific adapter', async () => {
    const adapter = createMockAdapter('test');
    registry.register(adapter);
    await registry.start('test');
    await registry.stop('test');
    expect(adapter.stop).toHaveBeenCalled();
  });

  it('getStatus returns null for unknown channel', () => {
    expect(registry.getStatus('nonexistent')).toBeNull();
  });

  it('has checks registration', () => {
    registry.register(createMockAdapter('exists'));
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });
});

// ─── PairingManager ─────────────────────────────────────────────────────────

describe('PairingManager', () => {
  let db: Database.Database;
  let pairing: PairingManager;

  beforeEach(() => {
    db = new Database(':memory:');
    pairing = new PairingManager(db);
  });

  afterEach(() => {
    db.close();
  });

  it('generates 6-digit pairing code', () => {
    const code = pairing.generateCode('imessage', 'sender-1');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('verifyCode returns true for valid code', () => {
    const code = pairing.generateCode('imessage', 'sender-1');
    expect(pairing.verifyCode('imessage', 'sender-1', code)).toBe(true);
  });

  it('verifyCode returns false for wrong code', () => {
    pairing.generateCode('imessage', 'sender-1');
    expect(pairing.verifyCode('imessage', 'sender-1', '000000')).toBe(false);
  });

  it('verifyCode consumes the code (one-time use)', () => {
    const code = pairing.generateCode('imessage', 'sender-1');
    expect(pairing.verifyCode('imessage', 'sender-1', code)).toBe(true);
    expect(pairing.verifyCode('imessage', 'sender-1', code)).toBe(false);
  });

  it('approveContact marks sender as approved', () => {
    expect(pairing.isApproved('imessage', 'sender-1')).toBe(false);
    pairing.approveContact('imessage', 'sender-1', 'Alice');
    expect(pairing.isApproved('imessage', 'sender-1')).toBe(true);
  });

  it('revokeContact removes approval', () => {
    pairing.approveContact('imessage', 'sender-1');
    pairing.revokeContact('imessage', 'sender-1');
    expect(pairing.isApproved('imessage', 'sender-1')).toBe(false);
  });

  it('listPending returns unexpired codes', () => {
    pairing.generateCode('imessage', 'sender-1');
    pairing.generateCode('telegram', 'sender-2');
    const pending = pairing.listPending();
    expect(pending).toHaveLength(2);
  });

  it('listApproved returns all approved contacts', () => {
    pairing.approveContact('imessage', 's1', 'Alice');
    pairing.approveContact('telegram', 's2', 'Bob');
    const approved = pairing.listApproved();
    expect(approved).toHaveLength(2);
  });
});

// ─── iMessage Adapter ───────────────────────────────────────────────────────

describe('IMessageAdapter', () => {
  it('starts and reports status', async () => {
    const messages: InboundMessage[] = [];
    const adapter = new IMessageAdapter({
      onMessage: async (msg) => { messages.push(msg); },
      // No BlueBubbles, no AppleScript — will detect 'none' mode
    });

    await adapter.start();
    const status = adapter.getStatus();
    // Without relay, connected should be false
    expect(status.running).toBe(false); // 'none' mode doesn't start
    expect(adapter.getRelayMode()).toBe('none');
  });

  it('implements ChannelAdapter interface', () => {
    const adapter = new IMessageAdapter({ onMessage: async () => {} });
    expect(adapter.channelId).toBe('imessage');
    expect(adapter.displayName).toBe('iMessage');
    expect(typeof adapter.start).toBe('function');
    expect(typeof adapter.stop).toBe('function');
    expect(typeof adapter.send).toBe('function');
    expect(typeof adapter.getStatus).toBe('function');
    expect(typeof adapter.isRunning).toBe('function');
  });
});

// ─── Telegram Adapter ───────────────────────────────────────────────────────

describe('TelegramAdapter', () => {
  it('requires bot token to start', async () => {
    const adapter = new TelegramAdapter({
      botToken: '',
      onMessage: async () => {},
    });
    await adapter.start();
    const status = adapter.getStatus();
    expect(status.running).toBe(false);
    expect(status.errorMessage).toContain('not configured');
  });

  it('implements ChannelAdapter interface', () => {
    const adapter = new TelegramAdapter({
      botToken: 'test-token',
      onMessage: async () => {},
    });
    expect(adapter.channelId).toBe('telegram');
    expect(adapter.displayName).toBe('Telegram');
    expect(typeof adapter.start).toBe('function');
    expect(typeof adapter.stop).toBe('function');
    expect(typeof adapter.send).toBe('function');
  });

  it('getStatus reflects initial state', () => {
    const adapter = new TelegramAdapter({
      botToken: 'test',
      onMessage: async () => {},
    });
    const status = adapter.getStatus();
    expect(status.running).toBe(false);
    expect(status.messageCount).toBe(0);
  });
});
