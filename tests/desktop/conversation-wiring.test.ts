// Conversation Wiring — Static analysis and integration tests for conversation
// management across bridge.ts, lib.rs, commands.ts, and ChatScreen.tsx.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

// ─── Bridge Wiring ──────────────────────────────────────────────────────────

describe('Conversation wiring — bridge.ts', () => {
  const bridge = readFile('packages/desktop/src-tauri/sidecar/bridge.ts');

  it('imports ConversationManager', () => {
    expect(bridge).toContain('ConversationManager');
  });

  it('imports ConversationIndexer', () => {
    expect(bridge).toContain('ConversationIndexer');
  });

  it('initializes ConversationManager in handleInitialize', () => {
    expect(bridge).toContain('new ConversationManager');
  });

  it('initializes ConversationIndexer in handleInitialize', () => {
    expect(bridge).toContain('new ConversationIndexer');
  });

  it('calls migrate() on ConversationManager', () => {
    expect(bridge).toContain('.migrate()');
  });

  it('calls pruneExpired() on startup', () => {
    expect(bridge).toContain('.pruneExpired()');
  });

  it('handles list_conversations command', () => {
    expect(bridge).toContain("'list_conversations'");
  });

  it('handles create_conversation command', () => {
    expect(bridge).toContain("'create_conversation'");
  });

  it('handles delete_conversation command', () => {
    expect(bridge).toContain("'delete_conversation'");
  });

  it('handles switch_conversation command', () => {
    expect(bridge).toContain("'switch_conversation'");
  });

  it('handles search_conversations command', () => {
    expect(bridge).toContain("'search_conversations'");
  });

  it('handles rename_conversation command', () => {
    expect(bridge).toContain("'rename_conversation'");
  });

  it('handles pin_conversation command', () => {
    expect(bridge).toContain("'pin_conversation'");
  });

  it('handles unpin_conversation command', () => {
    expect(bridge).toContain("'unpin_conversation'");
  });

  it('sends conversationId in handleSendMessage response', () => {
    expect(bridge).toContain('conversationId');
  });

  it('indexes assistant turns after completion', () => {
    expect(bridge).toContain('indexTurn');
  });

  it('updates conversation after turn', () => {
    expect(bridge).toContain('updateAfterTurn');
  });
});

// ─── Rust Commands ──────────────────────────────────────────────────────────

describe('Conversation wiring — lib.rs', () => {
  const libRs = readFile('packages/desktop/src-tauri/src/lib.rs');

  it('registers list_conversations command', () => {
    expect(libRs).toContain('list_conversations');
  });

  it('registers create_conversation command', () => {
    expect(libRs).toContain('create_conversation');
  });

  it('registers delete_conversation command', () => {
    expect(libRs).toContain('delete_conversation');
  });

  it('registers switch_conversation command', () => {
    expect(libRs).toContain('switch_conversation');
  });

  it('registers search_conversations command', () => {
    expect(libRs).toContain('search_conversations');
  });

  it('registers rename_conversation command', () => {
    expect(libRs).toContain('rename_conversation');
  });

  it('registers pin_conversation command', () => {
    expect(libRs).toContain('pin_conversation');
  });

  it('registers unpin_conversation command', () => {
    expect(libRs).toContain('unpin_conversation');
  });

  it('registers clear_all_conversations command', () => {
    expect(libRs).toContain('clear_all_conversations');
  });

  it('registers set_conversation_auto_expiry command', () => {
    expect(libRs).toContain('set_conversation_auto_expiry');
  });

  it('send_message accepts conversation_id parameter', () => {
    expect(libRs).toContain('conversation_id');
  });

  it('all conversation commands are in generate_handler', () => {
    // Find the generate_handler block
    const handlerMatch = libRs.match(/generate_handler!\[([\s\S]*?)\]/);
    expect(handlerMatch).not.toBeNull();
    const handlerBlock = handlerMatch![1];
    expect(handlerBlock).toContain('list_conversations');
    expect(handlerBlock).toContain('create_conversation');
    expect(handlerBlock).toContain('delete_conversation');
    expect(handlerBlock).toContain('switch_conversation');
    expect(handlerBlock).toContain('search_conversations');
    expect(handlerBlock).toContain('rename_conversation');
    expect(handlerBlock).toContain('pin_conversation');
    expect(handlerBlock).toContain('unpin_conversation');
    expect(handlerBlock).toContain('clear_all_conversations');
    expect(handlerBlock).toContain('set_conversation_auto_expiry');
  });
});

// ─── IPC Commands ───────────────────────────────────────────────────────────

describe('Conversation wiring — commands.ts', () => {
  const commands = readFile('packages/desktop/src/ipc/commands.ts');

  it('exports listConversations', () => {
    expect(commands).toContain('export function listConversations');
  });

  it('exports createConversation', () => {
    expect(commands).toContain('export function createConversation');
  });

  it('exports deleteConversation', () => {
    expect(commands).toContain('export function deleteConversation');
  });

  it('exports switchConversation', () => {
    expect(commands).toContain('export function switchConversation');
  });

  it('exports searchConversations', () => {
    expect(commands).toContain('export function searchConversations');
  });

  it('exports renameConversation', () => {
    expect(commands).toContain('export function renameConversation');
  });

  it('exports pinConversation', () => {
    expect(commands).toContain('export function pinConversation');
  });

  it('exports unpinConversation', () => {
    expect(commands).toContain('export function unpinConversation');
  });

  it('exports clearAllConversations', () => {
    expect(commands).toContain('export function clearAllConversations');
  });

  it('exports setConversationAutoExpiry', () => {
    expect(commands).toContain('export function setConversationAutoExpiry');
  });

  it('sendMessage accepts conversationId and attachments parameters', () => {
    expect(commands).toContain('sendMessage(');
    expect(commands).toContain('conversationId?: string');
    expect(commands).toContain('attachments?:');
  });
});

// ─── IPC Types ──────────────────────────────────────────────────────────────

describe('Conversation wiring — types.ts', () => {
  const types = readFile('packages/desktop/src/ipc/types.ts');

  it('exports ConversationSummary type', () => {
    expect(types).toContain('export interface ConversationSummary');
  });

  it('exports ConversationTurn type', () => {
    expect(types).toContain('export interface ConversationTurn');
  });

  it('exports SwitchConversationResult type', () => {
    expect(types).toContain('export interface SwitchConversationResult');
  });

  it('exports ConversationSearchResult type', () => {
    expect(types).toContain('export interface ConversationSearchResult');
  });

  it('exports SendMessageResult type', () => {
    expect(types).toContain('export interface SendMessageResult');
  });
});

// ─── ChatScreen Integration ─────────────────────────────────────────────────

describe('Conversation wiring — ChatScreen.tsx', () => {
  const chatScreen = readFile('packages/desktop/src/screens/ChatScreen.tsx');

  it('imports ConversationHistoryPanel', () => {
    expect(chatScreen).toContain('ConversationHistoryPanel');
  });

  it('imports conversation IPC commands', () => {
    expect(chatScreen).toContain('listConversations');
    expect(chatScreen).toContain('createConversation');
    expect(chatScreen).toContain('switchConversation');
  });

  it('renders ConversationHistoryPanel component', () => {
    expect(chatScreen).toContain('<ConversationHistoryPanel');
  });

  it('has Cmd/Ctrl+H keyboard shortcut handler', () => {
    expect(chatScreen).toContain("key === 'h'");
  });

  it('has Cmd/Ctrl+N keyboard shortcut handler', () => {
    expect(chatScreen).toContain("key === 'n'");
  });

  it('dispatches REPLACE_CHAT_MESSAGES for conversation switching', () => {
    expect(chatScreen).toContain('REPLACE_CHAT_MESSAGES');
  });

  it('dispatches SET_ACTIVE_CONVERSATION', () => {
    expect(chatScreen).toContain('SET_ACTIVE_CONVERSATION');
  });

  it('dispatches SET_CONVERSATIONS', () => {
    expect(chatScreen).toContain('SET_CONVERSATIONS');
  });

  it('passes activeConversationId to sendMessage', () => {
    expect(chatScreen).toContain('activeConversationId');
  });
});

// ─── semblance-ui exports ───────────────────────────────────────────────────

describe('Conversation wiring — semblance-ui/index.ts', () => {
  const uiIndex = readFile('packages/semblance-ui/index.ts');

  it('exports ConversationHistoryPanel', () => {
    expect(uiIndex).toContain("export { ConversationHistoryPanel }");
  });

  it('exports ConversationHistoryPanelProps type', () => {
    expect(uiIndex).toContain('ConversationHistoryPanelProps');
  });

  it('exports ConversationHistoryItem type', () => {
    expect(uiIndex).toContain('ConversationHistoryItem');
  });
});

// ─── Core types ─────────────────────────────────────────────────────────────

describe('Conversation wiring — core types', () => {
  const types = readFile('packages/core/knowledge/types.ts');

  it('includes conversation in DocumentSource union', () => {
    expect(types).toContain("'conversation'");
  });
});
