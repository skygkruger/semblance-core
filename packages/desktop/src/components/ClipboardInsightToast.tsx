// ClipboardInsightToast — Toast notification for recognized clipboard patterns.
// Auto-dismisses after 8s.

import { useEffect, useState } from 'react';
import './ClipboardInsightToast.css';

interface ClipboardInsightToastProps {
  patternDescription: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function ClipboardInsightToast({
  patternDescription,
  actionLabel,
  onAction,
  onDismiss,
  autoDismissMs = 8000,
}: ClipboardInsightToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <div role="status" className="clipboard-toast">
      <p className="clipboard-toast__text">{patternDescription}</p>
      <button
        type="button"
        onClick={() => { onAction(); setVisible(false); }}
        className="clipboard-toast__action"
      >
        {actionLabel}
      </button>
      <button
        type="button"
        onClick={() => { setVisible(false); onDismiss(); }}
        className="clipboard-toast__dismiss"
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
}
