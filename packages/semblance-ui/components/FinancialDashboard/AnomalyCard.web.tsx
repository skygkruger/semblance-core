import type { SpendingAnomaly } from './FinancialDashboard.types';
import './AnomalyCard.css';

interface AnomalyCardProps {
  anomaly: SpendingAnomaly;
  onDismiss: (id: string) => void;
}

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export function AnomalyCard({ anomaly, onDismiss }: AnomalyCardProps) {
  return (
    <div className={`anomaly-card anomaly-card--${anomaly.severity}`} role="alert">
      <div className="anomaly-card__header">
        <h4 className="anomaly-card__title">{anomaly.title}</h4>
        <span className="anomaly-card__amount" aria-label={`Amount: ${formatCurrency(anomaly.amount)}`}>
          {formatCurrency(anomaly.amount)}
        </span>
      </div>
      <p className="anomaly-card__description">{anomaly.description}</p>
      <div className="anomaly-card__footer">
        <span className="anomaly-card__merchant">{anomaly.merchantName}</span>
        <button
          type="button"
          className="anomaly-card__dismiss"
          onClick={() => onDismiss(anomaly.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
