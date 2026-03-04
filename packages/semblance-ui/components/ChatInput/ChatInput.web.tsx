import { useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatInputProps } from './ChatInput.types';
import './ChatInput.css';

export function ChatInput({ onSend, onAttach, disabled = false, placeholder, className = '' }: ChatInputProps) {
  const { t } = useTranslation('agent');
  const resolvedPlaceholder = placeholder ?? t('input.placeholder_default');
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

  const hasValue = value.trim().length > 0;

  const rootClasses = [
    'chat-input',
    hasValue ? 'chat-input--has-value' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClasses}>
      <div className="chat-input__container">
        <textarea
          ref={textareaRef}
          className="chat-input__field"
          value={value}
          onChange={(e) => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          rows={1}
          aria-label={t('input.message_input_label')}
        />
        <div className="chat-input__actions">
          {onAttach && (
            <button
              type="button"
              className="chat-input__attach"
              onClick={onAttach}
              disabled={disabled}
              aria-label={t('input.attach_document')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="chat-input__send"
            onClick={handleSend}
            disabled={disabled || !hasValue}
            aria-label={t('input.send_message')}
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
