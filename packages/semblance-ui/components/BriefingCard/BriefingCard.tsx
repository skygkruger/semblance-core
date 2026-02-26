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

export function BriefingCard({
  title = 'Morning Brief',
  timestamp,
  items,
  className = '',
}: BriefingCardProps) {
  return (
    <div className={`briefing-card opal-surface ${className}`.trim()}>
      <div className="briefing-card__header">
        <h3 className="briefing-card__title">{title}</h3>
        {timestamp && (
          <span className="briefing-card__timestamp">{timestamp}</span>
        )}
      </div>
      <ul className="briefing-card__items">
        {items.map((item, i) => (
          <li key={i} className="briefing-card__item">
            <span className={`briefing-card__item-dot briefing-card__item-dot--${item.type}`} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
