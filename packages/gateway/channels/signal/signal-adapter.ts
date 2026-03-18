// Signal Channel Adapter — Receives and sends Signal messages via signal-cli.
//
// signal-cli is a Java command-line client that can send and receive Signal messages.
// All invocations go through SystemCommandGateway — binary allowlist enforced.
// No shell — args passed as array to execFile().
//
// If signal-cli is not installed, the adapter reports a clear "Requires signal-cli" status.
// Named session binding: personal:signal:main by default.

import type { ChannelAdapter, InboundMessage, OutboundMessage, ChannelStatus } from '../types.js';
import type { SystemCommandGateway, SystemExecuteResult } from '../../system/system-command-gateway.js';
import { sanitizeInboundContent } from '../../security/content-sanitizer.js';

export class SignalChannelAdapter implements ChannelAdapter {
  readonly channelId = 'signal';
  readonly displayName = 'Signal';

  private running = false;
  private connected = false;
  private messageCount = 0;
  private lastMessageAt: string | null = null;
  private errorMessage: string | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private signalCliPath: string | null = null;
  private phoneNumber: string | null = null;
  private systemGateway: SystemCommandGateway | null = null;
  private onMessage: ((msg: InboundMessage) => void) | null = null;

  constructor(config?: {
    signalCliPath?: string;
    phoneNumber?: string;
    systemGateway?: SystemCommandGateway;
    onMessage?: (msg: InboundMessage) => void;
  }) {
    this.signalCliPath = config?.signalCliPath ?? null;
    this.phoneNumber = config?.phoneNumber ?? null;
    this.systemGateway = config?.systemGateway ?? null;
    this.onMessage = config?.onMessage ?? null;
  }

  async start(): Promise<void> {
    if (!this.signalCliPath) {
      this.errorMessage = 'Requires signal-cli — install from https://github.com/AsamK/signal-cli';
      return;
    }
    if (!this.systemGateway) {
      this.errorMessage = 'SystemCommandGateway not available';
      return;
    }

    this.running = true;
    this.connected = true;
    this.errorMessage = null;

    // Poll for messages every 3 seconds
    this.pollInterval = setInterval(async () => {
      try {
        await this.receiveMessages();
      } catch (err) {
        console.error('[SignalAdapter] Poll error:', err);
      }
    }, 3000);
  }

  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.running = false;
    this.connected = false;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.systemGateway || !this.signalCliPath) {
      throw new Error('Signal adapter not configured');
    }

    await this.systemGateway.execute({
      binary: this.signalCliPath,
      args: ['send', '-m', message.content, message.recipientId],
      timeoutSeconds: 30,
    });
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

  // ─── Private ──────────────────────────────────────────────────────────────

  private async receiveMessages(): Promise<void> {
    if (!this.systemGateway || !this.signalCliPath) return;

    let result: SystemExecuteResult;
    try {
      result = await this.systemGateway.execute({
        binary: this.signalCliPath,
        args: ['--output=json', 'receive', '--timeout=1'],
        timeoutSeconds: 10,
      });
    } catch {
      return; // signal-cli not available or not in allowlist
    }

    if (result.exitCode !== 0 || !result.stdout.trim()) return;

    // Parse JSON output lines
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as {
          envelope?: {
            source?: string;
            sourceName?: string;
            dataMessage?: { message?: string; timestamp?: number };
          };
        };

        if (msg.envelope?.dataMessage?.message) {
          const inbound: InboundMessage = {
            channelId: 'signal',
            senderId: msg.envelope.source ?? 'unknown',
            senderDisplayName: msg.envelope.sourceName,
            content: sanitizeInboundContent(msg.envelope.dataMessage.message),
            timestamp: new Date(msg.envelope.dataMessage.timestamp ?? Date.now()).toISOString(),
          };

          this.messageCount++;
          this.lastMessageAt = inbound.timestamp;
          this.onMessage?.(inbound);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }
}
