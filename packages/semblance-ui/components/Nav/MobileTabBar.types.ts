import type { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface MobileTabBarProps {
  items: TabItem[];
  activeId?: string;
  onNavigate?: (id: string) => void;
  className?: string;
}
