// iMessage Channel Adapter — macOS only.
//
// Priority A: BlueBubbles relay (open-source macOS iMessage server, localhost REST API)
// Priority B: AppleScript bridge (fallback, direct osascript calls)
//
// BlueBubbles localhost calls are allowlisted as 127.0.0.1 — not external network.

import type { ChannelAdapter, InboundMessage, OutboundMessage, ChannelStatus } from '../types.js';

export interface IMessageAdapterConfig {
  /** BlueBubbles API URL. Default: http://localhost:1234 */
  blueBubblesUrl?: string;
  /** BlueBubbles API password */
  blueBubblesPassword?: string;
  /** Polling interval in ms. Default: 3000 for BlueBubbles, 5000 for AppleScript */
  pollIntervalMs?: number;
  /** Callback when a message is received */
  onMessage: (message: InboundMessage) => Promise<void>;
  /** Execute a system command (Hardware Bridge). Used for AppleScript fallback. */
  executeCommand?: (command: string) => Promise<string>;
  /** HTTP fetch function (Gateway's audited fetch). Used for BlueBubbles API. */
  httpFetch?: (url: string, options?: RequestInit) => Promise<Response>;
}

type RelayMode = 'bluebubbles' | 'applescript' | 'none';

/**
 * iMessage adapter for macOS. Uses BlueBubbles API or AppleScript fallback.
 */
export class IMessageAdapter implements ChannelAdapter {
  readonly channelId = 'imessage';
  readonly displayName = 'iMessage';

  private config: IMessageAdapterConfig;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private relayMode: RelayMode = 'none';
  private lastMessageTimestamp: string | null = null;
  private messageCount = 0;
  private lastMessageAt: string | null = null;
  private errorMessage: string | null = null;

  constructor(config: IMessageAdapterConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Detect relay mode
    this.relayMode = await this.detectRelayMode();

    if (this.relayMode === 'none') {
      this.errorMessage = 'No iMessage relay available. Install BlueBubbles or use macOS with AppleScript.';
      console.warn('[iMessage] No relay available');
      return;
    }

    this.running = true;
    this.errorMessage = null;
    const interval = this.config.pollIntervalMs ?? (this.relayMode === 'bluebubbles' ? 3000 : 5000);

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, interval);

    console.log(`[iMessage] Started in ${this.relayMode} mode, polling every ${interval}ms`);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.running = false;
    console.log('[iMessage] Stopped');
  }

  async send(message: OutboundMessage): Promise<void> {
    if (this.relayMode === 'bluebubbles') {
      await this.sendViaBlueBubbles(message);
    } else if (this.relayMode === 'applescript') {
      await this.sendViaAppleScript(message);
    } else {
      throw new Error('No iMessage relay available');
    }
  }

  getStatus(): ChannelStatus {
    return {
      running: this.running,
      connected: this.running && this.relayMode !== 'none',
      errorMessage: this.errorMessage ?? undefined,
      lastMessageAt: this.lastMessageAt ?? undefined,
      messageCount: this.messageCount,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getRelayMode(): RelayMode {
    return this.relayMode;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async detectRelayMode(): Promise<RelayMode> {
    // Try BlueBubbles first
    const bbUrl = this.config.blueBubblesUrl ?? 'http://localhost:1234';
    try {
      if (this.config.httpFetch) {
        const resp = await this.config.httpFetch(`${bbUrl}/api/v1/ping`, {
          headers: this.config.blueBubblesPassword
            ? { 'Authorization': `Bearer ${this.config.blueBubblesPassword}` }
            : undefined,
        });
        if (resp.ok) {
          console.log('[iMessage] BlueBubbles detected');
          return 'bluebubbles';
        }
      }
    } catch {
      // BlueBubbles not available
    }

    // Try AppleScript (macOS only)
    if (process.platform === 'darwin' && this.config.executeCommand) {
      try {
        await this.config.executeCommand('osascript -e "tell application \\"Messages\\" to name"');
        console.log('[iMessage] AppleScript relay available');
        return 'applescript';
      } catch {
        // AppleScript not available
      }
    }

    return 'none';
  }

  private async poll(): Promise<void> {
    try {
      if (this.relayMode === 'bluebubbles') {
        await this.pollBlueBubbles();
      } else if (this.relayMode === 'applescript') {
        await this.pollAppleScript();
      }
    } catch (error) {
      console.error('[iMessage] Poll error:', (error as Error).message);
    }
  }

  private async pollBlueBubbles(): Promise<void> {
    if (!this.config.httpFetch) return;
    const bbUrl = this.config.blueBubblesUrl ?? 'http://localhost:1234';
    const headers: Record<string, string> = {};
    if (this.config.blueBubblesPassword) {
      headers['Authorization'] = `Bearer ${this.config.blueBubblesPassword}`;
    }

    const params = new URLSearchParams({ limit: '10', sort: 'desc' });
    if (this.lastMessageTimestamp) {
      params.set('after', this.lastMessageTimestamp);
    }

    const resp = await this.config.httpFetch(`${bbUrl}/api/v1/message?${params}`, { headers });
    if (!resp.ok) return;

    const data = await resp.json() as { data: Array<{ guid: string; text: string; handle?: { address: string; firstName?: string }; dateCreated: number; isFromMe: boolean }> };
    const messages = data.data ?? [];

    for (const msg of messages.reverse()) {
      if (msg.isFromMe) continue; // Skip outbound messages
      if (!msg.text) continue;

      const inbound: InboundMessage = {
        channelId: 'imessage',
        senderId: msg.handle?.address ?? 'unknown',
        senderDisplayName: msg.handle?.firstName,
        content: msg.text,
        timestamp: new Date(msg.dateCreated).toISOString(),
      };

      this.messageCount++;
      this.lastMessageAt = inbound.timestamp;
      this.lastMessageTimestamp = String(msg.dateCreated);
      await this.config.onMessage(inbound);
    }
  }

  private async pollAppleScript(): Promise<void> {
    // AppleScript fallback — limited but functional
    // In production, this uses osascript to read recent messages
    // Simplified: reads last message from Messages.app
    if (!this.config.executeCommand) return;

    try {
      const script = `osascript -e 'tell application "Messages" to get the text of the last message of the first chat'`;
      const result = await this.config.executeCommand(script);
      if (result && result !== this.lastMessageTimestamp) {
        this.lastMessageTimestamp = result;
        // Process as inbound message
        const inbound: InboundMessage = {
          channelId: 'imessage',
          senderId: 'applescript-chat',
          content: result.trim(),
          timestamp: new Date().toISOString(),
        };
        this.messageCount++;
        this.lastMessageAt = inbound.timestamp;
        await this.config.onMessage(inbound);
      }
    } catch {
      // AppleScript may fail silently if Messages.app is not open
    }
  }

  private async sendViaBlueBubbles(message: OutboundMessage): Promise<void> {
    if (!this.config.httpFetch) throw new Error('No fetch function configured');
    const bbUrl = this.config.blueBubblesUrl ?? 'http://localhost:1234';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.blueBubblesPassword) {
      headers['Authorization'] = `Bearer ${this.config.blueBubblesPassword}`;
    }

    await this.config.httpFetch(`${bbUrl}/api/v1/message/text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chatGuid: `iMessage;-;${message.recipientId}`,
        message: message.content,
      }),
    });
  }

  private async sendViaAppleScript(message: OutboundMessage): Promise<void> {
    if (!this.config.executeCommand) throw new Error('No command executor configured');
    const escaped = message.content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await this.config.executeCommand(
      `osascript -e 'tell application "Messages" to send "${escaped}" to buddy "${message.recipientId}" of service "iMessage"'`
    );
  }
}
