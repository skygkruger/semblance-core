// Channel Registry — Manages all registered channel adapters.
// Daemon calls startAll() at boot. Individual channels can be started/stopped.

import type { ChannelAdapter, ChannelStatus } from './types.js';
import type { SemblanceEventBus } from '../events/event-bus.js';

export interface ChannelRegistryEntry {
  adapter: ChannelAdapter;
  status: ChannelStatus;
}

/**
 * ChannelRegistry maintains all registered ChannelAdapter instances.
 */
export class ChannelRegistry {
  private adapters: Map<string, ChannelAdapter> = new Map();
  private eventBus: SemblanceEventBus | null = null;

  /**
   * Set the event bus for channel message events.
   */
  setEventBus(eventBus: SemblanceEventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Emit channel.message_received event when a message is received on a channel.
   * Called by channel adapters' InboundPipeline after processing an approved message.
   */
  emitMessageReceived(channelId: string, senderId: string, sessionKey: string): void {
    if (this.eventBus) {
      this.eventBus.emit('channel.message_received', { channelId, senderId, sessionKey });
    }
  }

  /**
   * Register a channel adapter.
   */
  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channelId, adapter);
  }

  /**
   * Start a specific channel adapter.
   */
  async start(channelId: string): Promise<void> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) throw new Error(`Channel ${channelId} not registered`);
    if (adapter.isRunning()) return;
    await adapter.start();
  }

  /**
   * Start all registered channel adapters. Called by daemon on boot.
   */
  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        if (!adapter.isRunning()) {
          await adapter.start();
        }
      } catch (error) {
        console.error(`[ChannelRegistry] Failed to start ${adapter.channelId}:`, (error as Error).message);
      }
    }
  }

  /**
   * Stop a specific channel adapter.
   */
  async stop(channelId: string): Promise<void> {
    const adapter = this.adapters.get(channelId);
    if (!adapter) return;
    if (adapter.isRunning()) {
      await adapter.stop();
    }
  }

  /**
   * Stop all channel adapters. Called on daemon shutdown.
   */
  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        if (adapter.isRunning()) {
          await adapter.stop();
        }
      } catch (error) {
        console.error(`[ChannelRegistry] Failed to stop ${adapter.channelId}:`, (error as Error).message);
      }
    }
  }

  /**
   * Get status for a specific channel.
   */
  getStatus(channelId: string): ChannelStatus | null {
    const adapter = this.adapters.get(channelId);
    return adapter?.getStatus() ?? null;
  }

  /**
   * List all registered adapters with their current status.
   */
  listAll(): Array<{ channelId: string; displayName: string; status: ChannelStatus }> {
    const result: Array<{ channelId: string; displayName: string; status: ChannelStatus }> = [];
    for (const adapter of this.adapters.values()) {
      result.push({
        channelId: adapter.channelId,
        displayName: adapter.displayName,
        status: adapter.getStatus(),
      });
    }
    return result;
  }

  /**
   * Get a specific adapter instance.
   */
  getAdapter(channelId: string): ChannelAdapter | null {
    return this.adapters.get(channelId) ?? null;
  }

  /**
   * Check if a channel is registered.
   */
  has(channelId: string): boolean {
    return this.adapters.has(channelId);
  }
}
