import { useRef, useEffect, useState, useCallback } from 'react';
import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner.web';
import type { ChatBubbleProps } from './ChatBubble.types';
import { renderMarkdown } from './markdown';
import './ChatBubble.css';

export function ChatBubble({ role, content, timestamp, streaming = false, className = '', onCopy, onRegenerate }: ChatBubbleProps) {
  const isUser = role === 'user';
  const cardRef = useRef<HTMLDivElement>(null);

  // Track cursor fade-out: keep the cursor visible for 300ms after streaming stops
  const [showCursor, setShowCursor] = useState(false);
  const [cursorFading, setCursorFading] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Copy feedback state for message-level copy
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (streaming && content) {
      setShowCursor(true);
      setCursorFading(false);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    } else if (!streaming && showCursor) {
      // Streaming just stopped — begin fade
      setCursorFading(true);
      fadeTimerRef.current = setTimeout(() => {
        setShowCursor(false);
        setCursorFading(false);
      }, 300);
    }
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  }, [streaming, !!content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire code block copy buttons via event delegation
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.chat-code-block__copy') as HTMLButtonElement | null;
      if (!btn) return;
      const code = btn.getAttribute('data-code') ?? '';
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      }).catch(() => {});
    };

    card.addEventListener('click', handler);
    return () => card.removeEventListener('click', handler);
  }, [content]);

  // Message-level copy handler
  const handleCopy = useCallback(() => {
    if (onCopy) { onCopy(); return; }
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [content, onCopy]);

  const showActions = !isUser && !streaming && content;
  const streamingClass = streaming && content ? ' chat-bubble--streaming' : '';

  return (
    <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'}${streamingClass} ${className}`.trim()}>
      <div className="chat-bubble__card" ref={cardRef}>
        {/* Message action toolbar — hover to reveal */}
        {showActions && (
          <div className="chat-bubble__actions">
            <button
              type="button"
              className="chat-bubble__action-btn"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
              )}
            </button>
            {onRegenerate && (
              <button
                type="button"
                className="chat-bubble__action-btn"
                onClick={onRegenerate}
                title="Regenerate response"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
              </button>
            )}
          </div>
        )}
        {isUser ? (
          <p className="chat-bubble__content">
            {content}
          </p>
        ) : (
          <div
            className="chat-bubble__content chat-bubble__markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
        {streaming && !content && (
          <span className="chat-bubble__spinner">
            <WireframeSpinner size={60} speed={0.75} />
          </span>
        )}
        {showCursor && (
          <span
            className="chat-bubble__cursor"
            style={{
              opacity: cursorFading ? 0 : 1,
              transition: 'opacity 300ms ease-out',
            }}
          />
        )}
        {timestamp && (
          <p className="chat-bubble__timestamp">{timestamp}</p>
        )}
      </div>
    </div>
  );
}
