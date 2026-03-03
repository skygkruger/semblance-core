import type { ChatBubbleProps } from './ChatBubble.types';
import './ChatBubble.css';

export function ChatBubble({ role, content, timestamp, streaming = false, className = '' }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'} ${className}`.trim()}>
      <div className="chat-bubble__card">
        <p className="chat-bubble__content">
          {content}
          {streaming && <span className="chat-bubble__cursor" />}
        </p>
        {timestamp && (
          <p className="chat-bubble__timestamp">{timestamp}</p>
        )}
      </div>
    </div>
  );
}
