import { Wordmark } from '../Wordmark/Wordmark';
import { LogoMark } from '../LogoMark/LogoMark';
import { PrivacyBadge } from '../PrivacyBadge/PrivacyBadge';
import './DesktopSidebar.css';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface DesktopSidebarProps {
  items: NavItem[];
  activeId?: string;
  collapsed?: boolean;
  onNavigate?: (id: string) => void;
  className?: string;
}

export function DesktopSidebar({
  items,
  activeId,
  collapsed = false,
  onNavigate,
  className = '',
}: DesktopSidebarProps) {
  const rootClass = collapsed ? 'desktop-sidebar desktop-sidebar--collapsed' : 'desktop-sidebar';

  return (
    <nav className={`${rootClass} opal-surface ${className}`.trim()}>
      <div className="desktop-sidebar__brand">
        <LogoMark size={collapsed ? 28 : 32} />
        {!collapsed && <Wordmark size="nav" />}
      </div>

      <div className="desktop-sidebar__nav">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className={`desktop-sidebar__item ${activeId === item.id ? 'desktop-sidebar__item--active' : ''}`}
            onClick={() => onNavigate?.(item.id)}
          >
            {item.icon}
            {!collapsed && <span className="desktop-sidebar__item-label">{item.label}</span>}
          </button>
        ))}
      </div>

      <div className="desktop-sidebar__footer">
        <PrivacyBadge status="active" />
      </div>
    </nav>
  );
}
