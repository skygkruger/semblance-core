import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner.web';
import type { ChatBubbleProps } from './ChatBubble.types';
import { renderMarkdown } from './markdown';
import './ChatBubble.css';

export function ChatBubble({ role, content, timestamp, streaming = false, className = '' }: ChatBubbleProps) {
  const isUser = role === 'user';

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
            <WireframeSpinner size={60} speed={0.8} />
          </span>
        )}
        {streaming && content && <span className="chat-bubble__cursor" />}
        {timestamp && (
          <p className="chat-bubble__timestamp">{timestamp}</p>
        )}
      </div>
    </div>
  );
}
