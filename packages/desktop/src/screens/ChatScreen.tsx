import { useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChatBubble, ChatInput, StatusIndicator } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useTauriEvent } from '../hooks/useTauriEvent';

export function ChatScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const name = state.userName || 'Semblance';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.chatMessages]);

  // Listen for streaming tokens
  useTauriEvent<string>('semblance://chat-token', useCallback((token: string) => {
    dispatch({ type: 'APPEND_TO_LAST_MESSAGE', content: token });
  }, [dispatch]));

  // Listen for chat completion
  useTauriEvent<{ id: string; content: string }>('semblance://chat-complete', useCallback(() => {
    dispatch({ type: 'SET_IS_RESPONDING', value: false });
  }, [dispatch]));

  const handleSend = useCallback(async (message: string) => {
    // Add user message
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: {
        id: `user_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    });

    // Add empty assistant message for streaming
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    });

    dispatch({ type: 'SET_IS_RESPONDING', value: true });

    try {
      await invoke('send_message', { message });
    } catch (err) {
      dispatch({ type: 'SET_IS_RESPONDING', value: false });
      dispatch({
        type: 'APPEND_TO_LAST_MESSAGE',
        content: `Error: Unable to get a response. ${err instanceof Error ? err.message : 'Please check that Ollama is running.'}`,
      });
    }
  }, [dispatch]);

  return (
    <div className="flex flex-col h-full">
      {/* Connection status bar */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-semblance-border dark:border-semblance-border-dark">
        <div className="flex items-center gap-2">
          <StatusIndicator status={state.ollamaStatus === 'connected' ? 'success' : 'attention'} />
          <span className="text-xs text-semblance-text-tertiary">
            {state.ollamaStatus === 'connected'
              ? state.activeModel || 'Connected'
              : 'Ollama not connected'}
          </span>
        </div>
        {state.indexingStatus.state !== 'idle' && state.indexingStatus.state !== 'complete' && (
          <div className="flex items-center gap-2">
            <StatusIndicator status="accent" pulse />
            <span className="text-xs text-semblance-text-tertiary">
              Indexing: {state.indexingStatus.filesScanned}/{state.indexingStatus.filesTotal} files...
            </span>
          </div>
        )}
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {state.chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-lg text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              Ask <span className="text-semblance-accent font-semibold">{name}</span> anything about your documents.
            </p>
            <div className="mt-6 space-y-2">
              {['What topics are in my files?', 'Summarize my recent documents', 'What should I work on today?'].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSend(suggestion)}
                    className="block w-full text-left px-4 py-3 rounded-lg text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark bg-semblance-surface-2 dark:bg-semblance-surface-2-dark hover:bg-semblance-primary-subtle dark:hover:bg-semblance-primary-subtle-dark transition-colors duration-fast"
                  >
                    {suggestion}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          state.chatMessages.map((msg, i) => (
            <ChatBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              streaming={state.isResponding && msg.role === 'assistant' && i === state.chatMessages.length - 1}
            />
          ))
        )}
      </div>

      {/* Input */}
      <div className="px-6 pb-6">
        <ChatInput
          onSend={handleSend}
          disabled={state.isResponding}
          placeholder={`Message ${name}...`}
        />
      </div>
    </div>
  );
}
