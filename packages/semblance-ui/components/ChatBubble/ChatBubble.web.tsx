import type { ChatBubbleProps } from './ChatBubble.types';

export function ChatBubble({ role, content, timestamp, streaming = false, className = '' }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${className}`}
    >
      <div
        className={`
          max-w-[80%] px-4 py-3 rounded-lg
          ${isUser
            ? 'bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-text-primary dark:text-semblance-text-primary-dark'
            : 'bg-semblance-surface-1 dark:bg-semblance-surface-1-dark border border-semblance-border dark:border-semblance-border-dark text-semblance-text-primary dark:text-semblance-text-primary-dark'
          }
        `.trim()}
      >
        <p className="text-base whitespace-pre-wrap break-words">
          {content}
          {streaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-semblance-primary animate-loading-pulse rounded-sm align-text-bottom" />
          )}
        </p>
        {timestamp && (
          <p className={`text-xs mt-2 ${isUser ? 'text-semblance-muted' : 'text-semblance-text-tertiary'}`}>
            {timestamp}
          </p>
        )}
      </div>
    </div>
  );
}
