// SMTP Adapter — Real email sending via SMTP protocol.
//
// AUTONOMOUS DECISION: Using nodemailer for SMTP.
// Reasoning: nodemailer is the industry-standard Node.js SMTP library. It handles
// TLS, DKIM, connection pooling, and all RFC compliance. It is actively maintained
// with millions of weekly downloads. Gateway-only dependency.
// Escalation check: Build prompt recommends nodemailer explicitly.

import { createTransport, type Transporter } from 'nodemailer';
import type { ServiceCredential } from '../../credentials/types.js';
import type { CredentialStore } from '../../credentials/store.js';
import type { EmailSendParams } from './types.js';

// Rate limiting: max emails per minute per account (configurable)
const DEFAULT_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

interface RateEntry {
  timestamps: number[];
}

interface TransportEntry {
  transporter: Transporter;
  lastUsed: number;
  credentialId: string;
}

export class SMTPAdapter {
  private transports: Map<string, TransportEntry> = new Map();
  private rateLimits: Map<string, RateEntry> = new Map();
  private credentialStore: CredentialStore;
  private maxPerMinute: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(credentialStore: CredentialStore, options?: { maxPerMinute?: number }) {
    this.credentialStore = credentialStore;
    this.maxPerMinute = options?.maxPerMinute ?? DEFAULT_RATE_LIMIT;

    // Periodic cleanup of idle transports
    this.cleanupInterval = setInterval(() => this.cleanupIdle(), 60_000);
  }

  /**
   * Get or create an SMTP transport for the given credential.
   */
  private getTransport(credentialId: string): Transporter {
    const existing = this.transports.get(credentialId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.transporter;
    }

    const credential = this.credentialStore.get(credentialId);
    if (!credential) throw new Error(`Credential not found: ${credentialId}`);
    if (credential.protocol !== 'smtp') throw new Error(`Credential ${credentialId} is not an SMTP credential`);

    const password = this.credentialStore.decryptPassword(credential);

    const transporter = createTransport({
      host: credential.host,
      port: credential.port,
      secure: credential.port === 465, // Port 465 uses implicit TLS
      auth: {
        user: credential.username,
        pass: password,
      },
      tls: {
        rejectUnauthorized: true, // SECURITY: Always verify TLS certificates — never disable
      },
    });

    this.transports.set(credentialId, {
      transporter,
      lastUsed: Date.now(),
      credentialId,
    });

    return transporter;
  }

  /**
   * Check rate limit for a credential. Returns true if allowed.
   */
  private checkRateLimit(credentialId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(credentialId) ?? { timestamps: [] };

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < RATE_WINDOW_MS);
    this.rateLimits.set(credentialId, entry);

    return entry.timestamps.length < this.maxPerMinute;
  }

  /**
   * Record a sent email for rate limiting.
   */
  private recordSend(credentialId: string): void {
    const entry = this.rateLimits.get(credentialId) ?? { timestamps: [] };
    entry.timestamps.push(Date.now());
    this.rateLimits.set(credentialId, entry);
  }

  /**
   * Send an email via SMTP.
   * The From address is always the credential's username — cannot send from arbitrary addresses.
   */
  async sendEmail(credentialId: string, params: EmailSendParams): Promise<{ messageId: string }> {
    // Rate limit check
    if (!this.checkRateLimit(credentialId)) {
      throw new Error(`Rate limit exceeded: maximum ${this.maxPerMinute} emails per minute`);
    }

    const credential = this.credentialStore.get(credentialId);
    if (!credential) throw new Error(`Credential not found: ${credentialId}`);

    const transporter = this.getTransport(credentialId);

    // Build email headers
    const mailOptions: Record<string, unknown> = {
      from: credential.username,
      to: params.to.join(', '),
      subject: params.subject,
      text: params.body,
    };

    if (params.cc && params.cc.length > 0) {
      mailOptions['cc'] = params.cc.join(', ');
    }

    if (params.replyToMessageId) {
      mailOptions['inReplyTo'] = params.replyToMessageId;
      mailOptions['references'] = params.replyToMessageId;
    }

    const info = await transporter.sendMail(mailOptions);
    this.recordSend(credentialId);

    return { messageId: info.messageId };
  }

  /**
   * Test SMTP connection: connect, authenticate (EHLO), disconnect.
   */
  async testConnection(credential: ServiceCredential, password: string): Promise<{ success: boolean; error?: string }> {
    const transporter = createTransport({
      host: credential.host,
      port: credential.port,
      secure: credential.port === 465,
      auth: {
        user: credential.username,
        pass: password,
      },
      tls: {
        rejectUnauthorized: true, // SECURITY: Always verify TLS certificates — never disable
      },
    });

    try {
      await transporter.verify();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('EAUTH') || message.includes('Invalid login') || message.includes('535')) {
        return { success: false, error: 'Authentication failed — check your password' };
      }
      if (message.includes('ECONNREFUSED')) {
        return { success: false, error: 'Connection refused — check the server address and port' };
      }
      if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
        return { success: false, error: 'Server not found — check the hostname' };
      }
      if (message.includes('TLS') || message.includes('SSL') || message.includes('handshake')) {
        return { success: false, error: 'TLS handshake failed — the server may not support TLS on this port' };
      }
      if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
        return { success: false, error: 'Connection timed out — check the server address and port' };
      }

      return { success: false, error: message };
    } finally {
      transporter.close();
    }
  }

  /**
   * Get current rate limit status for a credential.
   */
  getRateLimitStatus(credentialId: string): { remaining: number; resetMs: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(credentialId) ?? { timestamps: [] };
    const recentSends = entry.timestamps.filter(t => now - t < RATE_WINDOW_MS);
    const remaining = Math.max(0, this.maxPerMinute - recentSends.length);
    const oldestInWindow = recentSends.length > 0 ? recentSends[0]! : now;
    const resetMs = RATE_WINDOW_MS - (now - oldestInWindow);

    return { remaining, resetMs: Math.max(0, resetMs) };
  }

  /**
   * Clean up idle transports.
   */
  private cleanupIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this.transports) {
      if (now - entry.lastUsed > 300_000) { // 5 minute idle timeout
        try { entry.transporter.close(); } catch { /* ignore */ }
        this.transports.delete(id);
      }
    }
  }

  /**
   * Close all transports and clean up.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [, entry] of this.transports) {
      try { entry.transporter.close(); } catch { /* ignore */ }
    }
    this.transports.clear();
    this.rateLimits.clear();
  }
}
