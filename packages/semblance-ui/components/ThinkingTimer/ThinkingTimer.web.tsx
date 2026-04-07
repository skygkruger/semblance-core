import { useState, useEffect, useRef } from 'react';
import './ThinkingTimer.css';

interface ThinkingTimerProps {
  /** Contextual label: "Thinking...", "Searching emails...", etc. */
  label?: string;
  /** Called when user clicks Stop */
  onCancel?: () => void;
}

export function ThinkingTimer({ label = 'Thinking...', onCancel }: ThinkingTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset timer when label changes (new phase of work)
  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
  }, [label]);

  return (
    <div className="thinking-timer" data-testid="thinking-timer">
      <span className="thinking-timer__cursor" />
      <span className="thinking-timer__label">{label}</span>
      <span className="thinking-timer__elapsed">{elapsed}s</span>
      {onCancel && (
        <button
          type="button"
          className="thinking-timer__stop"
          onClick={onCancel}
          data-testid="thinking-timer-stop"
        >
          Stop
        </button>
      )}
    </div>
  );
}
