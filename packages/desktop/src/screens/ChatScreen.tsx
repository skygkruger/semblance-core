import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatBubble, AgentInput, StatusIndicator, DocumentPanel, ArtifactPanel, ConversationHistoryPanel } from '@semblance/ui';
import type { ArtifactItem } from '@semblance/ui';
import { VoiceButton } from '../components/VoiceButton';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { WebFetchSummary } from '../components/WebFetchSummary';
import { WebSearchResult } from '../components/WebSearchResult';
import { parseArtifacts } from '@semblance/core/agent/artifact-parser';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useHardwareTier } from '../hooks/useHardwareTier';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useSound } from '../sound/SoundEngineContext';
import {
  sendMessage,
  documentPickFile,
  documentSetContext,
  documentClearContext,
  documentPickFiles,
  documentAddFile,
  documentRemoveFile,
  addAttachmentToKnowledge,
  listConversations,
  createConversation,
  switchConversation,
  deleteConversation,
  renameConversation,
  pinConversation,
  unpinConversation,
  searchConversations,
} from '../ipc/commands';
import { validateAttachment, mimeFromExtension } from '@semblance/core/agent/attachments';
import { createDesktopVoiceAdapter } from '@semblance/core/platform/desktop-voice';
import type { DocumentContext, ChatMessage } from '../state/AppState';

export function ChatScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const name = state.semblanceName || 'Semblance';
  const [isDragging, setIsDragging] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Right panel slot — only one panel open at a time (documents OR artifact)
  type PanelSlot = 'none' | 'documents' | 'artifact';
  const [activePanel, setActivePanel] = useState<PanelSlot>('none');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);

  // Web search/fetch results attached to the current response
  const [webSearchResults, setWebSearchResults] = useState<Array<{ title: string; url: string; snippet: string; age?: string }>>([]);
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchProvider, setWebSearchProvider] = useState<'brave' | 'searxng'>('brave');
  const [webFetchResult, setWebFetchResult] = useState<{ url: string; title: string; content: string; bytesFetched: number; contentType: string } | null>(null);

  // Sound effects
  const { play } = useSound();

  // Voice hardware capability gate
  const { voiceCapable } = useHardwareTier();
  // Voice adapter — returns not-ready state until Whisper.cpp/Piper are wired
  const voiceAdapter = useMemo(() => createDesktopVoiceAdapter(), []);
  const voice = useVoiceInput(voiceAdapter, play as (id: string) => void);

  // ─── Conversation Management ─────────────────────────────────────────────

  // Load conversation list on mount
  useEffect(() => {
    listConversations({ limit: 50 }).then((convs) => {
      dispatch({ type: 'SET_CONVERSATIONS', conversations: convs });
      // If no active conversation, create one or use the most recent
      if (!state.activeConversationId && convs.length > 0) {
        const first = convs[0]!;
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: first.id });
        // Load turns for the most recent conversation
        switchConversation(first.id).then((result) => {
          const messages: ChatMessage[] = result.turns.map(turn => ({
            id: turn.id,
            role: turn.role,
            content: turn.content,
            timestamp: new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          dispatch({ type: 'REPLACE_CHAT_MESSAGES', messages });
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh conversation list helper
  const refreshConversationList = useCallback(() => {
    listConversations({ limit: 50 }).then((convs) => {
      dispatch({ type: 'SET_CONVERSATIONS', conversations: convs });
    }).catch(() => {});
  }, [dispatch]);

  const handleNewConversation = useCallback(async () => {
    try {
      const newConv = await createConversation();
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: newConv.id });
      dispatch({ type: 'REPLACE_CHAT_MESSAGES', messages: [] });
      dispatch({ type: 'CLEAR_ATTACHMENTS' });
      dispatch({ type: 'CLEAR_DOCUMENT_CONTEXT' });
      refreshConversationList();
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }, [dispatch, refreshConversationList]);

  const handleSwitchConversation = useCallback(async (id: string) => {
    if (id === state.activeConversationId) return;
    try {
      const result = await switchConversation(id);
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: result.conversationId });
      const messages: ChatMessage[] = result.turns.map(turn => ({
        id: turn.id,
        role: turn.role,
        content: turn.content,
        timestamp: new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
      dispatch({ type: 'REPLACE_CHAT_MESSAGES', messages });
      dispatch({ type: 'CLEAR_ATTACHMENTS' });
      dispatch({ type: 'CLEAR_DOCUMENT_CONTEXT' });
    } catch (err) {
      console.error('Failed to switch conversation:', err);
    }
  }, [state.activeConversationId, dispatch]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteConversation(id);
      if (id === state.activeConversationId) {
        // Switch to another conversation or create new
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: null });
        dispatch({ type: 'REPLACE_CHAT_MESSAGES', messages: [] });
      }
      refreshConversationList();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, [state.activeConversationId, dispatch, refreshConversationList]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    try {
      await renameConversation(id, title);
      refreshConversationList();
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  }, [refreshConversationList]);

  const handlePinConversation = useCallback(async (id: string) => {
    try {
      await pinConversation(id);
      refreshConversationList();
    } catch (err) {
      console.error('Failed to pin conversation:', err);
    }
  }, [refreshConversationList]);

  const handleUnpinConversation = useCallback(async (id: string) => {
    try {
      await unpinConversation(id);
      refreshConversationList();
    } catch (err) {
      console.error('Failed to unpin conversation:', err);
    }
  }, [refreshConversationList]);

  // Debounced search for conversations
  const handleHistorySearchChange = useCallback((query: string) => {
    setHistorySearch(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      if (query.trim()) {
        try {
          const results = await searchConversations(query, 20);
          // Map search results to ConversationSummaryState format
          // Search results may be ConversationSearchResult[] or ConversationSummary[]
          // We need to refresh the list with filtered results
          const convs = await listConversations({ search: query, limit: 50 });
          dispatch({ type: 'SET_CONVERSATIONS', conversations: convs });
        } catch {
          // Fallback: keep current list
        }
      } else {
        refreshConversationList();
      }
    }, 300);
  }, [dispatch, refreshConversationList]);

  // Keyboard shortcuts: Cmd/Ctrl+H for history, Cmd/Ctrl+N for new conversation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'h') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_HISTORY_PANEL' });
      }
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNewConversation();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, handleNewConversation]);

  // ─── Existing handlers ───────────────────────────────────────────────────

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

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      const tempId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      dispatch({
        type: 'ADD_ATTACHMENT',
        attachment: {
          id: tempId,
          fileName: file.name,
          filePath: file.name, // Tauri resolves from drop event
          mimeType: file.type || '',
          sizeBytes: file.size,
          status: 'processing',
          addedToKnowledge: false,
        },
      });

      try {
        const result = await documentAddFile(file.name);
        dispatch({
          type: 'UPDATE_ATTACHMENT',
          id: tempId,
          updates: {
            id: result.id,
            mimeType: result.mimeType,
            sizeBytes: result.sizeBytes,
            status: result.status,
            documentId: result.documentId,
            error: result.error,
          },
        });
      } catch (err) {
        dispatch({
          type: 'UPDATE_ATTACHMENT',
          id: tempId,
          updates: {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }, [dispatch]);

  // File picker handler — multi-file
  const handleAttach = useCallback(async () => {
    try {
      const filePaths = await documentPickFiles();
      if (!filePaths || filePaths.length === 0) return;

      for (const filePath of filePaths) {
        const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
        const tempId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Add pending pill immediately
        dispatch({
          type: 'ADD_ATTACHMENT',
          attachment: {
            id: tempId,
            fileName,
            filePath,
            mimeType: '',
            sizeBytes: 0,
            status: 'processing',
            addedToKnowledge: false,
          },
        });

        try {
          const result = await documentAddFile(filePath);
          dispatch({
            type: 'UPDATE_ATTACHMENT',
            id: tempId,
            updates: {
              id: result.id,
              mimeType: result.mimeType,
              sizeBytes: result.sizeBytes,
              status: result.status,
              documentId: result.documentId,
              error: result.error,
            },
          });
        } catch (err) {
          dispatch({
            type: 'UPDATE_ATTACHMENT',
            id: tempId,
            updates: {
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    } catch (err) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        message: {
          id: `system_${Date.now()}`,
          role: 'assistant',
          content: t('screen.chat.error_attach', { error: err instanceof Error ? err.message : String(err) }),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      });
    }
  }, [dispatch]);

  // Remove a single attachment
  const handleRemoveAttachment = useCallback(async (id: string) => {
    const att = state.chatAttachments.find(a => a.id === id);
    if (att?.documentId) {
      try { await documentRemoveFile(att.documentId); } catch { /* ignore */ }
    }
    dispatch({ type: 'REMOVE_ATTACHMENT', id });
  }, [state.chatAttachments, dispatch]);

  // Legacy single-file picker (backward compat)
  const handleAttachLegacy = useCallback(async () => {
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
          content: t('screen.chat.error_attach', { error: err instanceof Error ? err.message : String(err) }),
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
        content: t('screen.chat.document_cleared'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    });
  }, [dispatch]);

  // Panel slot handlers — swap, never stack
  const openDocumentPanel = useCallback(() => {
    setActivePanel('documents');
    setSelectedArtifact(null);
  }, []);

  const openArtifactPanel = useCallback((artifact: ArtifactItem) => {
    setSelectedArtifact(artifact);
    setActivePanel('artifact');
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel('none');
    setSelectedArtifact(null);
  }, []);

  // Artifact detection: parse last assistant message for artifacts
  const lastAssistantMsg = state.chatMessages.filter(m => m.role === 'assistant').at(-1);
  const parsedArtifacts = useMemo(() => {
    if (!lastAssistantMsg?.content) return [];
    const { artifacts } = parseArtifacts(lastAssistantMsg.content);
    return artifacts;
  }, [lastAssistantMsg?.content]);

  // Auto-open artifact panel when a new artifact is detected
  useEffect(() => {
    if (parsedArtifacts.length > 0 && !state.isResponding) {
      const latest = parsedArtifacts[parsedArtifacts.length - 1]!;
      openArtifactPanel(latest);
    }
  }, [parsedArtifacts, state.isResponding, openArtifactPanel]);

  // Listen for streaming tokens
  useTauriEvent<string>('semblance://chat-token', useCallback((token: string) => {
    dispatch({ type: 'APPEND_TO_LAST_MESSAGE', content: token });
  }, [dispatch]));

  // Listen for chat completion — refresh conversation list to show updated preview
  useTauriEvent<{ id: string; content: string }>('semblance://chat-complete', useCallback(() => {
    dispatch({ type: 'SET_IS_RESPONDING', value: false });
    refreshConversationList();
  }, [dispatch, refreshConversationList]));

  // Sound: Alter Ego batch ready
  useTauriEvent('semblance://alter-ego-batch-ready', useCallback(() => {
    play('alter_ego_batched');
  }, [play]));

  // Sound: Hard limit triggered
  useTauriEvent('semblance://hard-limit-triggered', useCallback(() => {
    play('hard_limit_triggered');
  }, [play]));

  // Web search results from sidecar
  useTauriEvent<{ query: string; provider: string; results: Array<{ title: string; url: string; snippet: string; age?: string }> }>(
    'semblance://web-search-results',
    useCallback((payload) => {
      setWebSearchQuery(payload.query);
      setWebSearchProvider(payload.provider as 'brave' | 'searxng');
      setWebSearchResults(payload.results);
    }, []),
  );

  // Web fetch result from sidecar
  useTauriEvent<{ url: string; title: string; content: string; bytesFetched: number; contentType: string }>(
    'semblance://web-fetch-result',
    useCallback((payload) => {
      setWebFetchResult(payload);
    }, []),
  );

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
    // Sound effect removed per user request

    try {
      const result = await sendMessage(message, state.activeConversationId ?? undefined);
      // If we got a new conversation ID back (first message), update state
      if (result.conversationId && result.conversationId !== state.activeConversationId) {
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: result.conversationId });
      }
    } catch (err) {
      dispatch({ type: 'SET_IS_RESPONDING', value: false });
      dispatch({
        type: 'APPEND_TO_LAST_MESSAGE',
        content: t('screen.chat.error_response', { error: err instanceof Error ? err.message : t('screen.chat.error_response_default') }),
      });
    }
  }, [dispatch, state.activeConversationId]);

  // Build file list for DocumentPanel from chatAttachments
  const documentPanelFiles = state.chatAttachments
    .filter(a => a.status === 'ready' || a.status === 'processing')
    .map(a => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      status: a.status as 'ready' | 'processing',
      addedToKnowledge: a.addedToKnowledge,
    }));

  // Map ConversationSummaryState to ConversationHistoryItem
  const historyItems = state.conversations.map(c => ({
    id: c.id,
    title: c.title,
    autoTitle: c.autoTitle,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    pinned: c.pinned,
    turnCount: c.turnCount,
    lastMessagePreview: c.lastMessagePreview,
  }));

  return (
    <div className="flex h-full">
      {/* Left panel — Conversation History */}
      <ConversationHistoryPanel
        items={historyItems}
        activeId={state.activeConversationId}
        open={state.historyPanelOpen}
        searchQuery={historySearch}
        onSearchChange={handleHistorySearchChange}
        onSelect={handleSwitchConversation}
        onNew={handleNewConversation}
        onPin={handlePinConversation}
        onUnpin={handleUnpinConversation}
        onRename={handleRenameConversation}
        onDelete={handleDeleteConversation}
        onClose={() => dispatch({ type: 'SET_HISTORY_PANEL', open: false })}
      />

      {/* Main chat column */}
      <div
        ref={containerRef}
        className="flex flex-col flex-1 min-w-0 h-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-semblance-primary-subtle/50 dark:bg-semblance-primary-subtle-dark/50 border-2 border-dashed border-semblance-primary rounded-lg pointer-events-none">
            <p className="text-semblance-primary font-semibold text-lg">{t('screen.chat.drop_overlay')}</p>
          </div>
        )}

        {/* Connection status bar */}
        <div className="flex items-center gap-4 px-6 py-2 border-b border-semblance-border dark:border-semblance-border-dark">
          {/* History toggle button */}
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_HISTORY_PANEL' })}
            className="p-1 rounded hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors"
            title="History (Ctrl+H)"
            data-testid="toggle-history-panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semblance-text-tertiary">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          {state.activeModel && (
            <div className="flex items-center gap-2">
              <StatusIndicator status="success" />
              <span className="text-xs text-semblance-text-tertiary">
                {state.activeModel}{state.inferenceEngine === 'native' ? ' (built-in)' : ''}
              </span>
            </div>
          )}
          {state.indexingStatus.state !== 'idle' && state.indexingStatus.state !== 'complete' && (
            <div className="flex items-center gap-2">
              <StatusIndicator status="accent" pulse />
              <span className="text-xs text-semblance-text-tertiary">
                {t('screen.chat.status_indexing', { scanned: state.indexingStatus.filesScanned, total: state.indexingStatus.filesTotal })}
              </span>
            </div>
          )}
          {/* Document panel toggle */}
          {state.chatAttachments.length > 0 && (
            <button
              type="button"
              onClick={activePanel === 'documents' ? closePanel : openDocumentPanel}
              className="text-xs text-semblance-text-tertiary hover:text-semblance-text-primary transition-colors"
              data-testid="toggle-document-panel"
            >
              {t('screen.chat.documents_count', { count: state.chatAttachments.length })}
            </button>
          )}
          {/* New conversation compose button */}
          <button
            type="button"
            onClick={handleNewConversation}
            className="ml-auto p-1 rounded hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors"
            title="New conversation (Ctrl+N)"
            data-testid="new-conversation-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semblance-text-tertiary">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
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
              aria-label={t('a11y.clear_document_context')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-semblance-text-tertiary">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Message area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-4">
        <div className="max-w-[720px] mx-auto px-6 space-y-4">
          {state.chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-lg text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                {t('screen.chat.ask_anything', { name })}
              </p>
              <div className="mt-6 space-y-2">
                {[
                  { key: 'screen.chat.suggestion_topics', label: t('screen.chat.suggestion_topics') },
                  { key: 'screen.chat.suggestion_summarize', label: t('screen.chat.suggestion_summarize') },
                  { key: 'screen.chat.suggestion_work', label: t('screen.chat.suggestion_work') },
                ].map(
                  (suggestion) => (
                    <button
                      key={suggestion.key}
                      type="button"
                      onClick={() => handleSend(suggestion.label)}
                      className="block w-full text-left px-4 py-3 rounded-lg text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark bg-semblance-surface-2 dark:bg-semblance-surface-2-dark hover:bg-semblance-primary-subtle dark:hover:bg-semblance-primary-subtle-dark transition-colors duration-fast"
                    >
                      {suggestion.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <>
              {state.chatMessages.map((msg, i) => (
                <ChatBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                  streaming={state.isResponding && msg.role === 'assistant' && i === state.chatMessages.length - 1}
                />
              ))}
              {/* Web search results — shown inline after relevant assistant messages */}
              {webSearchResults.length > 0 && (
                <WebSearchResult
                  results={webSearchResults}
                  query={webSearchQuery}
                  provider={webSearchProvider}
                />
              )}
              {/* Web fetch summary — shown inline after fetch operations */}
              {webFetchResult && (
                <WebFetchSummary
                  url={webFetchResult.url}
                  title={webFetchResult.title}
                  content={webFetchResult.content}
                  bytesFetched={webFetchResult.bytesFetched}
                  contentType={webFetchResult.contentType}
                />
              )}
            </>
          )}
        </div>
        </div>

        {/* Voice waveform — shown when recording */}
        {voiceCapable && voice.voiceEnabled && voice.voiceState === 'listening' && (
          <div className="px-6 py-2 flex items-center gap-3">
            <VoiceWaveform level={voice.audioLevel} active={true} />
          </div>
        )}

        {/* Input */}
        <div className="px-6 pb-6 flex items-end gap-2">
          {voiceCapable && voice.voiceEnabled && (
            <VoiceButton
              state={voice.voiceState}
              onClick={voice.voiceState === 'listening' ? voice.onVoiceStop : voice.onVoiceStart}
              disabled={state.isResponding}
            />
          )}
          <div className="flex-1">
          <AgentInput
            onSend={handleSend}
            thinking={state.isResponding}
            activeDocument={state.documentContext ? {
              name: state.documentContext.fileName,
              onDismiss: handleClearDocument,
            } : null}
            attachments={state.chatAttachments.map(a => ({
              id: a.id,
              fileName: a.fileName,
              status: a.status,
              error: a.error,
            }))}
            onAttach={handleAttach}
            onRemoveAttachment={handleRemoveAttachment}
            placeholder={undefined}
            voiceEnabled={voiceCapable && voice.voiceEnabled}
            voiceState={voice.voiceState}
            audioLevel={voice.audioLevel}
            onVoiceStart={voice.onVoiceStart}
            onVoiceStop={voice.onVoiceStop}
            onVoiceCancel={voice.onVoiceCancel}
          />
          </div>
        </div>
      </div>

      {/* Right panel slot — shared between DocumentPanel and ArtifactPanel (swap, never stack) */}
      <DocumentPanel
        files={documentPanelFiles}
        open={activePanel === 'documents'}
        onClose={closePanel}
        onRemoveFile={(id) => handleRemoveAttachment(id)}
        onAddToKnowledge={(id) => {
          addAttachmentToKnowledge(id).then(() => {
            dispatch({ type: 'UPDATE_ATTACHMENT', id, updates: { addedToKnowledge: true } });
          }).catch(() => {
            // Knowledge ingestion failed — attachment stays as-is
          });
        }}
        onAttach={handleAttach}
      />
      <ArtifactPanel
        artifact={selectedArtifact}
        open={activePanel === 'artifact'}
        onClose={closePanel}
        onDownload={async (artifact) => {
          try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const chosen = await save({
              defaultPath: `${artifact.title}.${artifact.language ?? 'txt'}`,
              filters: [{ name: 'All Files', extensions: ['*'] }],
            });
            if (chosen) {
              const fsModName = '@tauri-apps/plugin-fs';
              const { writeTextFile } = await import(/* @vite-ignore */ fsModName) as { writeTextFile(path: string, contents: string): Promise<void> };
              await writeTextFile(chosen, artifact.content);
              return;
            }
          } catch {
            // Tauri dialog unavailable (dev mode) — fall back to browser download
          }
          const blob = new Blob([artifact.content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${artifact.title}.${artifact.language ?? 'txt'}`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
