// VoiceWaveform — Amplitude visualization during voice recording.
// Displays a simple bar-based waveform from audio level data.

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
      className="flex items-center gap-1 h-8"
      role="status"
      aria-label={`Audio level: ${Math.round(level * 100)}%`}
    >
      {Array.from({ length: bars }, (_, i) => {
        // Each bar has a slightly different height based on level + variation
        const variation = Math.sin((i + Date.now() / 200) * 0.8) * 0.3;
        const barLevel = Math.max(0.1, Math.min(1, level + variation));
        const heightPercent = active ? barLevel * 100 : 10;

        return (
          <div
            key={i}
            className="w-1 rounded-full bg-semblance-primary transition-all duration-100"
            style={{ height: `${heightPercent}%`, minHeight: '4px' }}
          />
        );
      })}
    </div>
  );
}
