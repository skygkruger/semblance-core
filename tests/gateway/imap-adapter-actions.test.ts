// Tests for IMAP adapter extensions — archive, move, markRead, provider-specific folders.
// Uses prototype-level mocking to bypass actual network connections.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IMAPAdapter } from '@semblance/gateway/services/email/imap-adapter.js';
import { CredentialStore } from '@semblance/gateway/credentials/store.js';

// Build a mock IMAP client that mimics ImapFlow
function createMockImapClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    messageMove: vi.fn().mockResolvedValue(undefined),
    messageCopy: vi.fn().mockResolvedValue(undefined),
    messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
    messageFlagsRemove: vi.fn().mockResolvedValue(undefined),
    append: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([
      { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' },
      { path: 'Sent', name: 'Sent', specialUse: '\\Sent' },
      { path: 'Archive', name: 'Archive', specialUse: '\\Archive' },
      { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts' },
    ]),
    fetch: vi.fn().mockImplementation(function* () { /* no messages */ }),
  };
}

describe('IMAP Adapter Actions', () => {
  let adapter: IMAPAdapter;
  let credentialStore: CredentialStore;
  let db: Database.Database;
  let tempDir: string;
  let mockClient: ReturnType<typeof createMockImapClient>;
  let credId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    tempDir = join(tmpdir(), `semblance-imap-actions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    const keyPath = join(tempDir, 'credential.key');
    writeFileSync(keyPath, randomBytes(32));
    credentialStore = new CredentialStore(db, keyPath);
    adapter = new IMAPAdapter(credentialStore);

    // Add a real credential and capture its auto-generated ID
    const cred = credentialStore.add({
      serviceType: 'email',
      protocol: 'imap',
      host: 'imap.example.com',
      port: 993,
      username: 'user@example.com',
      password: 'test-password',
      useTLS: true,
      displayName: 'Work Email',
    });
    credId = cred.id;

    // Mock getConnection to return our mock client instead of connecting to real IMAP
    mockClient = createMockImapClient();
    vi.spyOn(adapter as any, 'getConnection').mockResolvedValue(mockClient);
  });

  afterEach(() => {
    adapter.shutdown();
    db.close();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  describe('archiveMessages', () => {
    it('moves messages to Archive folder', async () => {
      await adapter.archiveMessages(credId, ['1', '2', '3']);
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith('INBOX');
      expect(mockClient.messageMove).toHaveBeenCalledWith([1, 2, 3], 'Archive', { uid: true });
    });

    it('uses custom target folder when specified', async () => {
      await adapter.archiveMessages(credId, ['1'], '[Gmail]/All Mail');
      expect(mockClient.messageMove).toHaveBeenCalledWith([1], '[Gmail]/All Mail', { uid: true });
    });

    it('falls back to copy+delete when move fails', async () => {
      mockClient.messageMove.mockRejectedValueOnce(new Error('MOVE not supported'));
      await adapter.archiveMessages(credId, ['1']);
      expect(mockClient.messageCopy).toHaveBeenCalledWith([1], 'Archive', { uid: true });
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith([1], ['\\Deleted'], { uid: true });
    });

    it('handles empty message IDs gracefully', async () => {
      await adapter.archiveMessages(credId, []);
      // Should not throw, just no-op
      expect(mockClient.messageMove).not.toHaveBeenCalled();
    });

    it('skips non-numeric message IDs', async () => {
      await adapter.archiveMessages(credId, ['abc', 'def']);
      expect(mockClient.messageMove).not.toHaveBeenCalled();
    });
  });

  describe('moveMessages', () => {
    it('moves messages between folders', async () => {
      await adapter.moveMessages(credId, ['1'], 'INBOX', 'Archive');
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith('INBOX');
      expect(mockClient.messageMove).toHaveBeenCalledWith([1], 'Archive', { uid: true });
    });

    it('falls back to copy+delete when move not supported', async () => {
      mockClient.messageMove.mockRejectedValueOnce(new Error('Not supported'));
      await adapter.moveMessages(credId, ['1'], 'INBOX', 'Spam');
      expect(mockClient.messageCopy).toHaveBeenCalledWith([1], 'Spam', { uid: true });
    });
  });

  describe('markAsRead', () => {
    it('marks messages as read by adding \\Seen flag', async () => {
      await adapter.markAsRead(credId, ['1', '2'], true);
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith([1, 2], ['\\Seen'], { uid: true });
    });

    it('marks messages as unread by removing \\Seen flag', async () => {
      await adapter.markAsRead(credId, ['1'], false);
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith([1], ['\\Seen'], { uid: true });
    });

    it('handles empty message IDs', async () => {
      await adapter.markAsRead(credId, [], true);
      expect(mockClient.messageFlagsAdd).not.toHaveBeenCalled();
    });
  });

  describe('saveDraft', () => {
    it('saves a draft to the Drafts folder', async () => {
      await adapter.saveDraft(credId, {
        to: ['bob@example.com'],
        subject: 'Draft Subject',
        body: 'Draft body content',
      });
      expect(mockClient.append).toHaveBeenCalled();
      const appendArgs = mockClient.append.mock.calls[0]!;
      expect(appendArgs[0]).toBe('Drafts');
    });

    it('includes reply headers when replyToMessageId is set', async () => {
      await adapter.saveDraft(credId, {
        to: ['bob@example.com'],
        subject: 'Re: Original',
        body: 'Reply content',
        replyToMessageId: '<original@example.com>',
      });
      const appendArgs = mockClient.append.mock.calls[0]!;
      const rawMessage = appendArgs[1] instanceof Buffer ? appendArgs[1].toString() : String(appendArgs[1]);
      expect(rawMessage).toContain('In-Reply-To: <original@example.com>');
    });
  });

  describe('provider-specific folders', () => {
    it('handles Gmail-style archive folder', async () => {
      await adapter.archiveMessages(credId, ['1'], '[Gmail]/All Mail');
      expect(mockClient.messageMove).toHaveBeenCalledWith(
        [1],
        '[Gmail]/All Mail',
        { uid: true }
      );
    });

    it('defaults to Archive for generic IMAP', async () => {
      await adapter.archiveMessages(credId, ['1']);
      expect(mockClient.messageMove).toHaveBeenCalledWith([1], 'Archive', { uid: true });
    });
  });
});
