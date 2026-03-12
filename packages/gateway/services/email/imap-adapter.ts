// IMAP Adapter — Real email fetching via IMAP protocol.
//
// AUTONOMOUS DECISION: Using imapflow for IMAP.
// Reasoning: imapflow is the standard modern Node.js IMAP library. It is
// Promise-based, actively maintained, handles TLS natively, supports IMAP
// extensions (IDLE, CONDSTORE), and has built-in connection pooling. The Gateway
// is the sole process with network entitlement, so this dependency is correctly scoped.
// Escalation check: Build prompt recommends imapflow explicitly.

import { ImapFlow } from 'imapflow';
import type { ServiceCredential } from '../../credentials/types.js';
import type { CredentialStore } from '../../credentials/store.js';
import type { EmailMessage, EmailFetchParams, EmailAddress } from './types.js';

interface ConnectionEntry {
  client: ImapFlow;
  lastUsed: number;
  credentialId: string;
}

/**
 * Parse an email address from various formats into our EmailAddress shape.
 */
export function parseAddress(addr: unknown): EmailAddress {
  if (addr && typeof addr === 'object' && 'address' in addr) {
    const a = addr as { name?: string; address?: string };
    return { name: a.name ?? '', address: a.address ?? '' };
  }
  if (typeof addr === 'string') {
    return { name: '', address: addr };
  }
  return { name: '', address: '' };
}

export function parseAddressList(list: unknown): EmailAddress[] {
  if (!list) return [];
  if (Array.isArray(list)) return list.map(parseAddress);
  // imapflow may return a single object
  return [parseAddress(list)];
}

/**
 * Derive a thread ID from In-Reply-To and References headers.
 * ImapFlow returns a Buffer when specific header names are requested,
 * or a Map when `headers: true` is used. Handle both.
 */
export function deriveThreadId(headers: Map<string, string[]> | Buffer | undefined): string | undefined {
  if (!headers) return undefined;

  // If headers is a Buffer (raw header text from ImapFlow specific-header fetch),
  // parse it into a simple map
  if (Buffer.isBuffer(headers)) {
    const text = headers.toString('utf-8');
    const referencesMatch = text.match(/^references:\s*(.+)/im);
    if (referencesMatch) {
      const firstRef = referencesMatch[1]!.trim().split(/\s+/)[0];
      return firstRef || undefined;
    }
    const replyToMatch = text.match(/^in-reply-to:\s*(.+)/im);
    if (replyToMatch) {
      return replyToMatch[1]!.trim().split(/\s+/)[0] || undefined;
    }
    return undefined;
  }

  // Map path (when headers: true is used)
  if (typeof headers.get !== 'function') return undefined;

  // Use the first References header value as thread ID
  const references = headers.get('references');
  if (references && references.length > 0) {
    const firstRef = references[0]!.trim().split(/\s+/)[0];
    return firstRef || undefined;
  }

  // Fall back to In-Reply-To
  const inReplyTo = headers.get('in-reply-to');
  if (inReplyTo && inReplyTo.length > 0) {
    return inReplyTo[0]!.trim() || undefined;
  }

  return undefined;
}

export class IMAPAdapter {
  private connections: Map<string, ConnectionEntry> = new Map();
  private credentialStore: CredentialStore;
  private idleTimeoutMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(credentialStore: CredentialStore, options?: { idleTimeoutMs?: number }) {
    this.credentialStore = credentialStore;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? 300_000; // 5 minutes default

    // Periodic cleanup of idle connections
    this.cleanupInterval = setInterval(() => this.cleanupIdle(), 60_000);
  }

  /**
   * Get or create an IMAP connection using OAuth2 XOAUTH2 authentication.
   * Used for Gmail and other providers that support IMAP with OAuth tokens.
   */
  private async getOAuthConnection(connectionKey: string, host: string, port: number, userEmail: string, accessToken: string): Promise<ImapFlow> {
    const existing = this.connections.get(connectionKey);
    if (existing && existing.client.usable) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    // Clean up dead connection
    if (existing) {
      try { existing.client.close(); } catch { /* already dead */ }
      this.connections.delete(connectionKey);
    }

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      tls: { rejectUnauthorized: true },
      auth: {
        user: userEmail,
        accessToken,
      },
      logger: false,
    });

    await client.connect();

    this.connections.set(connectionKey, {
      client,
      lastUsed: Date.now(),
      credentialId: connectionKey,
    });

    return client;
  }

  /**
   * Fetch messages using OAuth2 XOAUTH2 authentication (e.g. Gmail).
   */
  async fetchMessagesOAuth(host: string, port: number, userEmail: string, accessToken: string, params: EmailFetchParams): Promise<EmailMessage[]> {
    const connectionKey = `oauth_${userEmail}`;
    const client = await this.getOAuthConnection(connectionKey, host, port, userEmail, accessToken);
    return this.fetchFromClient(client, params);
  }

  /**
   * Get or create an IMAP connection for the given credential.
   */
  private async getConnection(credentialId: string): Promise<ImapFlow> {
    const existing = this.connections.get(credentialId);
    if (existing && existing.client.usable) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    // Clean up dead connection if it exists
    if (existing) {
      try { existing.client.close(); } catch { /* already dead */ }
      this.connections.delete(credentialId);
    }

    const credential = this.credentialStore.get(credentialId);
    if (!credential) throw new Error(`Credential not found: ${credentialId}`);
    if (credential.protocol !== 'imap') throw new Error(`Credential ${credentialId} is not an IMAP credential`);

    const password = this.credentialStore.decryptPassword(credential);

    const client = new ImapFlow({
      host: credential.host,
      port: credential.port,
      secure: credential.useTLS,
      tls: { rejectUnauthorized: true },
      auth: {
        user: credential.username,
        pass: password,
      },
      logger: false,
    });

    await client.connect();

    this.connections.set(credentialId, {
      client,
      lastUsed: Date.now(),
      credentialId,
    });

    return client;
  }

  /**
   * Fetch emails from an IMAP server.
   */
  async fetchMessages(credentialId: string, params: EmailFetchParams): Promise<EmailMessage[]> {
    const client = await this.getConnection(credentialId);
    return this.fetchFromClient(client, params);
  }

  /**
   * Shared fetch implementation used by both credential-based and OAuth-based connections.
   */
  private async fetchFromClient(client: ImapFlow, params: EmailFetchParams): Promise<EmailMessage[]> {
    const folder = params.folder ?? 'INBOX';
    const limit = params.limit ?? 50;

    const lock = await client.getMailboxLock(folder);
    try {
      const messages: EmailMessage[] = [];

      // Build search query
      let searchCriteria: Record<string, unknown> = {};
      if (params.since) {
        searchCriteria = { since: new Date(params.since) };
      }
      if (params.unreadOnly) {
        searchCriteria = { ...searchCriteria, seen: false };
      }
      if (params.search) {
        // Parse simple IMAP search criteria
        if (params.search === 'UNSEEN') {
          searchCriteria = { ...searchCriteria, seen: false };
        }
      }

      // Fetch specific messages by UID or search
      let uids: number[] | string;
      if (params.messageIds && params.messageIds.length > 0) {
        uids = params.messageIds.map(Number).filter(n => !isNaN(n));
        if (uids.length === 0) return [];
      } else if (Object.keys(searchCriteria).length > 0) {
        const searchResult = await client.search(searchCriteria);
        if (!searchResult) return [];
        uids = (searchResult as number[]).slice(-limit).map(Number);
        if (uids.length === 0) return [];
      } else {
        // Default: fetch most recent messages
        const exists = client.mailbox && client.mailbox.exists;
        uids = `${Math.max(1, ((exists || limit) as number) - limit + 1)}:*`;
      }

      const fetchOptions = {
        uid: true,
        envelope: true,
        source: true,
        bodyStructure: true,
        flags: true,
        headers: ['in-reply-to', 'references'],
      };

      for await (const msg of client.fetch(uids, fetchOptions)) {
        try {
          const envelope = msg.envelope;
          if (!envelope) continue;

          // Parse body from source
          let textBody = '';
          let htmlBody: string | undefined;
          if (msg.source) {
            const source = msg.source.toString('utf-8');
            // Simple body extraction — handles basic MIME
            const bodyMatch = source.match(/\r?\n\r?\n([\s\S]*)/);
            if (bodyMatch) {
              textBody = bodyMatch[1] ?? '';
              // Check for HTML content
              if (source.includes('Content-Type: text/html')) {
                htmlBody = textBody;
                textBody = htmlBody.replace(/<[^>]+>/g, '');
              }
            }
          }

          // Parse attachments from body structure
          const attachments: EmailMessage['attachments'] = [];
          if (msg.bodyStructure) {
            const parts = msg.bodyStructure.childNodes ?? [];
            for (const part of parts) {
              if (part.disposition === 'attachment' || part.disposition === 'inline') {
                attachments.push({
                  filename: (part.dispositionParameters as Record<string, string>)?.filename ?? 'untitled',
                  contentType: part.type ?? 'application/octet-stream',
                  size: part.size ?? 0,
                });
              }
            }
          }

          const threadId = deriveThreadId(msg.headers as Map<string, string[]> | Buffer | undefined);

          messages.push({
            id: String(msg.uid),
            messageId: envelope.messageId ?? '',
            threadId,
            from: parseAddress(envelope.from?.[0]),
            to: parseAddressList(envelope.to),
            cc: parseAddressList(envelope.cc),
            subject: envelope.subject ?? '(no subject)',
            date: envelope.date?.toISOString() ?? new Date().toISOString(),
            body: { text: textBody, html: htmlBody },
            flags: msg.flags ? [...msg.flags] : [],
            attachments,
          });
        } catch (err) {
          // Gracefully skip malformed messages
          console.error(`[IMAPAdapter] Failed to parse message UID ${msg.uid}:`, err);
        }
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  /**
   * List available IMAP folders.
   */
  async listFolders(credentialId: string): Promise<string[]> {
    const client = await this.getConnection(credentialId);
    const folders: string[] = [];

    const tree = await client.list();
    for (const folder of tree) {
      folders.push(folder.path);
    }

    return folders;
  }

  /**
   * Test IMAP connection: connect, authenticate, list folders, disconnect.
   */
  async testConnection(credential: ServiceCredential, password: string): Promise<{ success: boolean; error?: string }> {
    const client = new ImapFlow({
      host: credential.host,
      port: credential.port,
      secure: credential.useTLS,
      tls: { rejectUnauthorized: true },
      auth: {
        user: credential.username,
        pass: password,
      },
      logger: false,
    });

    try {
      await client.connect();
      await client.list(); // Verify we can list folders
      await client.logout();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Provide clear error messages for common failures
      if (message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials') || message.includes('LOGIN')) {
        return { success: false, error: 'Authentication failed — check your password' };
      }
      if (message.includes('ECONNREFUSED') || message.includes('connect ECONNREFUSED')) {
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
      try { client.close(); } catch { /* already closed */ }
    }
  }

  /**
   * Archive messages by moving them from INBOX to an archive folder.
   * Provider-specific: Gmail uses '[Gmail]/All Mail', generic IMAP uses 'Archive'.
   */
  async archiveMessages(credentialId: string, messageIds: string[], targetFolder?: string): Promise<void> {
    const client = await this.getConnection(credentialId);
    const archiveFolder = targetFolder ?? 'Archive';

    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = messageIds.map(Number).filter(n => !isNaN(n));
      if (uids.length === 0) return;

      // Try MOVE first (more efficient), fall back to COPY+DELETE
      try {
        await client.messageMove(uids, archiveFolder, { uid: true });
      } catch {
        // MOVE not supported, fall back to COPY + flag \Deleted + EXPUNGE
        await client.messageCopy(uids, archiveFolder, { uid: true });
        await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  /**
   * Move messages between IMAP folders.
   */
  async moveMessages(credentialId: string, messageIds: string[], fromFolder: string, toFolder: string): Promise<void> {
    const client = await this.getConnection(credentialId);

    const lock = await client.getMailboxLock(fromFolder);
    try {
      const uids = messageIds.map(Number).filter(n => !isNaN(n));
      if (uids.length === 0) return;

      try {
        await client.messageMove(uids, toFolder, { uid: true });
      } catch {
        await client.messageCopy(uids, toFolder, { uid: true });
        await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  /**
   * Mark messages as read or unread.
   */
  async markAsRead(credentialId: string, messageIds: string[], read: boolean): Promise<void> {
    const client = await this.getConnection(credentialId);

    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = messageIds.map(Number).filter(n => !isNaN(n));
      if (uids.length === 0) return;

      if (read) {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      } else {
        await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  /**
   * Save a draft to the IMAP Drafts folder via APPEND.
   */
  async saveDraft(credentialId: string, draft: {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    replyToMessageId?: string;
  }): Promise<void> {
    const client = await this.getConnection(credentialId);

    // Construct a simple RFC 2822 message
    const credential = this.credentialStore.get(credentialId);
    if (!credential) throw new Error(`Credential not found: ${credentialId}`);

    const headers = [
      `From: ${credential.username}`,
      `To: ${draft.to.join(', ')}`,
    ];
    if (draft.cc && draft.cc.length > 0) {
      headers.push(`Cc: ${draft.cc.join(', ')}`);
    }
    headers.push(`Subject: ${draft.subject}`);
    headers.push(`Date: ${new Date().toUTCString()}`);
    headers.push(`Message-ID: <draft-${Date.now()}@semblance.local>`);
    if (draft.replyToMessageId) {
      headers.push(`In-Reply-To: ${draft.replyToMessageId}`);
      headers.push(`References: ${draft.replyToMessageId}`);
    }
    headers.push('MIME-Version: 1.0');
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('');

    const rawMessage = headers.join('\r\n') + '\r\n' + draft.body;

    await client.append('Drafts', Buffer.from(rawMessage), ['\\Draft']);
  }

  /**
   * Clean up idle connections.
   */
  private cleanupIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this.connections) {
      if (now - entry.lastUsed > this.idleTimeoutMs) {
        try { entry.client.close(); } catch { /* ignore */ }
        this.connections.delete(id);
      }
    }
  }

  /**
   * Close all connections and clean up.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [, entry] of this.connections) {
      try { await entry.client.logout(); } catch { /* ignore */ }
      try { entry.client.close(); } catch { /* ignore */ }
    }
    this.connections.clear();
  }
}
