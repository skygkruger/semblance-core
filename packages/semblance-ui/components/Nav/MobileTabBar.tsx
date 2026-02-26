import './MobileTabBar.css';

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface MobileTabBarProps {
  items: TabItem[];
  activeId?: string;
  onNavigate?: (id: string) => void;
  className?: string;
}

export function MobileTabBar({
  items,
  activeId,
  onNavigate,
  className = '',
}: MobileTabBarProps) {
  return (
    <nav className={`mobile-tab-bar opal-surface ${className}`.trim()}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={`mobile-tab-bar__item ${activeId === item.id ? 'mobile-tab-bar__item--active' : ''}`}
          onClick={() => onNavigate?.(item.id)}
        >
          {item.icon}
          <span className="mobile-tab-bar__label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
