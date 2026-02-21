// Tests for IPC protocol extensions — new email and calendar action types validation.

import { describe, it, expect } from 'vitest';
import { ActionPayloadMap, signRequest } from '@semblance/core';
import type { ActionType } from '@semblance/core';
import { nanoid } from 'nanoid';

const SIGNING_KEY = Buffer.from('test-signing-key-32-bytes-00000');

function makeSignedRequest(action: ActionType, payload: Record<string, unknown>) {
  const id = nanoid();
  const timestamp = new Date().toISOString();
  const sig = signRequest(SIGNING_KEY, id, timestamp, action, payload);
  return { id, timestamp, action, payload, source: 'core' as const, signature: sig };
}

describe('IPC Email Action Protocol', () => {
  describe('email.archive payload', () => {
    it('validates correct email.archive payload', () => {
      const schema = ActionPayloadMap['email.archive'];
      const result = schema.safeParse({ messageIds: ['msg-1', 'msg-2'] });
      expect(result.success).toBe(true);
    });

    it('rejects email.archive without messageIds', () => {
      const schema = ActionPayloadMap['email.archive'];
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects email.archive with non-array messageIds', () => {
      const schema = ActionPayloadMap['email.archive'];
      const result = schema.safeParse({ messageIds: 'msg-1' });
      expect(result.success).toBe(false);
    });
  });

  describe('email.move payload', () => {
    it('validates correct email.move payload', () => {
      const schema = ActionPayloadMap['email.move'];
      const result = schema.safeParse({
        messageIds: ['msg-1'],
        fromFolder: 'INBOX',
        toFolder: 'Archive',
      });
      expect(result.success).toBe(true);
    });

    it('rejects email.move without toFolder', () => {
      const schema = ActionPayloadMap['email.move'];
      const result = schema.safeParse({ messageIds: ['msg-1'], fromFolder: 'INBOX' });
      expect(result.success).toBe(false);
    });
  });

  describe('email.markRead payload', () => {
    it('validates correct email.markRead payload', () => {
      const schema = ActionPayloadMap['email.markRead'];
      const result = schema.safeParse({
        messageIds: ['msg-1'],
        read: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects email.markRead without read boolean', () => {
      const schema = ActionPayloadMap['email.markRead'];
      const result = schema.safeParse({ messageIds: ['msg-1'] });
      expect(result.success).toBe(false);
    });
  });

  describe('email.send payload', () => {
    it('validates correct email.send payload', () => {
      const schema = ActionPayloadMap['email.send'];
      const result = schema.safeParse({
        to: ['bob@example.com'],
        subject: 'Test',
        body: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('accepts email.send with optional replyToMessageId', () => {
      const schema = ActionPayloadMap['email.send'];
      const result = schema.safeParse({
        to: ['bob@example.com'],
        subject: 'Re: Test',
        body: 'Reply body',
        replyToMessageId: '<original-msg@example.com>',
      });
      expect(result.success).toBe(true);
    });

    it('rejects email.send without required to field', () => {
      const schema = ActionPayloadMap['email.send'];
      const result = schema.safeParse({ subject: 'Test', body: 'Body' });
      expect(result.success).toBe(false);
    });
  });

  describe('email.draft payload', () => {
    it('validates correct email.draft payload', () => {
      const schema = ActionPayloadMap['email.draft'];
      const result = schema.safeParse({
        to: ['carol@example.com'],
        subject: 'Draft',
        body: 'Draft content',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('calendar.create payload', () => {
    it('validates correct calendar.create payload', () => {
      const schema = ActionPayloadMap['calendar.create'];
      const result = schema.safeParse({
        title: 'Team Meeting',
        startTime: '2025-06-20T10:00:00Z',
        endTime: '2025-06-20T11:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('rejects calendar.create without required fields', () => {
      const schema = ActionPayloadMap['calendar.create'];
      const result = schema.safeParse({ title: 'Meeting' });
      expect(result.success).toBe(false);
    });
  });

  describe('calendar.delete payload', () => {
    it('validates correct calendar.delete payload', () => {
      const schema = ActionPayloadMap['calendar.delete'];
      const result = schema.safeParse({ eventId: 'evt-123' });
      expect(result.success).toBe(true);
    });
  });

  describe('request signing', () => {
    it('creates a valid signed request', () => {
      const req = makeSignedRequest('email.archive', { messageIds: ['msg-1'] });
      expect(req.signature).toBeTruthy();
      expect(req.signature.length).toBeGreaterThan(0);
      expect(req.source).toBe('core');
    });

    it('different payloads produce different signatures', () => {
      const req1 = makeSignedRequest('email.archive', { messageIds: ['msg-1'] });
      const req2 = makeSignedRequest('email.archive', { messageIds: ['msg-2'] });
      expect(req1.signature).not.toBe(req2.signature);
    });
  });
});
