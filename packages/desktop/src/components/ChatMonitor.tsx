/**
 * ChatMonitor — Persistent chat panel that fills the right gutter.
 * Dynamically measures the gutter (content right edge → viewport right edge)
 * and sizes itself to fit exactly. Updates on resize and sidebar toggle.
 *
 * Hidden on /chat route. Three states: hidden → minimized → expanded.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MultiAgentOverlay } from './MultiAgentOverlay';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { sendMessage, cancelMessage } from '../ipc/commands';
import type { SubagentStreamEvent } from './MultiAgentDemo';

// ─── Gutter measurement hook ─────────────────────────────────────────────────

function useRightGutter() {
  const [gutter, setGutter] = useState({ left: 0, width: 0, center: 0 });

  const measure = useCallback(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const mainRect = main.getBoundingClientRect();
    // Same math as GhostSprite — page-layout is 960px max-width centered in main
    const pageLayoutMaxWidth = 960;
    const mainCenter = mainRect.left + mainRect.width / 2;
    const contentRight = mainCenter + Math.min(pageLayoutMaxWidth, mainRect.width) / 2;

    const gutterLeft = contentRight;
    const gutterWidth = Math.max(0, mainRect.right - contentRight);
    const gutterCenter = contentRight + gutterWidth / 2;

    setGutter({ left: gutterLeft, width: gutterWidth, center: gutterCenter });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);

    // Also observe the main element for sidebar toggle changes
    const main = document.querySelector('main');
    const observer = main && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null;
    if (observer && main) observer.observe(main);

    // Re-measure periodically for sidebar transitions (300ms transition)
    const interval = setInterval(measure, 500);

    return () => {
      window.removeEventListener('resize', measure);
      if (observer) observer.disconnect();
      clearInterval(interval);
    };
  }, [measure]);

  return gutter;
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  const gutter = useRightGutter();

  // Auto-expand when agent starts responding from another screen
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

  // Listen for streaming tokens
  useTauriEvent<string>('semblance://chat-token', useCallback((token: string) => {
    if (!isOnChat) {
      dispatch({ type: 'APPEND_TO_LAST_MESSAGE', content: token });
    }
  }, [dispatch, isOnChat]));

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim()) return;
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: { id: `user_${Date.now()}`, role: 'user', content: message, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    });
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: { id: `assistant_${Date.now()}`, role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    });
    dispatch({ type: 'SET_IS_RESPONDING', value: true });
    try {
      await sendMessage(message, state.activeConversationId ?? undefined);
    } catch (err) {
      dispatch({ type: 'SET_IS_RESPONDING', value: false });
      dispatch({ type: 'APPEND_TO_LAST_MESSAGE', content: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [dispatch, state.activeConversationId]);

  const handleToggle = useCallback(() => {
    if (panelState === 'expanded') {
      dispatch({ type: 'SET_CHAT_MONITOR', state: 'minimized' });
    } else {
      dispatch({ type: 'SET_CHAT_MONITOR', state: 'expanded' });
    }
  }, [panelState, dispatch]);

  const handleMinimize = useCallback(() => {
    dispatch({ type: 'SET_CHAT_MONITOR', state: 'minimized' });
  }, [dispatch]);

  const handleOpenInChat = useCallback(() => {
    dispatch({ type: 'SET_CHAT_MONITOR', state: 'hidden' });
    navigate('/chat');
  }, [dispatch, navigate]);

  // Don't render on chat screen or if gutter is too narrow
  if (isOnChat) return null;
  const gutterTooNarrow = gutter.width < 60;

  // Derive status text
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

  const recentMessages = messages.slice(-8);

  // Panel dimensions — fill the gutter
  const panelPadding = 8; // padding from edges
  const panelWidth = Math.max(200, gutter.width - panelPadding * 2);
  const panelLeft = gutter.left + panelPadding;

  return (
    <>
      {/* ─── Trigger icon — centered in gutter ─── */}
      {!gutterTooNarrow && (
        <button
          type="button"
          onClick={handleToggle}
          style={{
            position: 'fixed',
            bottom: 24,
            left: gutter.center - 20,
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
          }}
          title="Chat Monitor"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            stroke={isResponding ? '#6ECFA3' : '#5E6B7C'}
            style={{ transition: 'stroke 300ms ease' }}
          >
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </svg>
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
      )}

      {/* ─── Minimized indicator — centered in gutter ─── */}
      {panelState === 'minimized' && isResponding && !gutterTooNarrow && (
        <div
          onClick={() => dispatch({ type: 'SET_CHAT_MONITOR', state: 'expanded' })}
          style={{
            position: 'fixed',
            bottom: 72,
            left: gutter.center,
            transform: 'translateX(-50%)',
            zIndex: 9000,
            background: '#121518',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: gutter.width - 16,
          }}
        >
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: '#6ECFA3',
            animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '-1000s', flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#A8B4C0',
            letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {statusText}
          </span>
        </div>
      )}

      {/* ─── Expanded panel — fills right gutter ─── */}
      {panelState === 'expanded' && !gutterTooNarrow && (
        <div
          style={{
            position: 'fixed',
            top: 8,
            left: panelLeft,
            width: panelWidth,
            bottom: 72,
            zIndex: 9000,
            background: '#0B0E11',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400,
              color: '#A8B4C0', letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              Chat
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={handleOpenInChat} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6ECFA3', letterSpacing: '0.04em', padding: '2px 6px',
              }}>
                Open
              </button>
              <button type="button" onClick={handleMinimize} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#5E6B7C', display: 'flex', alignItems: 'center',
              }} title="Minimize">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="12" x2="18" y2="12" />
                </svg>
              </button>
              <button type="button" onClick={() => dispatch({ type: 'SET_CHAT_MONITOR', state: 'hidden' })} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#5E6B7C', display: 'flex', alignItems: 'center',
              }} title="Close">
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
              padding: '12px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {recentMessages.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flex: 1, fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: '#5E6B7C', letterSpacing: '0.04em', textAlign: 'center',
                padding: '0 12px',
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
                    {msg.role === 'assistant' && hasOrch && (
                      <div style={{ marginBottom: 6 }}>
                        <MultiAgentOverlay
                          events={msg.orchestration as unknown as SubagentStreamEvent[]}
                          active={isStreaming && state.isResponding}
                          collapsed={!isStreaming}
                        />
                      </div>
                    )}
                    <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant'}`}>
                      <div className="chat-bubble__card" style={{
                        padding: '6px 10px',
                        fontSize: 11,
                        maxWidth: '95%',
                      }}>
                        <span className="chat-bubble__content" style={{ fontSize: 11 }}>
                          {msg.content
                            ? (msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content)
                                .replace(/<artifact\s+[^>]*>[\s\S]*?<\/artifact>/g, '')
                                .replace(/<\/?artifact[^>]*>/g, '')
                                .trim() || (isStreaming ? '' : '...')
                            : isStreaming
                              ? <span style={{ display: 'inline-block', width: 8, height: 1, background: '#6ECFA3', animation: 'loading-pulse 1s ease-in-out infinite' }} />
                              : '...'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: '10px',
            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                  minWidth: 0,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(110, 207, 163, 0.25)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)')}
              />
              {isResponding ? (
                <button type="button" onClick={() => cancelMessage().catch(() => {})} style={{
                  background: 'none', border: '1px solid rgba(232, 101, 122, 0.2)', borderRadius: 6,
                  padding: '6px 8px', cursor: 'pointer', fontFamily: "'DM Mono', monospace",
                  fontSize: 10, color: '#E8657A', letterSpacing: '0.04em', flexShrink: 0,
                }}>
                  Stop
                </button>
              ) : (
                <button type="button" onClick={() => {
                  if (inputValue.trim()) { handleSend(inputValue.trim()); setInputValue(''); }
                }} disabled={!inputValue.trim()} style={{
                  background: 'none', border: '1px solid rgba(110, 207, 163, 0.2)', borderRadius: 6,
                  padding: '6px 8px', cursor: inputValue.trim() ? 'pointer' : 'default',
                  fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.04em', flexShrink: 0,
                  color: inputValue.trim() ? '#6ECFA3' : '#5E6B7C',
                  opacity: inputValue.trim() ? 1 : 0.5,
                }}>
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
