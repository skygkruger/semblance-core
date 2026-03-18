// Slack Channel Adapter — Receives and sends Slack DMs via Socket Mode.
//
// NOTE: This is NOT the existing packages/gateway/services/slack/slack-adapter.ts
// (OAuth data import). This is a MESSAGING channel adapter for real-time DMs.
//
// Uses Slack's Web API via direct fetch — no Bolt SDK dependency.
// Socket Mode URL obtained from: apps.connections.open API endpoint.
// WebSocket maintained as long as the daemon is running.
//
// Scope: DM messages only. Public channel messages are not processed.
// Named session binding: work:slack:main by default (work context).

import type { ChannelAdapter, InboundMessage, OutboundMessage, ChannelStatus } from '../types.js';
import { sanitizeInboundContent } from '../../security/content-sanitizer.js';

/** Minimal WebSocket interface to avoid ws type dependency. */
interface WebSocketLike {
  on(event: string, handler: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}

export class SlackChannelAdapter implements ChannelAdapter {
  readonly channelId = 'slack';
  readonly displayName = 'Slack';

  private running = false;
  private connected = false;
  private messageCount = 0;
  private lastMessageAt: string | null = null;
  private errorMessage: string | null = null;
  private botToken: string | null = null;
  private appToken: string | null = null;
  private ws: unknown = null; // WebSocket connection
  private onMessage: ((msg: InboundMessage) => void) | null = null;

  constructor(config?: {
    botToken?: string;
    appToken?: string;
    onMessage?: (msg: InboundMessage) => void;
  }) {
    this.botToken = config?.botToken ?? null;
    this.appToken = config?.appToken ?? null;
    this.onMessage = config?.onMessage ?? null;
  }

  /**
   * Set tokens (called from bridge handler when user configures).
   */
  setTokens(botToken: string, appToken: string): void {
    this.botToken = botToken;
    this.appToken = appToken;
  }

  async start(): Promise<void> {
    if (!this.botToken || !this.appToken) {
      this.errorMessage = 'Slack tokens not configured — add Bot Token (xoxb-) and App Token (xapp-) in Settings';
      return;
    }

    try {
      // Get Socket Mode WebSocket URL
      const connectResponse = await fetch('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.appToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const connectData = await connectResponse.json() as { ok: boolean; url?: string; error?: string };
      if (!connectData.ok || !connectData.url) {
        this.errorMessage = `Slack connection failed: ${connectData.error ?? 'no URL returned'}`;
        return;
      }

      // Connect via WebSocket (dynamic import for Node.js ws compatibility)
      try {
        const wsModule = await import('ws' as string) as { WebSocket: new (url: string) => WebSocketLike };
        this.ws = new wsModule.WebSocket(connectData.url);

        const socket = this.ws as WebSocketLike;

        socket.on('open', () => {
          this.connected = true;
          this.running = true;
          this.errorMessage = null;
          console.error('[SlackChannel] Socket Mode connected');
        });

        socket.on('message', ((...args: unknown[]) => {
          const data = args[0] as { toString(): string };
          try {
            const event = JSON.parse(data.toString()) as {
              type?: string;
              envelope_id?: string;
              payload?: {
                event?: {
                  type?: string;
                  channel_type?: string;
                  user?: string;
                  text?: string;
                  ts?: string;
                };
              };
            };

            // Acknowledge the envelope
            if (event.envelope_id) {
              socket.send(JSON.stringify({ envelope_id: event.envelope_id }));
            }

            // Process DM messages only
            if (
              event.type === 'events_api' &&
              event.payload?.event?.type === 'message' &&
              event.payload.event.channel_type === 'im' &&
              event.payload.event.text
            ) {
              const inbound: InboundMessage = {
                channelId: 'slack',
                senderId: event.payload.event.user ?? 'unknown',
                content: sanitizeInboundContent(event.payload.event.text),
                timestamp: event.payload.event.ts
                  ? new Date(parseFloat(event.payload.event.ts) * 1000).toISOString()
                  : new Date().toISOString(),
              };

              this.messageCount++;
              this.lastMessageAt = inbound.timestamp;
              this.onMessage?.(inbound);
            }
          } catch (parseErr) {
            console.error('[SlackChannel] Message parse error:', parseErr);
          }
        }) as (...args: unknown[]) => void);

        socket.on('close', () => {
          this.connected = false;
          console.error('[SlackChannel] Socket Mode disconnected');
        });

        socket.on('error', ((...errArgs: unknown[]) => {
          const err = errArgs[0] as { message?: string };
          this.errorMessage = `Slack WebSocket error: ${err.message ?? 'unknown'}`;
          console.error('[SlackChannel] WebSocket error:', err.message);
        }) as (...args: unknown[]) => void);
      } catch {
        // ws module not available — fall back to polling
        this.errorMessage = 'WebSocket module not available — Slack Socket Mode requires ws package';
      }
    } catch (err) {
      this.errorMessage = `Slack connection failed: ${(err as Error).message}`;
    }
  }

  async stop(): Promise<void> {
    if (this.ws) {
      try { (this.ws as WebSocketLike).close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.running = false;
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.botToken) {
      throw new Error('Slack bot token not configured');
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: message.recipientId,
        text: message.content,
      }),
    });

    const data = await response.json() as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack send failed: ${data.error}`);
    }
  }

  getStatus(): ChannelStatus {
    return {
      running: this.running,
      connected: this.connected,
      errorMessage: this.errorMessage ?? undefined,
      lastMessageAt: this.lastMessageAt ?? undefined,
      messageCount: this.messageCount,
    };
  }

  isRunning(): boolean {
    return this.running;
  }
}
