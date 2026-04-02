/**
 * ChatMonitor — Persistent chat panel accessible from any screen.
 * Fixed icon in the bottom-right viewport corner. Expands to a mini-chat
 * panel for monitoring active tasks or starting new ones.
 *
 * Hidden on /chat route (redundant). Shows task activity indicator when
 * agent is responding. Three states: hidden → minimized → expanded.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatBubble, AgentInput } from '@semblance/ui';
import { MultiAgentOverlay } from './MultiAgentOverlay';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { sendMessage, cancelMessage } from '../ipc/commands';
import type { SubagentStreamEvent } from './MultiAgentDemo';
import type { ChatMessage, ChatActionItem } from '../state/AppState';

export function ChatMonitor() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  const panelState = state.chatMonitor;
  const isOnChat = location.pathname === '/chat';
  const isResponding = state.isResponding;
  const messages = state.chatMessages;

  // Auto-expand when agent starts responding from another screen —
  // if you asked a question and navigated away, you want to see the work
  useEffect(() => {
    if (isResponding && !isOnChat && panelState === 'hidden') {
      dispatch({ type: 'SET_CHAT_MONITOR', state: 'expanded' });
    }
  }, [isResponding, isOnChat, panelState, dispatch]);

  // Auto-scroll in expanded panel
  useEffect(() => {
    if (panelState === 'expanded' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [panelState, messages]);

  // Listen for streaming tokens (needed for live updates in the panel)
  useTauriEvent<string>('semblance://chat-token', useCallback((token: string) => {
    if (!isOnChat) {
      dispatch({ type: 'APPEND_TO_LAST_MESSAGE', content: token });
    }
  }, [dispatch, isOnChat]));

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim()) return;

    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: {
        id: `user_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    });

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
      await sendMessage(message, state.activeConversationId ?? undefined);
    } catch (err) {
      dispatch({ type: 'SET_IS_RESPONDING', value: false });
      dispatch({
        type: 'APPEND_TO_LAST_MESSAGE',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, [dispatch, state.activeConversationId]);

  const handleToggle = useCallback(() => {
    if (panelState === 'hidden') {
      dispatch({ type: 'SET_CHAT_MONITOR', state: 'expanded' });
    } else if (panelState === 'minimized') {
      dispatch({ type: 'SET_CHAT_MONITOR', state: 'expanded' });
    } else {
      dispatch({ type: 'SET_CHAT_MONITOR', state: 'hidden' });
    }
  }, [panelState, dispatch]);

  const handleMinimize = useCallback(() => {
    dispatch({ type: 'SET_CHAT_MONITOR', state: 'minimized' });
  }, [dispatch]);

  const handleOpenInChat = useCallback(() => {
    dispatch({ type: 'SET_CHAT_MONITOR', state: 'hidden' });
    navigate('/chat');
  }, [dispatch, navigate]);

  // Don't render on the chat screen
  if (isOnChat) return null;

  // Derive thinking text for the minimized indicator
  const lastAssistant = messages.filter(m => m.role === 'assistant').at(-1);
  const orch = lastAssistant?.orchestration;
  let statusText = '';
  if (isResponding) {
    if (orch && orch.length > 0) {
      const lastEvent = orch[orch.length - 1]!;
      const t = lastEvent.type as string;
      if (t === 'decomposition_started') statusText = 'Analyzing...';
      else if (t.startsWith('subagent_tool')) statusText = `Using ${(lastEvent.data as Record<string, unknown>).toolName ?? 'tool'}`;
      else if (t === 'subagent_started') statusText = 'Working...';
      else if (t.startsWith('synthesis')) statusText = 'Synthesizing...';
      else statusText = 'Working...';
    } else if (lastAssistant?.content) {
      statusText = 'Responding...';
    } else {
      statusText = 'Thinking...';
    }
  }

  // Last few messages for the expanded view (most recent 6)
  const recentMessages = messages.slice(-6);

  return (
    <>
      {/* ─── Trigger icon — always visible bottom-right ─── */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9000,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: isResponding
            ? 'rgba(110, 207, 163, 0.1)'
            : panelState !== 'hidden'
              ? 'rgba(255, 255, 255, 0.06)'
              : 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${isResponding ? 'rgba(110, 207, 163, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 300ms ease',
          backdropFilter: 'blur(8px)',
        }}
        title="Chat Monitor"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          stroke={isResponding ? '#6ECFA3' : '#5E6B7C'}
          style={{ transition: 'stroke 300ms ease' }}
        >
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
        {/* Activity pulse */}
        {isResponding && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#6ECFA3',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: '-1000s',
          }} />
        )}
      </button>

      {/* ─── Minimized indicator ─── */}
      {panelState === 'minimized' && isResponding && (
        <div
          onClick={() => dispatch({ type: 'SET_CHAT_MONITOR', state: 'expanded' })}
          style={{
            position: 'fixed',
            bottom: 72,
            right: 24,
            zIndex: 9000,
            background: '#121518',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backdropFilter: 'blur(12px)',
            transition: 'all 300ms ease',
          }}
        >
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#6ECFA3',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: '-1000s',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: '#A8B4C0',
            letterSpacing: '0.04em',
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {statusText}
          </span>
        </div>
      )}

      {/* ─── Expanded panel ─── */}
      {panelState === 'expanded' && (
        <div
          style={{
            position: 'fixed',
            bottom: 72,
            right: 24,
            zIndex: 9000,
            width: 340,
            maxHeight: 'calc(100vh - 120px)',
            background: '#0B0E11',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 60px rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              fontWeight: 400,
              color: '#A8B4C0',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              Chat Monitor
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleOpenInChat}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  color: '#6ECFA3',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                }}
              >
                Open
              </button>
              <button
                type="button"
                onClick={handleMinimize}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  color: '#5E6B7C',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Minimize"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 15 12 9 18 15" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_CHAT_MONITOR', state: 'hidden' })}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  color: '#5E6B7C',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 120,
              maxHeight: 400,
            }}
          >
            {recentMessages.length === 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 120,
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                color: '#5E6B7C',
                letterSpacing: '0.04em',
              }}>
                Start a conversation from anywhere
              </div>
            ) : (
              recentMessages.map((msg, i) => {
                const isLast = i === recentMessages.length - 1;
                const isStreaming = isResponding && isLast && msg.role === 'assistant';
                const hasOrch = msg.orchestration && msg.orchestration.length > 0;

                return (
                  <div key={msg.id}>
                    {/* Orchestration bracket (compact) */}
                    {msg.role === 'assistant' && hasOrch && (
                      <div style={{ marginBottom: 6 }}>
                        <MultiAgentOverlay
                          events={msg.orchestration as unknown as SubagentStreamEvent[]}
                          active={isStreaming && state.isResponding}
                          collapsed={!isStreaming}
                        />
                      </div>
                    )}

                    {/* Compact message bubble */}
                    <div style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                      <div style={{
                        maxWidth: '85%',
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: msg.role === 'user'
                          ? 'rgba(110, 207, 163, 0.03)'
                          : '#111518',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(110, 207, 163, 0.08)' : 'rgba(255, 255, 255, 0.04)'}`,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                        color: '#A8B4C0',
                        letterSpacing: '0.04em',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}>
                        {msg.content
                          ? (msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content)
                              .replace(/<artifact\s+[^>]*>[\s\S]*?<\/artifact>/g, '')
                              .replace(/<\/?artifact[^>]*>/g, '')
                              .trim() || (isStreaming ? '' : '...')
                          : isStreaming
                            ? <span style={{ display: 'inline-block', width: 8, height: 1, background: '#6ECFA3', animation: 'loading-pulse 1s ease-in-out infinite' }} />
                            : '...'
                        }
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Compact input */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && inputValue.trim()) {
                    handleSend(inputValue.trim());
                    setInputValue('');
                  }
                }}
                placeholder={isResponding ? statusText : 'Message...'}
                disabled={isResponding}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 6,
                  padding: '7px 10px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: '#A8B4C0',
                  letterSpacing: '0.04em',
                  outline: 'none',
                  transition: 'border-color 200ms ease',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(110, 207, 163, 0.25)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)')}
              />
              {isResponding ? (
                <button
                  type="button"
                  onClick={() => cancelMessage().catch(() => {})}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(232, 101, 122, 0.2)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10,
                    color: '#E8657A',
                    letterSpacing: '0.04em',
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (inputValue.trim()) {
                      handleSend(inputValue.trim());
                      setInputValue('');
                    }
                  }}
                  disabled={!inputValue.trim()}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(110, 207, 163, 0.2)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    cursor: inputValue.trim() ? 'pointer' : 'default',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10,
                    color: inputValue.trim() ? '#6ECFA3' : '#5E6B7C',
                    letterSpacing: '0.04em',
                    opacity: inputValue.trim() ? 1 : 0.5,
                    transition: 'all 200ms ease',
                  }}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
