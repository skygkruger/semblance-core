// ClipboardInsightToast — Toast notification for recognized clipboard patterns.
// Shows pattern description + action button. Auto-dismisses after 8s.

import { useEffect, useState } from 'react';

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
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-semblance-surface-2 dark:bg-semblance-surface-2-dark border border-semblance-border dark:border-semblance-border-dark shadow-lg max-w-sm animate-in slide-in-from-right"
    >
      <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark flex-1">
        {patternDescription}
      </p>
      <button
        type="button"
        onClick={() => { onAction(); setVisible(false); }}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-semblance-primary text-white hover:bg-semblance-primary/90 transition-colors"
      >
        {actionLabel}
      </button>
      <button
        type="button"
        onClick={() => { setVisible(false); onDismiss(); }}
        className="text-semblance-text-tertiary hover:text-semblance-text-secondary"
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
}
