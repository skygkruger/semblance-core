import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner';
import type { AgentInputProps } from './AgentInput.types';
import {
  MIC_PATH,
  MIC_BASE,
  SPEAKER_PATH,
  ERROR_PATH,
  VOICE_LABELS,
  PLACEHOLDER_HINTS,
} from './AgentInput.types';
import './AgentInput.css';

export function AgentInput({
  placeholder,
  thinking = false,
  activeDocument,
  onSend,
  onSubmit,
  autoFocus = false,
  className = '',
  voiceEnabled = false,
  voiceState = 'idle',
  audioLevel = 0,
  onVoiceStart,
  onVoiceStop,
  onVoiceCancel,
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Resolve hint text: explicit placeholder prop overrides default hints
  const hints = placeholder ? [placeholder] : PLACEHOLDER_HINTS;

  // Hint cycling — only when multiple hints and user is not active
  useEffect(() => {
    if (isFocused || value || hints.length <= 1) return;
    const interval = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIndex(i => (i + 1) % hints.length);
        setHintVisible(true);
      }, 400);
    }, 4500);
    return () => clearInterval(interval);
  }, [isFocused, value, hints.length]);

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

  const isVoiceActive = voiceEnabled && voiceState !== 'idle';

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // During listening, any keypress cancels voice and returns to typing
    if (voiceEnabled && voiceState === 'listening') {
      onVoiceCancel?.();
    }
  }, [handleSend, voiceEnabled, voiceState, onVoiceCancel]);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }, []);

  const handleTextareaFocus = useCallback(() => {
    setIsFocused(true);
    // Focusing textarea during listening cancels voice
    if (voiceEnabled && voiceState === 'listening') {
      onVoiceCancel?.();
    }
  }, [voiceEnabled, voiceState, onVoiceCancel]);

  const handleTextareaBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleMicClick = useCallback(() => {
    if (!voiceEnabled) return;
    switch (voiceState) {
      case 'idle':
      case 'error':
        onVoiceStart?.();
        break;
      case 'listening':
        onVoiceStop?.();
        break;
      case 'speaking':
        onVoiceCancel?.();
        break;
    }
  }, [voiceEnabled, voiceState, onVoiceStart, onVoiceStop, onVoiceCancel]);

  const hasValue = value.trim().length > 0;

  const rootClasses = [
    'agent-input',
    hasValue ? 'agent-input--has-value' : '',
    thinking ? 'agent-input--thinking' : '',
    voiceEnabled && voiceState === 'listening' ? 'agent-input--listening' : '',
    voiceEnabled && voiceState === 'processing' ? 'agent-input--processing' : '',
    voiceEnabled && voiceState === 'speaking' ? 'agent-input--speaking' : '',
    voiceEnabled && voiceState === 'error' ? 'agent-input--voice-error' : '',
    className,
  ].filter(Boolean).join(' ');

  // Compute waveform bar heights from audioLevel (0-1)
  const barHeights = voiceEnabled && voiceState === 'listening'
    ? [0.4, 0.7, 1.0, 0.7, 0.4].map(scale => Math.max(4, Math.round(scale * audioLevel * 20)))
    : [];

  // Mic icon SVG path selection
  const getMicIcon = () => {
    if (voiceState === 'speaking') return SPEAKER_PATH;
    if (voiceState === 'error') return ERROR_PATH;
    return MIC_PATH;
  };

  const showMicBase = voiceState === 'idle' || voiceState === 'listening' || voiceState === 'processing';

  // Show custom placeholder hint when textarea is empty, not focused, and voice is not active
  const showHint = !value && !isFocused && !isVoiceActive && !thinking;

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
        {/* Textarea always in DOM — hidden when thinking or voice active, preserves layout height */}
        <textarea
          ref={fieldRef}
          className="agent-input__field"
          placeholder=""
          value={thinking || isVoiceActive ? '' : value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleTextareaFocus}
          onBlur={handleTextareaBlur}
          rows={1}
          autoFocus={!thinking && autoFocus}
          readOnly={thinking || isVoiceActive}
          aria-hidden={thinking || isVoiceActive ? true : undefined}
          tabIndex={thinking || isVoiceActive ? -1 : 0}
          data-testid="agent-input-field"
        />

        {/* Thinking overlay — wireframe spinner + text */}
        {thinking && (
          <div className="agent-input__thinking-overlay" data-testid="thinking-overlay">
            <WireframeSpinner size={50} speed={0.8} />
            <span className="agent-input__thinking-text">On it.</span>
          </div>
        )}

        {/* Custom placeholder hint — crossfade-ready, replaces native placeholder */}
        {showHint && (
          <span
            className="agent-input__placeholder-hint"
            style={{ opacity: hintVisible ? 1 : 0, transition: 'opacity 400ms ease' }}
            data-testid="placeholder-hint"
          >
            {hints[hintIndex]}
          </span>
        )}

        {/* Voice overlay — floats above textarea, never replaces it */}
        {voiceEnabled && isVoiceActive && (
          <div className="agent-input__voice-overlay" data-testid="voice-overlay">
            {voiceState === 'listening' && (
              <div className="agent-input__waveform" data-testid="voice-waveform">
                {barHeights.map((h, i) => (
                  <div
                    key={i}
                    className="agent-input__waveform-bar"
                    style={{ height: `${h}px`, '--voice-bar-max': `${h}px` } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
            {voiceState === 'processing' && (
              <span className="agent-input__voice-status" data-testid="voice-processing" />
            )}
            {voiceState === 'speaking' && (
              <span className="agent-input__voice-status" data-testid="voice-speaking">Speaking...</span>
            )}
          </div>
        )}

        <div className="agent-input__actions">
          {voiceEnabled && (
            <button
              type="button"
              className={[
                'agent-input__mic',
                voiceState === 'listening' ? 'agent-input__mic--listening' : '',
                voiceState === 'processing' ? 'agent-input__mic--processing' : '',
                voiceState === 'speaking' ? 'agent-input__mic--speaking' : '',
                voiceState === 'error' ? 'agent-input__mic--error' : '',
              ].filter(Boolean).join(' ')}
              onClick={handleMicClick}
              disabled={voiceState === 'processing'}
              aria-label={VOICE_LABELS[voiceState]}
              data-testid="voice-mic-button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={getMicIcon()} />
                {showMicBase && <path d={MIC_BASE} />}
              </svg>
            </button>
          )}
          <button
            type="button"
            className="agent-input__send"
            onClick={handleSend}
            disabled={thinking || !hasValue || (voiceEnabled && voiceState === 'processing')}
            aria-label="Send"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
