import type { ReactNode } from 'react';

export type ToastVariant = 'info' | 'success' | 'attention' | 'action';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ReactNode;
}

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}
