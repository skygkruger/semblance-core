import type { ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface DesktopSidebarProps {
  items: NavItem[];
  activeId?: string;
  collapsed?: boolean;
  onNavigate?: (id: string) => void;
  footer?: ReactNode;
  className?: string;
}
