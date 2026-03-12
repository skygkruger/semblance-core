// SemblanceProvider — React Context exposing the mobile AI runtime to all screens.
//
// Wraps the app and provides:
// - sendMessage(text) → full AI response with tools
// - streamMessage(text) → async iterable of tokens
// - knowledge graph search
// - runtime state (initialized, error, progress)
// - device info (platform, RAM, tier)
//
// CRITICAL: No network imports. All AI processing is local.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

import {
  initializeMobileRuntime,
  getRuntimeState,
  sendChatMessage,
  streamChatMessage,
  shutdownMobileRuntime,
  listConversations as rtListConversations,
  createConversation as rtCreateConversation,
  switchConversation as rtSwitchConversation,
  deleteConversation as rtDeleteConversation,
  renameConversation as rtRenameConversation,
  pinConversation as rtPinConversation,
  unpinConversation as rtUnpinConversation,
  searchConversations as rtSearchConversations,
} from './mobile-runtime';
import type { MobileRuntimeState } from './mobile-runtime';
import type { ConvSummary, ConversationTurnRow } from './mobile-runtime';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actions?: Array<{ id: string; type: string; status: string }>;
}

/** Re-export conversation types for consumers */
export type { ConvSummary, ConversationTurnRow };

export interface ConversationHistoryItem {
  id: string;
  title: string | null;
  autoTitle: string | null;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  turnCount: number;
  lastMessagePreview: string | null;
}

export interface SemblanceContextValue {
  /** Whether the runtime is initialized and ready */
  ready: boolean;
  /** Whether the runtime is currently initializing */
  initializing: boolean;
  /** Initialization progress (0-100) */
  progress: number;
  /** Current initialization step label */
  progressLabel: string;
  /** Error message if initialization failed */
  error: string | null;
  /** Device info */
  deviceInfo: MobileRuntimeState['deviceInfo'];
  /** Chat messages in current conversation */
  messages: ChatMessage[];
  /** Whether the AI is currently processing a message */
  isProcessing: boolean;
  /** Active conversation ID */
  conversationId: string | null;
  /** All conversations for the history panel */
  conversations: ConversationHistoryItem[];
  /** Whether the conversation history panel is open */
  historyPanelOpen: boolean;

  /** Send a message and get a full response */
  sendMessage: (text: string) => Promise<void>;
  /** Clear chat history */
  clearChat: () => void;
  /** Search the knowledge graph */
  searchKnowledge: (query: string, limit?: number) => Promise<Array<{ content: string; score: number }>>;
  /** Check if inference is available */
  isInferenceAvailable: () => boolean;
  /** Create a new conversation and switch to it */
  createConversation: () => void;
  /** Switch to an existing conversation by ID */
  switchConversation: (id: string) => void;
  /** Delete a conversation by ID */
  deleteConversation: (id: string) => void;
  /** Rename a conversation */
  renameConversation: (id: string, title: string) => void;
  /** Pin a conversation */
  pinConversation: (id: string) => void;
  /** Unpin a conversation */
  unpinConversation: (id: string) => void;
  /** Search conversations */
  searchConversations: (query: string) => void;
  /** Refresh the conversation list */
  refreshConversations: () => void;
  /** Toggle the history panel visibility */
  toggleHistoryPanel: () => void;
}

const SemblanceContext = createContext<SemblanceContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface SemblanceProviderProps {
  children: ReactNode;
}

let messageCounter = 0;
function nextMessageId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

function turnToChatMessage(turn: ConversationTurnRow): ChatMessage {
  return {
    id: turn.id,
    role: turn.role,
    content: turn.content,
    timestamp: turn.timestamp,
  };
}

export function SemblanceProvider({ children }: SemblanceProviderProps) {
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Starting...');
  const [error, setError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<MobileRuntimeState['deviceInfo']>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationHistoryItem[]>([]);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const mountedRef = useRef(true);

  // Initialize runtime on mount
  useEffect(() => {
    mountedRef.current = true;

    initializeMobileRuntime((prog, label) => {
      if (mountedRef.current) {
        setProgress(prog);
        setProgressLabel(label);
      }
    })
      .then((state) => {
        if (!mountedRef.current) return;
        setReady(state.initialized && !state.error);
        setError(state.error);
        setDeviceInfo(state.deviceInfo);
        setInitializing(false);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setInitializing(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't actually shut down — runtime persists across screen changes
      // shutdownMobileRuntime() is called on app termination instead
    };
  }, []);

  // ─── Conversation helpers (defined early so sendMessage can use them) ───────

  const toHistoryItem = useCallback((c: ConvSummary): ConversationHistoryItem => ({
    id: c.id,
    title: c.title,
    autoTitle: c.autoTitle,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    pinned: c.pinned,
    turnCount: c.turnCount,
    lastMessagePreview: c.lastMessagePreview,
  }), []);

  const refreshConversations = useCallback(() => {
    const items = rtListConversations({ limit: 50 });
    if (mountedRef.current) {
      setConversations(items.map(toHistoryItem));
    }
  }, [toHistoryItem]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const result = await sendChatMessage(text.trim(), conversationId ?? undefined);

      if (!mountedRef.current) return;

      const assistantMsg: ChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
        actions: result.actions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setConversationId(result.conversationId);
      refreshConversations();
    } catch (err) {
      if (!mountedRef.current) return;

      const errorMsg: ChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: err instanceof Error
          ? `I'm sorry, I encountered an error: ${err.message}`
          : "I'm sorry, something went wrong. Please try again.",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [conversationId, refreshConversations]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const searchKnowledge = useCallback(async (query: string, limit = 5) => {
    const state = getRuntimeState();
    if (!state.core) return [];

    try {
      const results = await state.core.knowledge.search(query, { limit });
      return results.map((r) => ({
        content: r.chunk.content,
        score: r.score,
      }));
    } catch {
      return [];
    }
  }, []);

  const isInferenceAvailable = useCallback(() => {
    const state = getRuntimeState();
    return state.inferenceRouter !== null;
  }, []);

  // ─── Conversation Management ───────────────────────────────────────────────

  // Load conversation list once runtime is ready
  useEffect(() => {
    if (!ready) return;
    const items = rtListConversations({ limit: 50 });
    setConversations(items.map(toHistoryItem));

    // If no active conversation, use the most recent or leave empty
    if (!conversationId && items.length > 0) {
      const first = items[0]!;
      setConversationId(first.id);
      const result = rtSwitchConversation(first.id);
      if (result) {
        setMessages(result.turns.map(turnToChatMessage));
      }
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const createConversation = useCallback(() => {
    const conv = rtCreateConversation();
    if (conv) {
      setConversationId(conv.id);
      setMessages([]);
      refreshConversations();
    }
  }, [refreshConversations]);

  const switchConversation = useCallback((id: string) => {
    if (id === conversationId) return;
    const result = rtSwitchConversation(id);
    if (result) {
      setConversationId(result.conversationId);
      setMessages(result.turns.map(turnToChatMessage));
      refreshConversations();
    }
  }, [conversationId, refreshConversations]);

  const deleteConversation = useCallback((id: string) => {
    rtDeleteConversation(id);
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }
    refreshConversations();
  }, [conversationId, refreshConversations]);

  const handleRenameConversation = useCallback((id: string, title: string) => {
    rtRenameConversation(id, title);
    refreshConversations();
  }, [refreshConversations]);

  const handlePinConversation = useCallback((id: string) => {
    rtPinConversation(id);
    refreshConversations();
  }, [refreshConversations]);

  const handleUnpinConversation = useCallback((id: string) => {
    rtUnpinConversation(id);
    refreshConversations();
  }, [refreshConversations]);

  const handleSearchConversations = useCallback((query: string) => {
    if (query.trim()) {
      const results = rtSearchConversations(query, 20);
      if (mountedRef.current) {
        setConversations(results.map(toHistoryItem));
      }
    } else {
      refreshConversations();
    }
  }, [toHistoryItem, refreshConversations]);

  const toggleHistoryPanel = useCallback(() => {
    setHistoryPanelOpen((prev) => !prev);
  }, []);

  const value: SemblanceContextValue = {
    ready,
    initializing,
    progress,
    progressLabel,
    error,
    deviceInfo,
    messages,
    isProcessing,
    conversationId,
    conversations,
    historyPanelOpen,
    sendMessage,
    clearChat,
    searchKnowledge,
    isInferenceAvailable,
    createConversation,
    switchConversation,
    deleteConversation,
    renameConversation: handleRenameConversation,
    pinConversation: handlePinConversation,
    unpinConversation: handleUnpinConversation,
    searchConversations: handleSearchConversations,
    refreshConversations,
    toggleHistoryPanel,
  };

  return (
    <SemblanceContext.Provider value={value}>
      {children}
    </SemblanceContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the Semblance AI runtime from any component.
 * Must be used within a SemblanceProvider.
 */
export function useSemblance(): SemblanceContextValue {
  const ctx = useContext(SemblanceContext);
  if (!ctx) {
    throw new Error(
      '[useSemblance] Must be used within a SemblanceProvider. ' +
      'Wrap your app root with <SemblanceProvider>.',
    );
  }
  return ctx;
}
