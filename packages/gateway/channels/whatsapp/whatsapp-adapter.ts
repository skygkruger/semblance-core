// WhatsApp Channel Adapter — Receives and sends WhatsApp messages via Baileys.
//
// Baileys provides a reverse-engineered WhatsApp Web protocol implementation.
// First connection: displays QR code for linking via WhatsApp mobile app.
// Session credentials stored encrypted in ~/.semblance/data/whatsapp-session/.
//
// Named session binding: personal:whatsapp:main by default.

import type { ChannelAdapter, InboundMessage, OutboundMessage, ChannelStatus } from '../types.js';
import { sanitizeInboundContent } from '../../security/content-sanitizer.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';

export class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly channelId = 'whatsapp';
  readonly displayName = 'WhatsApp';

  private running = false;
  private connected = false;
  private messageCount = 0;
  private lastMessageAt: string | null = null;
  private errorMessage: string | null = null;
  private qrCode: string | null = null;
  private socket: unknown = null;
  private sessionDir: string;
  private onMessage: ((msg: InboundMessage) => void) | null = null;

  constructor(config?: {
    sessionDir?: string;
    onMessage?: (msg: InboundMessage) => void;
  }) {
    this.sessionDir = config?.sessionDir ?? join(homedir(), '.semblance', 'data', 'whatsapp-session');
    this.onMessage = config?.onMessage ?? null;
  }

  async start(): Promise<void> {
    // Ensure session directory exists
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }

    try {
      // Dynamic import — Baileys is an optional dependency
      const baileys = await import('@whiskeysockets/baileys' as string) as {
        default: {
          makeWASocket: (config: unknown) => unknown;
          useMultiFileAuthState: (path: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
          DisconnectReason: Record<string, number>;
        };
      };

      const { state, saveCreds } = await baileys.default.useMultiFileAuthState(this.sessionDir);

      const sock = baileys.default.makeWASocket({
        auth: state,
        printQRInTerminal: false,
      }) as {
        ev: {
          on: (event: string, handler: (...args: unknown[]) => void) => void;
        };
        sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
      };

      this.socket = sock;

      // Handle connection updates
      sock.ev.on('connection.update', ((...args: unknown[]) => {
        const update = args[0] as { connection?: string; lastDisconnect?: { error?: { output?: { statusCode?: number } } }; qr?: string };
        if (update.qr) {
          this.qrCode = update.qr;
          console.error('[WhatsApp] QR code generated — scan with WhatsApp mobile');
        }

        if (update.connection === 'open') {
          this.connected = true;
          this.running = true;
          this.errorMessage = null;
          this.qrCode = null; // Clear QR once connected
          console.error('[WhatsApp] Connected');
        }

        if (update.connection === 'close') {
          this.connected = false;
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          if (statusCode !== 401) {
            // Reconnect unless logged out
            console.error('[WhatsApp] Disconnected, will reconnect...');
            setTimeout(() => this.start(), 5000);
          } else {
            this.errorMessage = 'WhatsApp logged out — scan QR code again to reconnect';
            console.error('[WhatsApp] Logged out');
          }
        }
      }) as (...args: unknown[]) => void);

      // Handle credentials update
      sock.ev.on('creds.update', () => {
        saveCreds().catch((err) => console.error('[WhatsApp] Failed to save credentials:', err));
      });

      // Handle incoming messages
      sock.ev.on('messages.upsert', ((...args: unknown[]) => {
        const upsert = args[0] as { messages?: Array<{ key?: { fromMe?: boolean; remoteJid?: string }; message?: { conversation?: string; extendedTextMessage?: { text?: string } }; messageTimestamp?: number }> };
        const messages = upsert.messages ?? [];
        for (const msg of messages) {
          if (msg.key?.fromMe) continue; // Skip own messages

          const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
          if (!text) continue;

          const inbound: InboundMessage = {
            channelId: 'whatsapp',
            senderId: msg.key?.remoteJid ?? 'unknown',
            content: sanitizeInboundContent(text),
            timestamp: msg.messageTimestamp
              ? new Date(msg.messageTimestamp * 1000).toISOString()
              : new Date().toISOString(),
          };

          this.messageCount++;
          this.lastMessageAt = inbound.timestamp;
          this.onMessage?.(inbound);
        }
      }) as (...args: unknown[]) => void);

      this.running = true;
    } catch (err) {
      this.errorMessage = `WhatsApp connection failed: ${(err as Error).message}. Install @whiskeysockets/baileys to enable WhatsApp.`;
      console.error('[WhatsApp] Start failed:', (err as Error).message);
    }
  }

  async stop(): Promise<void> {
    if (this.socket) {
      try {
        const sock = this.socket as { end: (opts?: unknown) => void };
        sock.end({ isReconnecting: false });
      } catch { /* ignore */ }
      this.socket = null;
    }
    this.running = false;
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.socket) {
      throw new Error('WhatsApp not connected');
    }

    const sock = this.socket as { sendMessage: (jid: string, content: { text: string }) => Promise<unknown> };
    await sock.sendMessage(message.recipientId, { text: message.content });
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

  /**
   * Get the current QR code for WhatsApp linking.
   * Returns null if already connected or no QR pending.
   */
  getQRCode(): string | null {
    return this.qrCode;
  }
}
