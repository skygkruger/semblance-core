import type { ReactNode } from 'react';

export type ButtonVariant = 'ghost' | 'solid' | 'subtle' | 'approve' | 'dismiss' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}
