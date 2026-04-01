import { useRef, useEffect, useCallback, useState } from 'react';
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
  cloud,
}: {
  item: NavItem;
  activeId?: string;
  collapsed: boolean;
  onNavigate?: (id: string) => void;
  cloud?: boolean;
}) {
  if (item.hidden) return null;
  return (
    <button
      key={item.id}
      type="button"
      className={`desktop-sidebar__item ${activeId === item.id ? 'desktop-sidebar__item--active' : ''} ${cloud ? 'desktop-sidebar__item--cloud' : ''} ${item.className || ''}`}
      onClick={() => onNavigate?.(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <span className="desktop-sidebar__icon">{item.icon}</span>
      {!collapsed && <span className="desktop-sidebar__item-label">{item.label}</span>}
    </button>
  );
}

function CollapseToggle({ collapsed, onClick }: { collapsed: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="desktop-sidebar__collapse-btn"
      onClick={onClick}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {collapsed
          ? <path d="m6 15 6-6 6 6" />
          : <path d="m6 9 6 6 6-6" />
        }
      </svg>
    </button>
  );
}

export function DesktopSidebar({
  items,
  activeId,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  footer,
  bottomItems,
  className = '',
}: DesktopSidebarProps) {
  const rootClass = `desktop-sidebar surface-void opal-wireframe ${collapsed ? 'desktop-sidebar--collapsed' : ''} ${className}`.trim();

  const sections = isSections(items);

  // Detect scrolling to fade section labels
  const navRef = useRef<HTMLDivElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleScroll = useCallback(() => {
    setScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), 600);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <nav className={rootClass} data-identity="sovereignty">
      {/* Frosted glass brand header — sits over scroll area */}
      <div className="desktop-sidebar__brand-glass">
        <div className="desktop-sidebar__brand">
          <LogoMark size={collapsed ? 40 : 80} />
          {!collapsed && <Wordmark size="nav" className="desktop-sidebar__wordmark" />}
        </div>
        {onToggleCollapse && (
          <CollapseToggle collapsed={collapsed} onClick={onToggleCollapse} />
        )}
      </div>

      {/* Scrollable nav — items scroll behind the frosted brand */}
      <div ref={navRef} className={`desktop-sidebar__nav${scrolling ? ' desktop-sidebar__nav--scrolling' : ''}`}>
        {sections ? (
          (items as NavSection[]).map((section, idx) => (
            <div key={section.label} className={`desktop-sidebar__section ${idx > 0 ? 'desktop-sidebar__section--gap' : ''}`}>
              {!collapsed && (
                <div className={`desktop-sidebar__section-label${section.label === 'CLOUD CONNECTIVITY' ? ' desktop-sidebar__section-label--cloud' : ''}`}>{section.label}</div>
              )}
              {section.items.map(item => (
                <NavItemButton key={item.id} item={item} activeId={activeId} collapsed={collapsed} onNavigate={onNavigate} cloud={section.label === 'CLOUD CONNECTIVITY'} />
              ))}
            </div>
          ))
        ) : (
          (items as NavItem[]).map(item => (
            <NavItemButton key={item.id} item={item} activeId={activeId} collapsed={collapsed} onNavigate={onNavigate} />
          ))
        )}
      </div>

      {/* Frosted glass footer — mirrors brand glass at top */}
      <div className="desktop-sidebar__footer-glass">
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
      </div>
    </nav>
  );
}
