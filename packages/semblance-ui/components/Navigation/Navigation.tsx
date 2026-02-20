import { type ReactNode } from 'react';

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

interface NavigationProps {
  items: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  collapsed?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function Navigation({ items, activeId, onNavigate, collapsed = false, footer, className = '' }: NavigationProps) {
  return (
    <nav
      className={`
        flex flex-col h-full
        bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
        border-r border-semblance-border dark:border-semblance-border-dark
        transition-all duration-normal ease-out
        ${collapsed ? 'w-16' : 'w-60'}
        ${className}
      `.trim()}
      aria-label="Main navigation"
    >
      <div className="flex-1 py-4">
        <ul className="space-y-1 px-2" role="list">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-md
                    text-sm font-medium transition-colors duration-fast
                    focus-visible:outline-none focus-visible:shadow-focus
                    ${isActive
                      ? 'bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary'
                      : 'text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark'
                    }
                  `.trim()}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex-shrink-0 w-5 h-5">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {footer && (
        <div className="px-2 pb-4 mt-auto">
          {footer}
        </div>
      )}
    </nav>
  );
}

export type { NavItem };
