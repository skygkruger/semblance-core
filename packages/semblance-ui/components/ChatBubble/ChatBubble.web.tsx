import { useRef, useEffect, useState } from 'react';
import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner.web';
import type { ChatBubbleProps } from './ChatBubble.types';
import { renderMarkdown } from './markdown';
import './ChatBubble.css';

export function ChatBubble({ role, content, timestamp, streaming = false, className = '' }: ChatBubbleProps) {
  const isUser = role === 'user';

  // Track cursor fade-out: keep the cursor visible for 300ms after streaming stops
  const [showCursor, setShowCursor] = useState(false);
  const [cursorFading, setCursorFading] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  return (
    <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'} ${className}`.trim()}>
      <div className="chat-bubble__card">
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
