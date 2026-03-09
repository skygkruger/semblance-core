import { Wordmark } from '../Wordmark/Wordmark';
import { LogoMark } from '../LogoMark/LogoMark';
import { PrivacyBadge } from '../PrivacyBadge/PrivacyBadge';
import type { NavItem, NavSection, DesktopSidebarProps } from './DesktopSidebar.types';
import './DesktopSidebar.css';

/** Type guard: is the items array a NavSection[] or NavItem[]? */
function isSections(items: NavItem[] | NavSection[]): items is NavSection[] {
  return items.length > 0 && 'items' in items[0]!;
}

function NavItemButton({
  item,
  activeId,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  activeId?: string;
  collapsed: boolean;
  onNavigate?: (id: string) => void;
}) {
  if (item.hidden) return null;
  return (
    <button
      key={item.id}
      type="button"
      className={`desktop-sidebar__item ${activeId === item.id ? 'desktop-sidebar__item--active' : ''} ${item.className || ''}`}
      onClick={() => onNavigate?.(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <span className="desktop-sidebar__icon">{item.icon}</span>
      {!collapsed && <span className="desktop-sidebar__item-label">{item.label}</span>}
    </button>
  );
}

export function DesktopSidebar({
  items,
  activeId,
  collapsed = false,
  onNavigate,
  footer,
  bottomItems,
  className = '',
}: DesktopSidebarProps) {
  const rootClass = `desktop-sidebar surface-void opal-wireframe ${collapsed ? 'desktop-sidebar--collapsed' : ''} ${className}`.trim();

  const sections = isSections(items);

  return (
    <nav className={rootClass} data-identity="sovereignty">
      <div className="desktop-sidebar__brand">
        <LogoMark size={collapsed ? 40 : 80} />
        {!collapsed && <Wordmark size="nav" className="desktop-sidebar__wordmark" />}
      </div>

      <div className="desktop-sidebar__nav">
        {sections ? (
          (items as NavSection[]).map((section, idx) => (
            <div key={section.label} className={`desktop-sidebar__section ${idx > 0 ? 'desktop-sidebar__section--gap' : ''}`}>
              {!collapsed && (
                <div className="desktop-sidebar__section-label">{section.label}</div>
              )}
              {section.items.map(item => (
                <NavItemButton key={item.id} item={item} activeId={activeId} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          ))
        ) : (
          (items as NavItem[]).map(item => (
            <NavItemButton key={item.id} item={item} activeId={activeId} collapsed={collapsed} onNavigate={onNavigate} />
          ))
        )}
      </div>

      {bottomItems && bottomItems.length > 0 && (
        <div className="desktop-sidebar__bottom-items">
          {bottomItems.map(item => (
            <NavItemButton key={item.id} item={item} activeId={activeId} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      <div className="desktop-sidebar__footer">
        {footer ?? <PrivacyBadge status="active" />}
      </div>
    </nav>
  );
}
