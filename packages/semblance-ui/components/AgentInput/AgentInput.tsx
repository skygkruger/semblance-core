import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import './AgentInput.css';

interface AgentInputProps {
  placeholder?: string;
  thinking?: boolean;
  activeDocument?: string;
  onSend?: (message: string) => void;
  className?: string;
}

export function AgentInput({
  placeholder = 'Ask Semblance anything...',
  thinking = false,
  activeDocument,
  onSend,
  className = '',
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && onSend) {
      onSend(trimmed);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [value, onSend]);

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

  return (
    <div className={`agent-input opal-surface ${className}`.trim()}>
      {activeDocument && (
        <div className="agent-input__document-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {activeDocument}
        </div>
      )}

      {thinking && (
        <div className="agent-input__thinking">
          <span className="agent-input__thinking-dot" />
          <span className="agent-input__thinking-text">Thinking</span>
        </div>
      )}

      <div className="agent-input__container">
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
        />
        <button
          type="button"
          className="agent-input__send"
          onClick={handleSend}
          disabled={!value.trim() || thinking}
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
