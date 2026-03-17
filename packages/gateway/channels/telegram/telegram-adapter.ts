// Telegram Channel Adapter — Bot API via direct HTTP.
//
// No grammY library. Direct HTTP via globalThis.fetch in the Gateway.
// Long-polling: GET /getUpdates?offset=N&timeout=30
// All network calls are fully audited through the Gateway.

import type { ChannelAdapter, InboundMessage, OutboundMessage, ChannelStatus } from '../types.js';

export interface TelegramAdapterConfig {
  /** Telegram bot token from @BotFather */
  botToken: string;
  /** Long-poll timeout in seconds. Default: 30 */
  pollTimeoutSeconds?: number;
  /** Callback when a message is received */
  onMessage: (message: InboundMessage) => Promise<void>;
  /** HTTP fetch function (Gateway's audited fetch) */
  httpFetch?: (url: string, options?: RequestInit) => Promise<Response>;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

/**
 * Telegram adapter using the Bot API with long-polling.
 */
export class TelegramAdapter implements ChannelAdapter {
  readonly channelId = 'telegram';
  readonly displayName = 'Telegram';

  private config: TelegramAdapterConfig;
  private running = false;
  private lastUpdateId = 0;
  private messageCount = 0;
  private lastMessageAt: string | null = null;
  private errorMessage: string | null = null;
  private pollAbort: AbortController | null = null;

  constructor(config: TelegramAdapterConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.botToken) {
      this.errorMessage = 'Telegram bot token not configured';
      return;
    }

    this.running = true;
    this.errorMessage = null;
    console.log('[Telegram] Starting long-poll loop');

    // Start polling loop (non-blocking)
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollAbort) {
      this.pollAbort.abort();
      this.pollAbort = null;
    }
    console.log('[Telegram] Stopped');
  }

  async send(message: OutboundMessage): Promise<void> {
    const fetchFn = this.config.httpFetch ?? globalThis.fetch;
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.recipientId,
        text: message.content,
        ...(message.replyToId ? { reply_to_message_id: parseInt(message.replyToId, 10) } : {}),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Telegram sendMessage failed: ${resp.status} ${text}`);
    }
  }

  getStatus(): ChannelStatus {
    return {
      running: this.running,
      connected: this.running && !this.errorMessage,
      errorMessage: this.errorMessage ?? undefined,
      lastMessageAt: this.lastMessageAt ?? undefined,
      messageCount: this.messageCount,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        if (!this.running) break; // Aborted during shutdown
        const msg = (error as Error).message;
        if (!msg.includes('aborted')) {
          this.errorMessage = msg;
          console.error('[Telegram] Poll error:', msg);
          // Back off on error
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
  }

  private async pollOnce(): Promise<void> {
    const fetchFn = this.config.httpFetch ?? globalThis.fetch;
    const timeout = this.config.pollTimeoutSeconds ?? 30;

    this.pollAbort = new AbortController();
    const url = `https://api.telegram.org/bot${this.config.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=${timeout}`;

    const resp = await fetchFn(url, {
      signal: this.pollAbort.signal,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`getUpdates failed: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { ok: boolean; result: TelegramUpdate[] };
    if (!data.ok || !data.result) return;

    for (const update of data.result) {
      this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);

      if (!update.message?.text) continue;

      const msg = update.message;
      const inbound: InboundMessage = {
        channelId: 'telegram',
        senderId: String(msg.chat.id),
        senderDisplayName: msg.from?.first_name ?? msg.from?.username ?? undefined,
        content: msg.text ?? '',
        timestamp: new Date(msg.date * 1000).toISOString(),
        threadId: String(msg.message_id),
      };

      this.messageCount++;
      this.lastMessageAt = inbound.timestamp;
      this.errorMessage = null;
      await this.config.onMessage(inbound);
    }
  }
}
