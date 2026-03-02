import type { ReactNode } from 'react';

export type CardVariant = 'default' | 'elevated' | 'briefing';

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  hoverable?: boolean;
  onPress?: () => void;
  onClick?: () => void;
  className?: string;
}
