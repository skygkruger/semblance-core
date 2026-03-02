import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FoundingMemberBadge } from '../FoundingMemberBadge/FoundingMemberBadge';
import type { BriefingCardProps } from './BriefingCard.types';
import { DOT_COLORS } from './BriefingCard.types';
import './BriefingCard.css';

export function BriefingCard({
  title,
  timestamp,
  items,
  userName,
  isFoundingMember = false,
  foundingSeat,
  className = '',
}: BriefingCardProps) {
  const { t } = useTranslation('morning-brief');
  const resolvedTitle = title ?? t('card.default_title');
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    console.log('[BriefingCard] mounted');
    const timer = setTimeout(() => setAnimating(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  // Compute translated date string
  const now = new Date();
  const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const MONTH_KEYS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;
  const briefDate = `${t(`date.days.${DAY_KEYS[now.getDay()]}`)}, ${t(`date.months.${MONTH_KEYS[now.getMonth()]}`)} ${now.getDate()}`;

  // Compute translated greeting
  const hour = now.getHours();
  const greetingPeriodKey = hour >= 17 ? 'evening' : hour >= 12 ? 'afternoon' : 'morning';
  const period = t(`greeting.${greetingPeriodKey}`);
  const greeting = userName
    ? t('greeting.with_name', { period, name: userName })
    : t('greeting.anonymous', { period });

  return (
    <div
      className={`briefing-card opal-surface ${className}`.trim()}
      data-animating={animating ? 'true' : undefined}
    >
      {/* Header region with gradient */}
      <div className="briefing-card__header-region">
        <div className="briefing-card__date-row">
          <span className="briefing-card__date">{briefDate}</span>
          {isFoundingMember && foundingSeat != null && (
            <FoundingMemberBadge seat={foundingSeat} variant="inline" />
          )}
        </div>
        <h2 className="briefing-card__greeting">{greeting}</h2>
      </div>

      <div className="briefing-card__divider" />

      <div className="briefing-card__header">
        <h3 className="briefing-card__title">{resolvedTitle}</h3>
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
