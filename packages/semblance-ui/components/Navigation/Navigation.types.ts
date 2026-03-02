import type { ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface NavigationProps {
  items: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  collapsed?: boolean;
  footer?: ReactNode;
  className?: string;
}
