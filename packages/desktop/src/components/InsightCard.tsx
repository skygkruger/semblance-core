import { Card } from '@semblance/ui';
import './InsightCard.css';

interface ProactiveInsight {
  id: string;
  type: 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict';
  priority: 'high' | 'normal' | 'low';
  title: string;
  summary: string;
  suggestedAction: { actionType: string; payload: Record<string, unknown>; description: string } | null;
  createdAt: string;
}

interface InsightCardProps {
  insight: ProactiveInsight;
  onExecuteSuggestion: () => void;
  onDismiss: () => void;
  onExpand: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  meeting_prep: 'M',
  follow_up: 'F',
  deadline: 'D',
  conflict: '!',
};

export function InsightCard({ insight, onExecuteSuggestion, onDismiss, onExpand }: InsightCardProps) {
  return (
    <Card className="insight-card">
      <div className="insight-card__body">
        <div className={`insight-card__icon insight-card__icon--${insight.type}`}>
          {TYPE_ICONS[insight.type] ?? '?'}
        </div>

        <div className="insight-card__content">
          <div className="insight-card__header">
            <button type="button" onClick={onExpand} className="insight-card__title">
              {insight.title}
            </button>
            {insight.priority === 'high' && (
              <span className="insight-card__urgent">urgent</span>
            )}
          </div>

          <p className="insight-card__summary">{insight.summary}</p>

          <div className="insight-card__actions">
            {insight.suggestedAction && (
              <button
                type="button"
                onClick={onExecuteSuggestion}
                className="insight-card__action-btn insight-card__action-btn--primary"
              >
                {insight.suggestedAction.description}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="insight-card__action-btn insight-card__action-btn--ghost"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
