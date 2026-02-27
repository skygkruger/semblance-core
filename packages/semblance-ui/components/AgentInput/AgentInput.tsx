import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import './AgentInput.css';

interface AgentInputProps {
  placeholder?: string;
  thinking?: boolean;
  activeDocument?: { name: string; onDismiss: () => void } | null;
  onSend?: (message: string) => void;
  onSubmit?: (message: string) => void;
  autoFocus?: boolean;
  className?: string;
}

export function AgentInput({
  placeholder = 'Ask Semblance anything...',
  thinking = false,
  activeDocument,
  onSend,
  onSubmit,
  autoFocus = false,
  className = '',
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSend?.(trimmed);
      onSubmit?.(trimmed);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [value, onSend, onSubmit]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  const hasValue = value.trim().length > 0;
  const rootClasses = [
    'agent-input',
    hasValue ? 'agent-input--has-value' : '',
    thinking ? 'agent-input--thinking' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClasses}>
      {activeDocument && (
        <div className="agent-input__document-pill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {activeDocument.name}
          <button
            type="button"
            className="agent-input__document-pill-dismiss"
            onClick={activeDocument.onDismiss}
            aria-label="Dismiss document"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="agent-input__container">
        {thinking && (
          <div className="agent-input__thinking">
            <span className="agent-input__thinking-dot" />
            <span className="agent-input__thinking-text">Working on it...</span>
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="agent-input__field"
          placeholder={placeholder}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          disabled={thinking}
          autoFocus={autoFocus}
        />
        <div className="agent-input__actions">
          <button
            type="button"
            className="agent-input__send"
            onClick={handleSend}
            disabled={!hasValue || thinking}
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
