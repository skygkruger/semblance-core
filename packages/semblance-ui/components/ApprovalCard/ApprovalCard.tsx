import { useState, useEffect } from 'react';
import { Button } from '../Button/Button';
import './ApprovalCard.css';

type RiskLevel = 'low' | 'medium' | 'high';
type ApprovalState = 'pending' | 'approved' | 'dismissed';

interface ApprovalCardProps {
  action: string;
  context: string;
  dataOut?: string[];
  risk?: RiskLevel;
  state?: ApprovalState;
  onApprove?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ApprovalCard({
  action,
  context,
  dataOut = [],
  risk = 'low',
  state = 'pending',
  onApprove,
  onDismiss,
  className = '',
}: ApprovalCardProps) {
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    console.log('[ApprovalCard] mounted');
    const timer = setTimeout(() => setAnimating(false), 700);
    return () => clearTimeout(timer);
  }, []);

  const stateClass = `approval-card--${state}`;
  const opalClass = 'opal-surface';

  return (
    <div
      className={`approval-card ${opalClass} ${stateClass} ${className}`.trim()}
      data-risk={risk}
      data-animating={animating ? 'true' : undefined}
    >
      <div className="approval-card__header">
        <h3 className="approval-card__action">{action}</h3>
        <span className={`approval-card__risk approval-card__risk--${risk}`}>
          {risk}
        </span>
      </div>

      <p className="approval-card__context">{context}</p>

      {dataOut.length > 0 && (
        <>
          <div className="approval-card__divider" />
          <p className="approval-card__data-label">Data leaving device</p>
          <ul className="approval-card__data-list">
            {dataOut.map((item, i) => (
              <li key={i} className="approval-card__data-item">{item}</li>
            ))}
          </ul>
        </>
      )}

      {state === 'pending' && (
        <div className="approval-card__actions">
          <Button variant="approve" size="md" onClick={onApprove}>
            Approve
          </Button>
          <Button variant="subtle" size="md" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
