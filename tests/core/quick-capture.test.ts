// Tests for Step 10 Commit 10 — Quick Capture
// Time reference detection, capture processing, context linking, store operations.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasTimeReference,
  processCapture,
} from '@semblance/core/agent/quick-capture.js';
import { CaptureStore } from '@semblance/core/knowledge/capture-store.js';
import type { LinkedContextRef } from '@semblance/core/knowledge/capture-store.js';
import DatabaseConstructor from 'better-sqlite3';

function mockLLM(response: string) {
  return {
    chat: vi.fn().mockResolvedValue({ message: { role: 'assistant', content: response } }),
    generate: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn(),
  };
}

function createTestDb() {
  return new DatabaseConstructor(':memory:');
}

describe('hasTimeReference: heuristic detection', () => {
  it('detects "at 3pm" pattern', () => {
    expect(hasTimeReference('call dentist at 3pm')).toBe(true);
  });

  it('detects "tomorrow" keyword', () => {
    expect(hasTimeReference('buy groceries tomorrow')).toBe(true);
  });

  it('detects "next Tuesday" pattern', () => {
    expect(hasTimeReference('meeting next Tuesday')).toBe(true);
  });

  it('detects "in 2 hours" pattern', () => {
    expect(hasTimeReference('in 2 hours take medicine')).toBe(true);
  });

  it('detects "remind me" phrase', () => {
    expect(hasTimeReference('remind me to call Sarah')).toBe(true);
  });

  it('detects "March 15" date pattern', () => {
    expect(hasTimeReference('tax deadline March 15')).toBe(true);
  });

  it('detects "daily" recurrence keyword', () => {
    expect(hasTimeReference('check email daily')).toBe(true);
  });

  it('detects "deadline" keyword', () => {
    expect(hasTimeReference('project deadline Friday')).toBe(true);
  });

  it('returns false for plain text without time references', () => {
    expect(hasTimeReference('interesting article about AI')).toBe(false);
  });

  it('returns false for generic notes', () => {
    expect(hasTimeReference('great idea for the project refactor')).toBe(false);
  });
});

describe('CaptureStore', () => {
  let db: InstanceType<typeof DatabaseConstructor>;
  let store: CaptureStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CaptureStore(db);
  });

  it('creates a capture and retrieves it', () => {
    const capture = store.create({ text: 'test capture' });
    expect(capture.id).toBeTruthy();
    expect(capture.text).toBe('test capture');
    expect(capture.processed).toBe(false);
    expect(capture.reminderId).toBeNull();
    expect(capture.linkedContext).toEqual([]);

    const found = store.findById(capture.id);
    expect(found).not.toBeNull();
    expect(found!.text).toBe('test capture');
  });

  it('creates a capture with linked context', () => {
    const context: LinkedContextRef[] = [
      { documentId: 'doc-1', title: 'Email from Sarah', source: 'email', score: 0.85 },
    ];
    const capture = store.create({ text: 'project notes', linkedContext: context });
    expect(capture.processed).toBe(true);
    expect(capture.linkedContext).toHaveLength(1);
    expect(capture.linkedContext[0].title).toBe('Email from Sarah');
  });

  it('creates a capture with reminder ID', () => {
    const capture = store.create({ text: 'call dentist at 3pm', reminderId: 'rem-1' });
    expect(capture.processed).toBe(true);
    expect(capture.reminderId).toBe('rem-1');
  });

  it('findAll returns captures in reverse chronological order', () => {
    store.create({ text: 'first' });
    store.create({ text: 'second' });
    store.create({ text: 'third' });

    const all = store.findAll();
    expect(all).toHaveLength(3);
    // Reverse chronological — newest first
    expect(all[0].text).toBe('third');
    expect(all[2].text).toBe('first');
  });

  it('findUnprocessed returns only unprocessed captures', () => {
    store.create({ text: 'unprocessed' });
    store.create({ text: 'processed', linkedContext: [{ documentId: 'd1', title: 't', source: 's', score: 0.9 }] });

    const unprocessed = store.findUnprocessed();
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0].text).toBe('unprocessed');
  });

  it('markProcessed updates a capture', () => {
    const capture = store.create({ text: 'needs processing' });
    expect(capture.processed).toBe(false);

    const context: LinkedContextRef[] = [
      { documentId: 'doc-2', title: 'Related doc', source: 'file', score: 0.75 },
    ];
    const updated = store.markProcessed(capture.id, undefined, context);
    expect(updated).toBe(true);

    const found = store.findById(capture.id);
    expect(found!.processed).toBe(true);
    expect(found!.linkedContext).toHaveLength(1);
  });

  it('delete removes a capture', () => {
    const capture = store.create({ text: 'to delete' });
    expect(store.count()).toBe(1);

    store.delete(capture.id);
    expect(store.count()).toBe(0);
    expect(store.findById(capture.id)).toBeNull();
  });

  it('count returns total captures', () => {
    expect(store.count()).toBe(0);
    store.create({ text: 'one' });
    store.create({ text: 'two' });
    expect(store.count()).toBe(2);
  });
});

describe('processCapture', () => {
  let db: InstanceType<typeof DatabaseConstructor>;
  let captureStore: CaptureStore;

  beforeEach(() => {
    db = createTestDb();
    captureStore = new CaptureStore(db);
  });

  it('processes a capture without time reference — no reminder created', async () => {
    const llm = mockLLM('no');
    const result = await processCapture(
      'interesting article about quantum computing',
      llm,
      captureStore,
      null,
      null,
    );

    expect(result.captureId).toBeTruthy();
    expect(result.hasReminder).toBe(false);
    expect(result.reminderId).toBeNull();
    expect(result.linkedContext).toEqual([]);
    expect(captureStore.count()).toBe(1);
  });

  it('processes a capture with time reference — attempts reminder creation', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'call dentist',
      dueAt: '2026-02-23T15:00:00.000Z',
      recurrence: 'none',
    }));
    const mockIpc = {
      sendAction: vi.fn().mockResolvedValue({
        status: 'success',
        data: { id: 'rem-123' },
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(),
    };

    const result = await processCapture(
      'call dentist at 3pm tomorrow',
      llm,
      captureStore,
      null,
      mockIpc,
    );

    expect(result.hasReminder).toBe(true);
    expect(result.reminderId).toBe('rem-123');
    expect(result.reminderDueAt).toBe('2026-02-23T15:00:00.000Z');
    expect(mockIpc.sendAction).toHaveBeenCalledWith('reminder.create', expect.objectContaining({
      text: 'call dentist',
      source: 'quick-capture',
    }));
  });

  it('processes a capture with knowledge graph context linking', async () => {
    const llm = mockLLM('no');
    const mockKnowledgeGraph = {
      search: vi.fn().mockResolvedValue([
        {
          document: { id: 'doc-1', title: 'Email about Portland', source: 'email' },
          score: 0.85,
          chunk: { id: 'c1', text: 'Portland meeting notes' },
        },
        {
          document: { id: 'doc-2', title: 'Low relevance doc', source: 'file' },
          score: 0.3, // Below 0.5 threshold
          chunk: { id: 'c2', text: 'something' },
        },
      ]),
      index: vi.fn(),
    };

    const result = await processCapture(
      'thoughts about the Portland project',
      llm,
      captureStore,
      mockKnowledgeGraph as any,
      null,
    );

    expect(result.linkedContext).toHaveLength(1);
    expect(result.linkedContext[0].documentId).toBe('doc-1');
    expect(result.linkedContext[0].score).toBe(0.85);
    expect(mockKnowledgeGraph.search).toHaveBeenCalledWith(
      'thoughts about the Portland project',
      expect.objectContaining({ limit: 3 }),
    );
  });

  it('handles knowledge graph search failure gracefully', async () => {
    const llm = mockLLM('no');
    const mockKnowledgeGraph = {
      search: vi.fn().mockRejectedValue(new Error('Search failed')),
      index: vi.fn(),
    };

    const result = await processCapture(
      'test capture',
      llm,
      captureStore,
      mockKnowledgeGraph as any,
      null,
    );

    expect(result.captureId).toBeTruthy();
    expect(result.linkedContext).toEqual([]);
  });

  it('handles IPC failure gracefully — capture still saved', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'take medicine',
      dueAt: '2026-02-22T14:00:00.000Z',
      recurrence: 'none',
    }));
    const mockIpc = {
      sendAction: vi.fn().mockRejectedValue(new Error('IPC failed')),
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(),
    };

    const result = await processCapture(
      'in 2 hours take medicine',
      llm,
      captureStore,
      null,
      mockIpc,
    );

    expect(result.captureId).toBeTruthy();
    expect(result.hasReminder).toBe(false);
    expect(captureStore.count()).toBe(1);
  });
});
