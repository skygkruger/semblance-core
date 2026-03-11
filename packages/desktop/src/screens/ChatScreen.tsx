import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatBubble, AgentInput, StatusIndicator, DocumentPanel, ArtifactPanel, ConversationHistoryPanel, ApprovalCard, AlterEgoDraftReview, AlterEgoReceipt, AlterEgoBatchReview, ActionCard } from '@semblance/ui';
import type { ArtifactItem } from '@semblance/ui';
import { MessageDraftCard } from '../components/MessageDraftCard';
import { ReminderCard } from '../components/ReminderCard';
import { SubscriptionInsightCard } from '../components/SubscriptionInsightCard';
import { EscalationPromptCard } from '../components/EscalationPromptCard';
import { DarkPatternBadge } from '../components/DarkPatternBadge';
import { InsightCard } from '../components/InsightCard';
import { ReplyComposer } from '../components/ReplyComposer';
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
  approveAction,
  rejectAction,
} from '../ipc/commands';
import { validateAttachment, mimeFromExtension } from '@semblance/core/agent/attachments';
import { createDesktopVoiceAdapter } from '@semblance/core/platform/desktop-voice';
import type { DocumentContext, ChatMessage, ChatActionItem } from '../state/AppState';

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
  useTauriEvent<{ id: string; content: string; actions?: Array<{ id: string; type: string; status: string; payload: unknown; reasoning?: string }> }>('semblance://chat-complete', useCallback((payload) => {
    dispatch({ type: 'SET_IS_RESPONDING', value: false });
    refreshConversationList();
    // Surface actions from orchestrator inline in chat
    if (payload.actions && payload.actions.length > 0) {
      dispatch({
        type: 'SET_LAST_MESSAGE_ACTIONS',
        actions: payload.actions.map(a => ({
          id: a.id,
          type: a.type,
          status: a.status as ChatActionItem['status'],
          payload: (a.payload ?? {}) as Record<string, unknown>,
          reasoning: a.reasoning,
        })),
      });
    }
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
    // Snapshot current attachments for this message
    const messageAttachments = state.chatAttachments
      .filter(a => a.status === 'ready')
      .map(a => ({
        id: a.id,
        fileName: a.fileName,
        filePath: a.filePath,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      }));

    // Add user message with attachments
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: {
        id: `user_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachments: messageAttachments.length > 0 ? messageAttachments.map(a => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })) : undefined,
      },
    });

    // Clear attachments from input area after they're attached to the message
    if (messageAttachments.length > 0) {
      dispatch({ type: 'CLEAR_ATTACHMENTS' });
    }

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
      const result = await sendMessage(
        message,
        state.activeConversationId ?? undefined,
        messageAttachments.length > 0 ? messageAttachments : undefined,
      );
      // If we got a new conversation ID back (first message), update state
      if (result.conversationId && result.conversationId !== state.activeConversationId) {
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: result.conversationId });
      }
    } catch (err) {
      dispatch({ type: 'SET_IS_RESPONDING', value: false });
      dispatch({
        type: 'APPEND_TO_LAST_MESSAGE',
        content: `Error: ${err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)}`,
      });
    }
  }, [dispatch, state.activeConversationId, state.chatAttachments]);

  // Action approve/reject handlers for inline approval cards
  const handleApproveAction = useCallback(async (actionId: string) => {
    try {
      await approveAction(actionId);
      // Update the action status in the chat message
      const msgs = [...state.chatMessages];
      for (const msg of msgs) {
        if (msg.actions) {
          const act = msg.actions.find(a => a.id === actionId);
          if (act) {
            act.status = 'executed';
            break;
          }
        }
      }
      dispatch({ type: 'REPLACE_CHAT_MESSAGES', messages: msgs });
    } catch (err) {
      console.error('Failed to approve action:', err);
    }
  }, [state.chatMessages, dispatch]);

  const handleRejectAction = useCallback(async (actionId: string) => {
    try {
      await rejectAction(actionId);
      const msgs = [...state.chatMessages];
      for (const msg of msgs) {
        if (msg.actions) {
          const act = msg.actions.find(a => a.id === actionId);
          if (act) {
            act.status = 'rejected';
            break;
          }
        }
      }
      dispatch({ type: 'REPLACE_CHAT_MESSAGES', messages: msgs });
    } catch (err) {
      console.error('Failed to reject action:', err);
    }
  }, [state.chatMessages, dispatch]);

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

  // Helper: describe an action for display
  function describeAction(actionType: string, payload: Record<string, unknown>): string {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s;
    switch (actionType) {
      case 'email.send': {
        const to = Array.isArray(payload['to']) ? payload['to'].join(', ') : '';
        return `Send email to ${to}: ${truncate(String(payload['subject'] ?? ''), 60)}`;
      }
      case 'email.draft':
        return `Save draft: ${truncate(String(payload['subject'] ?? ''), 60)}`;
      case 'email.archive':
        return `Archive ${Array.isArray(payload['messageIds']) ? payload['messageIds'].length : 1} email(s)`;
      case 'email.move':
        return `Move email(s) to ${payload['toFolder'] ?? 'folder'}`;
      case 'email.markRead':
        return `Mark ${Array.isArray(payload['messageIds']) ? payload['messageIds'].length : 1} email(s) as ${payload['read'] ? 'read' : 'unread'}`;
      case 'calendar.create':
        return `Create event: ${truncate(String(payload['title'] ?? ''), 50)}`;
      case 'calendar.update':
        return `Update event: ${truncate(String(payload['title'] ?? payload['eventId'] ?? ''), 50)}`;
      case 'calendar.delete':
        return `Delete event: ${truncate(String(payload['title'] ?? payload['eventId'] ?? ''), 50)}`;
      case 'reminder.create':
        return `Create reminder: ${truncate(String(payload['text'] ?? ''), 50)}`;
      case 'reminder.delete':
        return `Delete reminder`;
      case 'messaging.send':
        return `Send text to ${payload['recipientName'] ?? 'contact'}`;
      case 'file.write':
        return `Save file: ${payload['filename'] ?? 'file'}`;
      default:
        return actionType.replace(/\./g, ' ');
    }
  }

  function getActionRisk(actionType: string): 'low' | 'medium' | 'high' {
    switch (actionType) {
      case 'email.send':
      case 'messaging.send':
      case 'calendar.delete':
        return 'medium';
      case 'email.archive':
      case 'email.move':
      case 'email.markRead':
      case 'email.draft':
      case 'calendar.create':
      case 'calendar.update':
      case 'reminder.create':
      case 'reminder.delete':
      case 'file.write':
        return 'low';
      default:
        return 'low';
    }
  }

  // Determine the autonomy tier for an action's domain
  function getAutonomyTierForAction(actionType: string): 'guardian' | 'partner' | 'alter_ego' {
    const domainMap: Record<string, string> = {
      'email.send': 'email', 'email.draft': 'email', 'email.archive': 'email',
      'email.move': 'email', 'email.markRead': 'email', 'email.fetch': 'email',
      'calendar.create': 'calendar', 'calendar.update': 'calendar', 'calendar.delete': 'calendar', 'calendar.fetch': 'calendar',
      'messaging.send': 'messaging', 'messaging.draft': 'messaging',
      'reminder.create': 'general', 'reminder.delete': 'general', 'reminder.list': 'general',
      'file.write': 'general',
      'web.search': 'general', 'web.fetch': 'general',
      'subscription.insight': 'finance', 'finance.fetch_transactions': 'finance',
      'health.entry': 'health', 'health.fetch': 'health',
      'dark_pattern.detected': 'general',
      'insight.proactive': 'general', 'insight.meeting_prep': 'calendar',
      'insight.follow_up': 'email', 'insight.deadline': 'general', 'insight.conflict': 'calendar',
      'escalation.prompt': 'general',
    };
    const domain = domainMap[actionType] ?? 'general';
    return state.autonomyConfig[domain] ?? 'partner';
  }

  // Route each action to the right UI component based on type, status, and autonomy tier
  function renderInlineAction(act: ChatActionItem) {
    const isPending = act.status === 'pending_approval';
    const isExecuted = act.status === 'executed' || act.status === 'approved';
    const isFailed = act.status === 'failed' || act.status === 'rejected';
    const tier = getAutonomyTierForAction(act.type);
    const approvalState = isPending ? 'pending' as const : isExecuted ? 'approved' as const : 'dismissed' as const;

    // ─── Alter Ego receipts: any EXECUTED action in Alter Ego gets receipt with undo ───
    if (isExecuted && tier === 'alter_ego') {
      return (
        <AlterEgoReceipt
          key={act.id}
          id={act.id}
          summary={describeAction(act.type, act.payload)}
          reasoning={act.reasoning ?? 'Acted autonomously based on your preferences.'}
          undoExpiresAt={act.payload['undoExpiresAt'] as string | null ?? null}
          onUndo={(id) => handleRejectAction(id)}
          onDismiss={() => {/* dismiss receipt */}}
        />
      );
    }

    // ─── Completed/rejected actions (non-Alter Ego): ActionCard (status log) ───
    if (isExecuted || isFailed) {
      const actionCardStatus = isFailed
        ? (act.status === 'rejected' ? 'rejected' as const : 'error' as const)
        : 'success' as const;
      return (
        <ActionCard
          key={act.id}
          id={act.id}
          timestamp={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          actionType={act.type}
          description={describeAction(act.type, act.payload)}
          status={actionCardStatus}
          autonomyTier={tier}
          detail={act.reasoning ? <p style={{ color: '#8593A4', fontSize: '0.8125rem', margin: 0 }}>{act.reasoning}</p> : undefined}
        />
      );
    }

    // ─── From here, everything is PENDING ───

    // ─── Email send/draft: always ReplyComposer (editable draft with To/Subject/Body) ───
    if (act.type === 'email.send' || act.type === 'email.draft') {
      const to = Array.isArray(act.payload['to']) ? act.payload['to'] as string[] : [];
      const toNames = Array.isArray(act.payload['toNames']) ? act.payload['toNames'] as string[] : undefined;
      const subject = (act.payload['subject'] as string) ?? '';
      const body = (act.payload['body'] as string) ?? '';
      const replyToMessageId = act.payload['replyToMessageId'] as string | undefined;

      // Reply mode: pass original email context
      if (replyToMessageId) {
        return (
          <ReplyComposer
            key={act.id}
            email={{
              messageId: replyToMessageId,
              from: to[0] ?? '',
              fromName: (act.payload['fromName'] as string) ?? to[0] ?? '',
              subject,
            }}
            draftBody={body}
            onSend={() => handleApproveAction(act.id)}
            onSaveDraft={() => handleRejectAction(act.id)}
            onCancel={() => handleRejectAction(act.id)}
          />
        );
      }

      // Compose mode: new outbound email
      return (
        <ReplyComposer
          key={act.id}
          to={to}
          toNames={toNames}
          subject={subject}
          draftBody={body}
          onSend={() => handleApproveAction(act.id)}
          onSaveDraft={() => handleRejectAction(act.id)}
          onCancel={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── SMS/messaging: MessageDraftCard with autonomy-aware countdown ───
    if (act.type === 'messaging.send' || act.type === 'messaging.draft') {
      const recipientName = (act.payload['recipientName'] as string) ?? 'Contact';
      const phone = (act.payload['phone'] as string) ?? '';
      const maskedPhone = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '';
      const body = (act.payload['body'] as string) ?? '';

      return (
        <MessageDraftCard
          key={act.id}
          recipientName={recipientName}
          maskedPhone={maskedPhone}
          body={body}
          autonomyTier={tier}
          onSend={() => handleApproveAction(act.id)}
          onEdit={() => {/* edit not wired yet */}}
          onCancel={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── Reminders: ReminderCard with snooze/dismiss ───
    if (act.type === 'reminder.create' || act.type === 'reminder.delete') {
      return (
        <ReminderCard
          key={act.id}
          reminder={{
            id: act.id,
            text: (act.payload['text'] as string) ?? describeAction(act.type, act.payload),
            dueAt: (act.payload['dueAt'] as string) ?? new Date().toISOString(),
            recurrence: (act.payload['recurrence'] as 'none' | 'daily' | 'weekly' | 'monthly') ?? 'none',
            source: 'semblance',
          }}
          onSnooze={(id, duration) => {
            // Snooze = reject current + the orchestrator will re-create with new time
            handleRejectAction(id);
          }}
          onDismiss={(id) => handleRejectAction(id)}
        />
      );
    }

    // ─── Subscription insights ───
    if (act.type === 'subscription.insight') {
      const charges = (act.payload['charges'] as Array<{
        id: string; merchantName: string; amount: number;
        frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
        confidence: number; lastChargeDate: string; chargeCount: number;
        estimatedAnnualCost: number; status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
      }>) ?? [];
      const summary = (act.payload['summary'] as {
        totalMonthly: number; totalAnnual: number; activeCount: number;
        forgottenCount: number; potentialSavings: number;
      }) ?? { totalMonthly: 0, totalAnnual: 0, activeCount: charges.length, forgottenCount: 0, potentialSavings: 0 };

      return (
        <SubscriptionInsightCard
          key={act.id}
          charges={charges}
          summary={summary}
          onDismiss={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── Dark pattern detection ───
    if (act.type === 'dark_pattern.detected') {
      return (
        <DarkPatternBadge
          key={act.id}
          flag={{
            contentId: act.id,
            confidence: (act.payload['confidence'] as number) ?? 0.8,
            patterns: (act.payload['patterns'] as Array<{
              category: string; evidence: string; confidence: number;
            }>) ?? [{ category: (act.payload['category'] as string) ?? 'dark_pattern', evidence: (act.payload['evidence'] as string) ?? '', confidence: 0.8 }],
            reframe: (act.payload['reframe'] as string) ?? (act.payload['description'] as string) ?? 'Potential manipulative pattern detected.',
          }}
          onDismiss={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── Proactive insights (meeting prep, follow-up, deadline, conflict) ───
    if (act.type === 'insight.proactive' || act.type === 'insight.meeting_prep' ||
        act.type === 'insight.follow_up' || act.type === 'insight.deadline' || act.type === 'insight.conflict') {
      const rawInsightType = act.type.replace('insight.', '');
      const insightType = (['meeting_prep', 'follow_up', 'deadline', 'conflict'].includes(rawInsightType)
        ? rawInsightType : 'follow_up') as 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict';
      return (
        <InsightCard
          key={act.id}
          insight={{
            id: act.id,
            type: insightType,
            priority: (act.payload['priority'] as 'high' | 'normal' | 'low') ?? 'normal',
            title: (act.payload['title'] as string) ?? describeAction(act.type, act.payload),
            summary: (act.payload['summary'] as string) ?? act.reasoning ?? '',
            suggestedAction: act.payload['suggestedAction'] as { actionType: string; payload: Record<string, unknown>; description: string } | null ?? null,
            createdAt: new Date().toISOString(),
          }}
          onExecuteSuggestion={() => handleApproveAction(act.id)}
          onDismiss={() => handleRejectAction(act.id)}
          onExpand={() => {/* expand detail view */}}
        />
      );
    }

    // ─── Autonomy escalation prompts ───
    if (act.type === 'escalation.prompt') {
      return (
        <EscalationPromptCard
          key={act.id}
          prompt={{
            id: act.id,
            type: (act.payload['escalationType'] as 'guardian_to_partner' | 'partner_to_alterego') ?? 'guardian_to_partner',
            domain: (act.payload['domain'] as string) ?? 'general',
            actionType: (act.payload['actionType'] as string) ?? '',
            consecutiveApprovals: (act.payload['consecutiveApprovals'] as number) ?? 10,
            message: (act.payload['message'] as string) ?? act.reasoning ?? 'You\'ve consistently approved these actions. Want to grant more autonomy?',
            previewActions: (act.payload['previewActions'] as Array<{
              description: string; currentBehavior: string; newBehavior: string; estimatedTimeSaved: string;
            }>) ?? [],
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
            status: 'pending',
          }}
          onAccepted={() => handleApproveAction(act.id)}
          onDismissed={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── Calendar operations: ApprovalCard with structured data ───
    if (act.type.startsWith('calendar.')) {
      const title = (act.payload['title'] as string) ?? '';
      const startTime = act.payload['startTime'] as string | undefined;
      const dataOut = [
        title ? `Event: ${title}` : null,
        startTime ? `When: ${new Date(startTime).toLocaleString()}` : null,
        act.payload['location'] ? `Where: ${act.payload['location']}` : null,
      ].filter(Boolean) as string[];

      return (
        <ApprovalCard
          key={act.id}
          action={act.type}
          context={act.reasoning ?? describeAction(act.type, act.payload)}
          dataOut={dataOut.length > 0 ? dataOut : undefined}
          risk={getActionRisk(act.type)}
          state={approvalState}
          onApprove={() => handleApproveAction(act.id)}
          onDismiss={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── Email management (archive, move, markRead): ApprovalCard with detail ───
    if (act.type === 'email.archive' || act.type === 'email.move' || act.type === 'email.markRead') {
      const count = Array.isArray(act.payload['messageIds']) ? act.payload['messageIds'].length : 1;
      const dataOut = [
        `${count} email(s)`,
        act.type === 'email.move' ? `To: ${act.payload['toFolder'] ?? 'folder'}` : null,
      ].filter(Boolean) as string[];

      return (
        <ApprovalCard
          key={act.id}
          action={act.type}
          context={act.reasoning ?? describeAction(act.type, act.payload)}
          dataOut={dataOut}
          risk={getActionRisk(act.type)}
          state={approvalState}
          onApprove={() => handleApproveAction(act.id)}
          onDismiss={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── File operations: ApprovalCard with filename ───
    if (act.type === 'file.write') {
      return (
        <ApprovalCard
          key={act.id}
          action={act.type}
          context={act.reasoning ?? describeAction(act.type, act.payload)}
          dataOut={act.payload['filename'] ? [`File: ${act.payload['filename']}`] : undefined}
          risk={getActionRisk(act.type)}
          state={approvalState}
          onApprove={() => handleApproveAction(act.id)}
          onDismiss={() => handleRejectAction(act.id)}
        />
      );
    }

    // ─── True fallback: ApprovalCard for unknown action types ───
    return (
      <ApprovalCard
        key={act.id}
        action={act.type}
        context={act.reasoning ?? describeAction(act.type, act.payload)}
        risk={getActionRisk(act.type)}
        state={approvalState}
        onApprove={() => handleApproveAction(act.id)}
        onDismiss={() => handleRejectAction(act.id)}
      />
    );
  }

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
                <div key={msg.id}>
                  {/* Attachments render above the user bubble (like Claude) */}
                  {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 justify-end max-w-[720px] ml-auto">
                      {msg.attachments.map(att => (
                        <div
                          key={att.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                          style={{
                            background: '#171B1F',
                            border: '1px solid rgba(255,255,255,0.09)',
                            color: '#A8B4C0',
                            fontFamily: "'DM Mono', monospace",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#6ECFA3', flexShrink: 0 }}>
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="truncate" style={{ maxWidth: 180 }}>{att.fileName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <ChatBubble
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    streaming={state.isResponding && msg.role === 'assistant' && i === state.chatMessages.length - 1}
                  />
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2 space-y-2 max-w-[720px]">
                      {msg.actions.map(act => renderInlineAction(act))}
                    </div>
                  )}
                </div>
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
