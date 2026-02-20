import { useRef, useState, useCallback, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Type a message...', className = '' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 6 * 24; // ~6 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  return (
    <div
      className={`
        flex items-end gap-2 p-3
        bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
        border border-semblance-border dark:border-semblance-border-dark
        rounded-lg shadow-sm
        focus-within:border-semblance-primary focus-within:shadow-focus
        transition-all duration-fast
        ${className}
      `.trim()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="
          flex-1 resize-none bg-transparent
          text-base text-semblance-text-primary dark:text-semblance-text-primary-dark
          placeholder:text-semblance-text-tertiary
          focus:outline-none
          disabled:opacity-50
        "
        aria-label="Message input"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="
          flex-shrink-0 p-2 rounded-full
          bg-semblance-primary text-white
          hover:bg-semblance-primary-hover
          disabled:opacity-50 disabled:pointer-events-none
          transition-colors duration-fast
          focus-visible:outline-none focus-visible:shadow-focus
        "
        aria-label="Send message"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
        </svg>
      </button>
    </div>
  );
}
