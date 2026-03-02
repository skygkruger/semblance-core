import { useState, useEffect } from 'react';
import { FoundingMemberBadge } from '../FoundingMemberBadge/FoundingMemberBadge';
import type { BriefingCardProps } from './BriefingCard.types';
import { DOT_COLORS, formatBriefDate, getGreeting } from './BriefingCard.types';
import './BriefingCard.css';

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
