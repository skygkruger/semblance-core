import { useState, useEffect } from 'react';
import './BriefingCard.css';

type BriefingItemType = 'action' | 'pending' | 'insight';

interface BriefingItem {
  type: BriefingItemType;
  text: string;
}

interface BriefingCardProps {
  title?: string;
  timestamp?: string;
  items: BriefingItem[];
  className?: string;
}

const DOT_COLORS: Record<BriefingItemType, string> = {
  action:  '#6ECFA3',
  pending: '#C9A85C',
  insight: '#8593A4',
};

export function BriefingCard({
  title = 'Morning Brief',
  timestamp,
  items,
  className = '',
}: BriefingCardProps) {
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    console.log('[BriefingCard] mounted');
    const timer = setTimeout(() => setAnimating(false), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`briefing-card opal-surface ${className}`.trim()}
      data-animating={animating ? 'true' : undefined}
    >
      <div className="briefing-card__header">
        <h3 className="briefing-card__title">{title}</h3>
        {timestamp && (
          <span className="briefing-card__timestamp">{timestamp}</span>
        )}
      </div>
      <div className="briefing-card__items">
        {items.map((item, i) => (
          <div key={i} className={`briefing-item briefing-item--${item.type}`}>
            <span
              className="briefing-item__dot"
              style={{ background: DOT_COLORS[item.type] ?? '#8593A4' }}
            />
            <span className="briefing-item__text">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
