import { Card } from '@semblance/ui';

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

const TYPE_COLORS: Record<string, string> = {
  meeting_prep: 'bg-semblance-primary/10 text-semblance-primary',
  follow_up: 'bg-semblance-attention/10 text-semblance-attention',
  deadline: 'bg-semblance-attention/10 text-semblance-attention',
  conflict: 'bg-semblance-error/10 text-semblance-error',
};

export function InsightCard({ insight, onExecuteSuggestion, onDismiss, onExpand }: InsightCardProps) {
  return (
    <Card className="p-3 border-l-[3px] border-l-semblance-primary">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${TYPE_COLORS[insight.type] ?? 'bg-semblance-surface-2 text-semblance-text-secondary'}`}>
          {TYPE_ICONS[insight.type] ?? '?'}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <button
              type="button"
              onClick={onExpand}
              className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark text-left hover:underline truncate"
            >
              {insight.title}
            </button>
            {insight.priority === 'high' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-semblance-attention/10 text-semblance-attention flex-shrink-0">
                urgent
              </span>
            )}
          </div>

          <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-0.5">
            {insight.summary}
          </p>

          {/* Action row */}
          <div className="flex gap-2 mt-2">
            {insight.suggestedAction && (
              <button
                type="button"
                onClick={onExecuteSuggestion}
                className="text-xs px-2.5 py-1 rounded bg-semblance-primary text-white hover:opacity-90 transition-opacity duration-fast"
              >
                {insight.suggestedAction.description}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs px-2.5 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
