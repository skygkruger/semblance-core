import { Wordmark } from '../Wordmark/Wordmark';
import { LogoMark } from '../LogoMark/LogoMark';
import { PrivacyBadge } from '../PrivacyBadge/PrivacyBadge';
import type { DesktopSidebarProps } from './DesktopSidebar.types';
import './DesktopSidebar.css';

export function DesktopSidebar({
  items,
  activeId,
  collapsed = false,
  onNavigate,
  footer,
  className = '',
}: DesktopSidebarProps) {
  const rootClass = collapsed ? 'desktop-sidebar desktop-sidebar--collapsed' : 'desktop-sidebar';

  return (
    <nav className={`${rootClass} opal-surface ${className}`.trim()}>
      <div className="desktop-sidebar__brand">
        <LogoMark size={collapsed ? 40 : 64} />
        {!collapsed && <Wordmark size="nav" className="desktop-sidebar__wordmark" />}
      </div>

      <div className="desktop-sidebar__nav">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className={`desktop-sidebar__item ${activeId === item.id ? 'desktop-sidebar__item--active' : ''}`}
            onClick={() => onNavigate?.(item.id)}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && <span className="desktop-sidebar__item-label">{item.label}</span>}
          </button>
        ))}
      </div>

      <div className="desktop-sidebar__footer">
        {footer ?? <PrivacyBadge status="active" />}
      </div>
    </nav>
  );
}
