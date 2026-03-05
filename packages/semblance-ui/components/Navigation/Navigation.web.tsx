import { useTranslation } from 'react-i18next';
import type { NavigationProps } from './Navigation.types';
import './Navigation.css';

export function Navigation({ items, activeId, onNavigate, collapsed = false, footer, className = '' }: NavigationProps) {
  const { t } = useTranslation();

  const rootClass = `nav-sidebar surface-void opal-wireframe ${collapsed ? 'nav-sidebar--collapsed' : ''} ${className}`.trim();

  return (
    <nav className={rootClass} data-identity="sovereignty" aria-label={t('a11y.main_navigation')}>
      <ul className="nav-sidebar__list" role="list">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`nav-sidebar__item ${isActive ? 'nav-sidebar__item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="nav-sidebar__icon">{item.icon}</span>
                {!collapsed && <span className="nav-sidebar__label">{item.label}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {footer && <div className="nav-sidebar__footer">{footer}</div>}
    </nav>
  );
}
