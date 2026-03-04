import type { HealthInsight } from './HealthDashboard.types';
import './InsightCard.css';

interface InsightCardProps {
  insight: HealthInsight;
  onDismiss?: (id: string) => void;
}

export function InsightCard({ insight, onDismiss }: InsightCardProps) {
  return (
    <div className="insight-card">
      <div className="insight-card__header">
        <h4 className="insight-card__title">{insight.title}</h4>
        <span className="insight-card__confidence">
          {Math.round(insight.confidence * 100)}%
        </span>
      </div>
      <p className="insight-card__description">{insight.description}</p>
      <span className="insight-card__sources">
        Sources: {insight.dataSources.join(', ')}
      </span>
      {onDismiss && (
        <button
          type="button"
          className="insight-card__dismiss"
          onClick={() => onDismiss(insight.id)}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
