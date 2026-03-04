// VoiceButton — Microphone button for voice interaction.
// State-aware: idle / listening / processing / thinking / speaking / error.

import type { VoiceConversationState } from '@semblance/core/voice/voice-conversation-manager';
import './VoiceButton.css';

export type VoiceButtonState = VoiceConversationState | 'thinking';

interface VoiceButtonProps {
  state: VoiceButtonState;
  onClick: () => void;
  disabled?: boolean;
}

const STATE_LABELS: Record<VoiceButtonState, string> = {
  idle: 'Start voice input',
  listening: 'Listening — tap to stop',
  processing: 'Processing speech',
  thinking: 'Thinking',
  speaking: 'Speaking — tap to stop',
  error: 'Voice error — tap to retry',
};

const STATE_ICONS: Record<VoiceButtonState, string> = {
  idle: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z',
  listening: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z',
  processing: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  thinking: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  speaking: 'M3 9v6h4l5 5V4L7 9H3z',
  error: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
};

export function VoiceButton({ state, onClick, disabled }: VoiceButtonProps) {
  const isActive = state === 'listening' || state === 'speaking';
  const isProcessing = state === 'processing' || state === 'thinking';

  const btnClass = [
    'voice-btn',
    isActive && 'voice-btn--active',
    state === 'error' && 'voice-btn--error',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isProcessing}
      aria-label={STATE_LABELS[state]}
      className={btnClass}
    >
      {state === 'listening' && <span className="voice-btn__pulse" />}
      {isProcessing && <span className="voice-btn__spinner" />}

      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="voice-btn__icon"
        aria-hidden="true"
      >
        <path d={STATE_ICONS[state]} />
        {(state === 'idle' || state === 'listening') && (
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        )}
      </svg>
    </button>
  );
}
