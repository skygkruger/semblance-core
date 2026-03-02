export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface AgentInputProps {
  placeholder?: string;
  thinking?: boolean;
  activeDocument?: { name: string; onDismiss: () => void } | null;
  onSend?: (message: string) => void;
  onSubmit?: (message: string) => void;
  autoFocus?: boolean;
  className?: string;
  voiceEnabled?: boolean;
  voiceState?: VoiceState;
  audioLevel?: number;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  onVoiceCancel?: () => void;
}

/** SVG path data for mic icon states -- reused from desktop VoiceButton. */
export const MIC_PATH = 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z';
export const MIC_BASE = 'M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z';
export const SPEAKER_PATH = 'M3 9v6h4l5 5V4L7 9H3z';
export const ERROR_PATH = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';

export const VOICE_LABELS: Record<VoiceState, string> = {
  idle: 'Start voice input',
  listening: 'Stop listening',
  processing: 'Processing speech',
  speaking: 'Stop speaking',
  error: 'Voice error -- tap to retry',
};

export const PLACEHOLDER_HINTS = [
  'Awaiting direction',
];
