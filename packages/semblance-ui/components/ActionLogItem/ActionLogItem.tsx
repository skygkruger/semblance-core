import './ActionLogItem.css';

type ActionStatus = 'completed' | 'pending' | 'failed' | 'undone';

interface ActionLogItemProps {
  status: ActionStatus;
  text: string;
  domain?: string;
  timestamp?: string;
  onUndo?: () => void;
  className?: string;
}

export function ActionLogItem({
  status,
  text,
  domain,
  timestamp,
  onUndo,
  className = '',
}: ActionLogItemProps) {
  return (
    <div className={`action-log-item ${className}`.trim()}>
      <span className={`action-log-item__dot action-log-item__dot--${status}`} />
      <span className="action-log-item__text">{text}</span>
      {domain && <span className="action-log-item__domain">{domain}</span>}
      {timestamp && <span className="action-log-item__time">{timestamp}</span>}
      {onUndo && status === 'completed' && (
        <button type="button" className="action-log-item__undo" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  );
}
