import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastItem, ToastVariant, ToastContainerProps } from './Toast.types';

interface ToastEntryProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const variantClasses: Record<ToastVariant, string> = {
  info: 'border-semblance-border dark:border-semblance-border-dark',
  success: 'border-semblance-success/30',
  attention: 'border-semblance-attention/30',
  action: 'border-semblance-primary/30',
};

function ToastEntry({ toast, onDismiss }: ToastEntryProps) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);
  const autoDismiss = toast.variant !== 'action';

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 150);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (!autoDismiss) return;
    const timer = setTimeout(handleDismiss, 5000);
    return () => clearTimeout(timer);
  }, [autoDismiss, handleDismiss]);

  return (
    <div
      className={`
        max-w-[400px] w-full p-4
        bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
        border rounded-lg shadow-lg
        ${variantClasses[toast.variant]}
        ${exiting ? 'animate-toast-exit' : 'animate-toast-enter'}
      `.trim()}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
          {toast.message}
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-semblance-muted hover:text-semblance-text-secondary transition-colors duration-fast p-0.5"
          aria-label={t('a11y.dismiss_notification')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      {toast.action && <div className="mt-3">{toast.action}</div>}
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const { t } = useTranslation();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-label={t('a11y.notifications')}
    >
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

