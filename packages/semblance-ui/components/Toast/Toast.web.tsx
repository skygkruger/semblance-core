import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastItem, ToastContainerProps } from './Toast.types';
import './Toast.css';

interface ToastEntryProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

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

  const classes = [
    'toast',
    `toast--${toast.variant}`,
    exiting ? 'toast--exiting' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role="alert">
      <div className="toast__body">
        <p className="toast__message">{toast.message}</p>
        <button
          type="button"
          className="toast__dismiss"
          onClick={handleDismiss}
          aria-label={t('a11y.dismiss_notification')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      {toast.action && <div className="toast__actions">{toast.action}</div>}
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const { t } = useTranslation();

  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      aria-live="polite"
      aria-label={t('a11y.notifications')}
    >
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
