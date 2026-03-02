// Conversation State — Tests for AppState reducer actions related to conversation management.

import { describe, it, expect } from 'vitest';
import type { AppState, AppAction, ConversationSummaryState, ChatMessage } from '../../packages/desktop/src/state/AppState.js';
import { appReducer, initialState } from '../../packages/desktop/src/state/AppState.js';

const baseState: AppState = { ...initialState };

const mockConversation: ConversationSummaryState = {
  id: 'conv-1',
  title: 'Test Conversation',
  autoTitle: 'test conv auto',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:30:00.000Z',
  pinned: false,
  pinnedAt: null,
  turnCount: 5,
  lastMessagePreview: 'Hello there',
  expiresAt: null,
};

const mockMessage: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello',
  timestamp: '2026-03-01T10:00:00.000Z',
};

// ─── SET_ACTIVE_CONVERSATION ────────────────────────────────────────────────

describe('AppState — SET_ACTIVE_CONVERSATION', () => {
  it('sets the active conversation ID', () => {
    const state = appReducer(baseState, { type: 'SET_ACTIVE_CONVERSATION', id: 'conv-1' });
    expect(state.activeConversationId).toBe('conv-1');
  });

  it('clears active conversation when set to null', () => {
    const withActive = appReducer(baseState, { type: 'SET_ACTIVE_CONVERSATION', id: 'conv-1' });
    const cleared = appReducer(withActive, { type: 'SET_ACTIVE_CONVERSATION', id: null });
    expect(cleared.activeConversationId).toBeNull();
  });
});

// ─── SET_CONVERSATIONS ──────────────────────────────────────────────────────

describe('AppState — SET_CONVERSATIONS', () => {
  it('sets the conversations array', () => {
    const convs = [mockConversation, { ...mockConversation, id: 'conv-2' }];
    const state = appReducer(baseState, { type: 'SET_CONVERSATIONS', conversations: convs });
    expect(state.conversations).toHaveLength(2);
    expect(state.conversations[0].id).toBe('conv-1');
  });

  it('replaces existing conversations list', () => {
    const state1 = appReducer(baseState, { type: 'SET_CONVERSATIONS', conversations: [mockConversation] });
    const state2 = appReducer(state1, { type: 'SET_CONVERSATIONS', conversations: [] });
    expect(state2.conversations).toHaveLength(0);
  });
});

// ─── TOGGLE_HISTORY_PANEL ───────────────────────────────────────────────────

describe('AppState — TOGGLE_HISTORY_PANEL', () => {
  it('opens the panel when closed', () => {
    const state = appReducer(baseState, { type: 'TOGGLE_HISTORY_PANEL' });
    expect(state.historyPanelOpen).toBe(true);
  });

  it('closes the panel when open', () => {
    const open = appReducer(baseState, { type: 'TOGGLE_HISTORY_PANEL' });
    const closed = appReducer(open, { type: 'TOGGLE_HISTORY_PANEL' });
    expect(closed.historyPanelOpen).toBe(false);
  });
});

// ─── SET_HISTORY_PANEL ──────────────────────────────────────────────────────

describe('AppState — SET_HISTORY_PANEL', () => {
  it('sets panel open', () => {
    const state = appReducer(baseState, { type: 'SET_HISTORY_PANEL', open: true });
    expect(state.historyPanelOpen).toBe(true);
  });

  it('sets panel closed', () => {
    const open = appReducer(baseState, { type: 'SET_HISTORY_PANEL', open: true });
    const closed = appReducer(open, { type: 'SET_HISTORY_PANEL', open: false });
    expect(closed.historyPanelOpen).toBe(false);
  });
});

// ─── REPLACE_CHAT_MESSAGES ──────────────────────────────────────────────────

describe('AppState — REPLACE_CHAT_MESSAGES', () => {
  it('replaces the entire chat messages array', () => {
    const withMessages = appReducer(baseState, { type: 'ADD_CHAT_MESSAGE', message: mockMessage });
    expect(withMessages.chatMessages).toHaveLength(1);

    const newMessages: ChatMessage[] = [
      { id: 'msg-a', role: 'user', content: 'First', timestamp: '2026-03-01T09:00:00.000Z' },
      { id: 'msg-b', role: 'assistant', content: 'Response', timestamp: '2026-03-01T09:01:00.000Z' },
    ];
    const replaced = appReducer(withMessages, { type: 'REPLACE_CHAT_MESSAGES', messages: newMessages });
    expect(replaced.chatMessages).toHaveLength(2);
    expect(replaced.chatMessages[0].id).toBe('msg-a');
    expect(replaced.chatMessages[1].id).toBe('msg-b');
  });

  it('clears messages when given empty array', () => {
    const withMessages = appReducer(baseState, { type: 'ADD_CHAT_MESSAGE', message: mockMessage });
    const cleared = appReducer(withMessages, { type: 'REPLACE_CHAT_MESSAGES', messages: [] });
    expect(cleared.chatMessages).toHaveLength(0);
  });

  it('does not affect other state fields', () => {
    const modified = appReducer(baseState, { type: 'SET_ACTIVE_CONVERSATION', id: 'conv-1' });
    const replaced = appReducer(modified, { type: 'REPLACE_CHAT_MESSAGES', messages: [] });
    expect(replaced.activeConversationId).toBe('conv-1');
  });
});

// ─── SET_CONVERSATION_SETTINGS ──────────────────────────────────────────────

describe('AppState — SET_CONVERSATION_SETTINGS', () => {
  it('sets auto-expiry days', () => {
    const state = appReducer(baseState, {
      type: 'SET_CONVERSATION_SETTINGS',
      settings: { autoExpiryDays: 30 },
    });
    expect(state.conversationSettings.autoExpiryDays).toBe(30);
  });

  it('clears auto-expiry when set to null', () => {
    const withExpiry = appReducer(baseState, {
      type: 'SET_CONVERSATION_SETTINGS',
      settings: { autoExpiryDays: 7 },
    });
    const cleared = appReducer(withExpiry, {
      type: 'SET_CONVERSATION_SETTINGS',
      settings: { autoExpiryDays: null },
    });
    expect(cleared.conversationSettings.autoExpiryDays).toBeNull();
  });
});

// ─── Initial State ──────────────────────────────────────────────────────────

describe('AppState — initial conversation state', () => {
  it('starts with no active conversation', () => {
    expect(initialState.activeConversationId).toBeNull();
  });

  it('starts with empty conversations list', () => {
    expect(initialState.conversations).toEqual([]);
  });

  it('starts with history panel closed', () => {
    expect(initialState.historyPanelOpen).toBe(false);
  });

  it('starts with no auto-expiry', () => {
    expect(initialState.conversationSettings.autoExpiryDays).toBeNull();
  });
});
