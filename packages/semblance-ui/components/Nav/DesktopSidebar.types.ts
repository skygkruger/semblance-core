import type { ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Optional custom className for the nav item */
  className?: string;
  /** Whether this item should be hidden */
  hidden?: boolean;
}

export interface NavSection {
  /** Section header text (DM Mono uppercase, --slate3) */
  label: string;
  items: NavItem[];
}

export interface DesktopSidebarProps {
  /** Flat list of items (backward compat) or grouped sections */
  items: NavItem[] | NavSection[];
  activeId?: string;
  collapsed?: boolean;
  onNavigate?: (id: string) => void;
  footer?: ReactNode;
  /** Items pinned to the bottom, above footer */
  bottomItems?: NavItem[];
  className?: string;
}
