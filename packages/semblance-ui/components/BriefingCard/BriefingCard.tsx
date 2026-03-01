import { useState, useEffect } from 'react';
import { FoundingMemberBadge } from '../FoundingMemberBadge/FoundingMemberBadge';
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
  userName?: string;
  isFoundingMember?: boolean;
  foundingSeat?: number;
  className?: string;
}

const DOT_COLORS: Record<BriefingItemType, string> = {
  action:  '#6ECFA3',
  pending: '#C9A85C',
  insight: '#8593A4',
};

function formatBriefDate(): string {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  let period = 'Good morning';
  if (hour >= 12 && hour < 17) period = 'Good afternoon';
  else if (hour >= 17) period = 'Good evening';

  if (name) return `${period}, ${name}.`;
  return `${period}.`;
}

export function BriefingCard({
  title = 'Morning Brief',
  timestamp,
  items,
  userName,
  isFoundingMember = false,
  foundingSeat,
  className = '',
}: BriefingCardProps) {
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    console.log('[BriefingCard] mounted');
    const timer = setTimeout(() => setAnimating(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`briefing-card opal-surface ${className}`.trim()}
      data-animating={animating ? 'true' : undefined}
    >
      {/* Header region with gradient */}
      <div className="briefing-card__header-region">
        <div className="briefing-card__date-row">
          <span className="briefing-card__date">{formatBriefDate()}</span>
          {isFoundingMember && foundingSeat != null && (
            <FoundingMemberBadge seat={foundingSeat} variant="inline" />
          )}
        </div>
        <h2 className="briefing-card__greeting">{getGreeting(userName)}</h2>
      </div>

      <div className="briefing-card__divider" />

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
