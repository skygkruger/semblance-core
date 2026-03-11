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
} from './mobile-runtime';
import type { MobileRuntimeState } from './mobile-runtime';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actions?: Array<{ id: string; type: string; status: string }>;
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

  /** Send a message and get a full response */
  sendMessage: (text: string) => Promise<void>;
  /** Clear chat history */
  clearChat: () => void;
  /** Search the knowledge graph */
  searchKnowledge: (query: string, limit?: number) => Promise<Array<{ content: string; score: number }>>;
  /** Check if inference is available */
  isInferenceAvailable: () => boolean;
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
    } catch (err) {
      if (!mountedRef.current) return;

      const errorMsg: ChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: err instanceof Error
          ? `I'm sorry, I encountered an error: ${err.message}`
          : 'I'm sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [conversationId]);

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
        content: r.content,
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
    sendMessage,
    clearChat,
    searchKnowledge,
    isInferenceAvailable,
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
