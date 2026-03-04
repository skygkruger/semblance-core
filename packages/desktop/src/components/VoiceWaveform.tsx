// VoiceWaveform — Amplitude visualization during voice recording.
// Displays a simple bar-based waveform from audio level data.

import './VoiceWaveform.css';

interface VoiceWaveformProps {
  /** Current audio level 0-1 */
  level: number;
  /** Whether actively recording */
  active: boolean;
  /** Number of bars to display */
  bars?: number;
}

export function VoiceWaveform({ level, active, bars = 5 }: VoiceWaveformProps) {
  if (!active) return null;

  return (
    <div
      className="voice-waveform"
      role="status"
      aria-label={`Audio level: ${Math.round(level * 100)}%`}
    >
      {Array.from({ length: bars }, (_, i) => {
        const variation = Math.sin((i + Date.now() / 200) * 0.8) * 0.3;
        const barLevel = Math.max(0.1, Math.min(1, level + variation));
        const heightPercent = active ? barLevel * 100 : 10;

        return (
          <div
            key={i}
            className="voice-waveform__bar"
            style={{ height: `${heightPercent}%`, minHeight: '4px' }}
          />
        );
      })}
    </div>
  );
}
