import { useCallback, useRef, useEffect, useState } from 'react';
import { ChatBubble, AgentInput, StatusIndicator } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { sendMessage, documentPickFile, documentSetContext, documentClearContext } from '../ipc/commands';
import type { DocumentContext } from '../state/AppState';

export function ChatScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const name = state.userName || 'Semblance';
  const [isDragging, setIsDragging] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.chatMessages]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const result = await documentSetContext(file.name);
      dispatch({ type: 'SET_DOCUMENT_CONTEXT', context: result });
    } catch (err) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        message: {
          id: `system_${Date.now()}`,
          role: 'assistant',
          content: `Could not attach document: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      });
    }
  }, [dispatch]);

  // File picker handler
  const handleAttach = useCallback(async () => {
    try {
      const filePath = await documentPickFile();
      if (!filePath) return;
      const result = await documentSetContext(filePath);
      dispatch({ type: 'SET_DOCUMENT_CONTEXT', context: result });
    } catch (err) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        message: {
          id: `system_${Date.now()}`,
          role: 'assistant',
          content: `Could not attach document: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      });
    }
  }, [dispatch]);

  // Clear document context
  const handleClearDocument = useCallback(async () => {
    try {
      await documentClearContext();
    } catch {
      // Ignore — clear locally anyway
    }
    dispatch({ type: 'CLEAR_DOCUMENT_CONTEXT' });
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: {
        id: `system_${Date.now()}`,
        role: 'assistant',
        content: 'Document context cleared.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    });
  }, [dispatch]);

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
      await sendMessage(message);
    } catch (err) {
      dispatch({ type: 'SET_IS_RESPONDING', value: false });
      dispatch({
        type: 'APPEND_TO_LAST_MESSAGE',
        content: `Error: Unable to get a response. ${err instanceof Error ? err.message : 'Please check that Ollama is running.'}`,
      });
    }
  }, [dispatch]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-semblance-primary-subtle/50 dark:bg-semblance-primary-subtle-dark/50 border-2 border-dashed border-semblance-primary rounded-lg pointer-events-none">
          <p className="text-semblance-primary font-semibold text-lg">Drop document to chat about it</p>
        </div>
      )}

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

      {/* Document context banner */}
      {state.documentContext && (
        <div className="flex items-center gap-3 px-6 py-2 bg-semblance-accent-subtle dark:bg-semblance-accent-subtle border-b border-semblance-border dark:border-semblance-border-dark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semblance-accent flex-shrink-0">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="flex-1 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark truncate">
            {state.documentContext.fileName}
          </span>
          <button
            type="button"
            onClick={handleClearDocument}
            className="flex-shrink-0 p-1 rounded hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors"
            aria-label="Clear document context"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semblance-text-tertiary">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {state.chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-lg text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              Ask <span className="ai-name-shimmer font-semibold">{name}</span> anything about your documents.
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
        <AgentInput
          onSend={handleSend}
          thinking={state.isResponding}
          activeDocument={state.documentContext ? {
            name: state.documentContext.fileName,
            onDismiss: handleClearDocument,
          } : null}
          placeholder={`Message ${name}...`}
        />
      </div>
    </div>
  );
}
