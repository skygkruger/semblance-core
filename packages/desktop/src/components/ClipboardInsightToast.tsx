// ClipboardInsightToast — Toast notification for recognized clipboard patterns.
// Auto-dismisses after 8s.

import { useEffect, useState } from 'react';
import { Button } from '@semblance/ui';
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
      <Button variant="opal" size="sm" onClick={() => { onAction(); setVisible(false); }}>
        <span className="btn__text">{actionLabel}</span>
      </Button>
      <Button variant="dismiss" size="sm" onClick={() => { setVisible(false); onDismiss(); }} aria-label="Dismiss">
        Dismiss
      </Button>
    </div>
  );
}
