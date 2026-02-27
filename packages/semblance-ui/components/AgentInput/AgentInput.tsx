import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
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
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSend?.(trimmed);
      onSubmit?.(trimmed);
      setValue('');
      if (fieldRef.current) {
        fieldRef.current.style.height = 'auto';
      }
    }
  }, [value, onSend, onSubmit]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
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
          <span className="agent-input__document-name">{activeDocument.name}</span>
          <button
            type="button"
            className="agent-input__document-dismiss"
            onClick={activeDocument.onDismiss}
            aria-label="Dismiss document"
          >
            &times;
          </button>
        </div>
      )}

      <div className="agent-input__container">
        {thinking ? (
          <div className="agent-input__thinking">
            <div className="agent-input__thinking-dot" />
            <span className="agent-input__thinking-text">On it.</span>
          </div>
        ) : (
          <textarea
            ref={fieldRef}
            className="agent-input__field"
            placeholder={placeholder}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={1}
            autoFocus={autoFocus}
          />
        )}
        <div className="agent-input__actions">
          <button
            type="button"
            className="agent-input__send"
            onClick={handleSend}
            disabled={thinking || !hasValue}
            aria-label="Send"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
