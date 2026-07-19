import {
  budgetUsagePercent,
  formatBudgetCents,
  type CloudBudgetPanelProps,
} from './CloudBudgetPanel.types';
import './CloudBudgetPanel.css';

const COLORS = {
  background: '#0B0E11',
  veridian: '#6ECFA3',
  caution: '#B09A8A',
  critical: '#B07A8A',
  silver: '#8593A4',
  text: '#A8B4C0',
  muted: '#5E6B7C',
};

export function CloudBudgetPanel({
  limits,
  summary,
  onLimitsChange,
  onCloudDisableChange,
}: CloudBudgetPanelProps) {
  const dailyPercent = budgetUsagePercent(summary.dailySpentCents, limits.dailyHardLimitCents);
  const monthlyPercent = budgetUsagePercent(summary.monthlySpentCents, limits.monthlyHardLimitCents);
  const hasAlerts = summary.alerts.length > 0;

  return (
    <div className="cloud-budget-panel" data-testid="cloud-budget-panel">
      <div className="cloud-budget-panel__header">
        <span className="cloud-budget-panel__title">Confidential compute budget</span>
        <span
          className="cloud-budget-panel__status"
          style={{ color: limits.cloudDisabled ? COLORS.critical : COLORS.veridian }}
        >
          {limits.cloudDisabled ? 'CLOUD DISABLED' : 'ACTIVE'}
        </span>
      </div>

      <label className="cloud-budget-panel__kill-switch">
        <input
          type="checkbox"
          checked={limits.cloudDisabled}
          onChange={(event) => onCloudDisableChange(event.target.checked)}
          style={{ accentColor: COLORS.veridian }}
        />
        <span>Immediately disable confidential cloud transport on this device</span>
      </label>

      {hasAlerts && (
        <div className="cloud-budget-panel__alerts">
          {summary.alerts.map((alert) => (
            <div
              key={alert}
              className="cloud-budget-panel__alert"
              style={{ color: COLORS.caution, borderColor: 'rgba(176, 154, 138, 0.35)' }}
            >
              {alert}
            </div>
          ))}
        </div>
      )}

      <div className="cloud-budget-panel__meters">
        <div className="cloud-budget-panel__meter">
          <div className="cloud-budget-panel__meter-label">
            <span>Daily spend</span>
            <span style={{ color: COLORS.silver }}>
              {formatBudgetCents(summary.dailySpentCents)} / {formatBudgetCents(limits.dailyHardLimitCents)}
            </span>
          </div>
          <div className="cloud-budget-panel__meter-track">
            <div
              className="cloud-budget-panel__meter-fill"
              style={{
                width: `${dailyPercent}%`,
                backgroundColor: dailyPercent >= limits.alertThresholdPercent ? COLORS.caution : COLORS.veridian,
              }}
            />
          </div>
        </div>

        <div className="cloud-budget-panel__meter">
          <div className="cloud-budget-panel__meter-label">
            <span>Monthly spend</span>
            <span style={{ color: COLORS.silver }}>
              {formatBudgetCents(summary.monthlySpentCents)} / {formatBudgetCents(limits.monthlyHardLimitCents)}
            </span>
          </div>
          <div className="cloud-budget-panel__meter-track">
            <div
              className="cloud-budget-panel__meter-fill"
              style={{
                width: `${monthlyPercent}%`,
                backgroundColor: monthlyPercent >= limits.alertThresholdPercent ? COLORS.caution : COLORS.veridian,
              }}
            />
          </div>
        </div>
      </div>

      <div className="cloud-budget-panel__limits">
        <label className="cloud-budget-panel__field">
          <span>Per-task estimate (¢)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={limits.perTaskEstimateCents}
            onChange={(event) => onLimitsChange({
              perTaskEstimateCents: Math.max(0, Number(event.target.value) || 0),
            })}
          />
        </label>

        <label className="cloud-budget-panel__field">
          <span>Daily hard limit (¢)</span>
          <input
            type="number"
            min={0}
            step={50}
            value={limits.dailyHardLimitCents}
            onChange={(event) => onLimitsChange({
              dailyHardLimitCents: Math.max(0, Number(event.target.value) || 0),
            })}
          />
        </label>

        <label className="cloud-budget-panel__field">
          <span>Monthly hard limit (¢)</span>
          <input
            type="number"
            min={0}
            step={100}
            value={limits.monthlyHardLimitCents}
            onChange={(event) => onLimitsChange({
              monthlyHardLimitCents: Math.max(0, Number(event.target.value) || 0),
            })}
          />
        </label>

        <label className="cloud-budget-panel__field">
          <span>Alert threshold (%)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={limits.alertThresholdPercent}
            onChange={(event) => onLimitsChange({
              alertThresholdPercent: Math.min(100, Math.max(1, Number(event.target.value) || 80)),
            })}
          />
        </label>
      </div>

      <p className="cloud-budget-panel__note" style={{ color: COLORS.muted }}>
        Budget checks run locally before any confidential disclosure. Insufficient vouchers or exceeded limits fail closed.
      </p>
    </div>
  );
}
