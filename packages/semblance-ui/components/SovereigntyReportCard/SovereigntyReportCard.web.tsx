import { useTranslation } from 'react-i18next';
import type { SovereigntyReportCardProps } from './SovereigntyReportCard.types';
import './SovereigntyReportCard.css';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SovereigntyReportCard({
  periodStart,
  periodEnd,
  generatedAt,
  deviceId,
  knowledgeSummary,
  autonomousActions,
  hardLimitsEnforced,
  auditChainStatus,
  signatureVerified,
  publicKeyFingerprint,
  comparisonStatement,
  onExportPDF,
  loading = false,
  className = '',
}: SovereigntyReportCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className={`sovereignty-report opal-surface ${className}`.trim()}>
        <div className="sovereignty-report__loading">
          {t('sovereignty.loading', { defaultValue: 'Generating sovereignty report...' })}
        </div>
      </div>
    );
  }

  const totalKnowledge = Object.values(knowledgeSummary).reduce((a, b) => a + b, 0);
  const totalActions = Object.values(autonomousActions.byDomain).reduce((a, b) => a + b, 0);
  const timeSavedMinutes = Math.round(autonomousActions.totalTimeSavedSeconds / 60);
  const hours = Math.floor(timeSavedMinutes / 60);
  const mins = timeSavedMinutes % 60;
  const timeSavedFormatted = hours > 0 ? `${hours}h ${mins}m` : `${timeSavedMinutes}m`;

  return (
    <div className={`sovereignty-report opal-surface ${className}`.trim()}>
      {/* Left bar — real element so opal-surface ::after wireframe is preserved */}
      <div className="sovereignty-report__left-bar" />

      {/* Header — centered */}
      <div className="sovereignty-report__header">
        <span className="sovereignty-report__period">
          {periodStart.slice(0, 10)} &mdash; {periodEnd.slice(0, 10)}
        </span>
        <h2 className="sovereignty-report__title">
          {t('sovereignty.title', { defaultValue: 'Sovereignty Report' })}
        </h2>
        <span className="sovereignty-report__device">
          {t('sovereignty.generated', {
            datetime: generatedAt.slice(0, 19).replace('T', ' '),
            device: deviceId,
            defaultValue: 'Generated {{datetime}} \u00b7 {{device}}',
          })}
        </span>
      </div>

      <div className="sovereignty-report__divider" />

      {/* Knowledge Summary */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">
          {t('sovereignty.knowledge_summary', { defaultValue: 'Knowledge Summary' })}
        </h3>
        {Object.entries(knowledgeSummary).map(([source, count]) => (
          <div key={source} className="sovereignty-report__row">
            <span className="sovereignty-report__row-label">{capitalize(source)}</span>
            <span className="sovereignty-report__row-value">{count}</span>
          </div>
        ))}
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">
            {t('sovereignty.total', { defaultValue: 'Total' })}
          </span>
          <span className="sovereignty-report__row-value sovereignty-report__row-value--veridian">
            {totalKnowledge}
          </span>
        </div>
      </div>

      {/* Autonomous Actions */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">
          {t('sovereignty.autonomous_actions', { defaultValue: 'Autonomous Actions' })}
        </h3>
        {Object.entries(autonomousActions.byDomain).map(([domain, count]) => (
          <div key={domain} className="sovereignty-report__row">
            <span className="sovereignty-report__row-label">{capitalize(domain)}</span>
            <span className="sovereignty-report__row-value">{count}</span>
          </div>
        ))}
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">
            {t('sovereignty.total', { defaultValue: 'Total' })}
          </span>
          <span className="sovereignty-report__row-value">{totalActions}</span>
        </div>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">
            {t('sovereignty.time_saved', { defaultValue: 'Time Saved' })}
          </span>
          <span className="sovereignty-report__row-value sovereignty-report__row-value--veridian">
            {timeSavedFormatted}
          </span>
        </div>
      </div>

      {/* Hard Limits */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">
          {t('sovereignty.hard_limits', { defaultValue: 'Hard Limits Enforced' })}
        </h3>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">
            {t('sovereignty.actions_declined', { defaultValue: 'Actions declined' })}
          </span>
          <span className="sovereignty-report__row-value">{hardLimitsEnforced}</span>
        </div>
      </div>

      {/* Audit Chain — status as aligned row */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">
          {t('sovereignty.audit_chain', { defaultValue: 'Audit Chain Status' })}
        </h3>
        <div className="sovereignty-report__status-row">
          <span className="sovereignty-report__status-label">
            {t('sovereignty.chain_status', { defaultValue: 'Status' })}
          </span>
          <span
            className={`sovereignty-report__status-value ${
              auditChainStatus.verified
                ? 'sovereignty-report__status-value--verified'
                : 'sovereignty-report__status-value--broken'
            }`}
          >
            {auditChainStatus.verified
              ? t('sovereignty.chain_verified', { defaultValue: 'Chain Verified' })
              : t('sovereignty.chain_broken', { defaultValue: 'Chain Break Detected' })}
          </span>
        </div>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">
            {t('sovereignty.entries', { defaultValue: 'Entries' })}
          </span>
          <span className="sovereignty-report__row-value">{auditChainStatus.totalEntries}</span>
        </div>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">
            {t('sovereignty.days_covered', { defaultValue: 'Days covered' })}
          </span>
          <span className="sovereignty-report__row-value">{auditChainStatus.daysCovered}</span>
        </div>
      </div>

      {/* Signature — status as aligned row */}
      {publicKeyFingerprint && (
        <div className="sovereignty-report__section">
          <h3 className="sovereignty-report__section-title">
            {t('sovereignty.signature', { defaultValue: 'Signature' })}
          </h3>
          {signatureVerified !== undefined && (
            <div className="sovereignty-report__status-row">
              <span className="sovereignty-report__status-label">
                {t('sovereignty.sig_status', { defaultValue: 'Status' })}
              </span>
              <span
                className={`sovereignty-report__status-value ${
                  signatureVerified
                    ? 'sovereignty-report__status-value--verified'
                    : 'sovereignty-report__status-value--broken'
                }`}
              >
                {signatureVerified
                  ? t('sovereignty.sig_valid', { defaultValue: 'Signature Valid' })
                  : t('sovereignty.sig_invalid', { defaultValue: 'Signature Invalid' })}
              </span>
            </div>
          )}
          <div className="sovereignty-report__row">
            <span className="sovereignty-report__row-label">
              {t('sovereignty.fingerprint', { defaultValue: 'Fingerprint' })}
            </span>
            <span className="sovereignty-report__fingerprint">{publicKeyFingerprint}</span>
          </div>
        </div>
      )}

      {/* Comparison Statement — in opal content frame */}
      {comparisonStatement && (
        <div className="sovereignty-report__section">
          <h3 className="sovereignty-report__section-title">
            {t('sovereignty.comparison', { defaultValue: 'Comparison Statement' })}
          </h3>
          <div className="sovereignty-report__comparison-frame">
            <p className="sovereignty-report__comparison">{comparisonStatement}</p>
          </div>
        </div>
      )}

      {/* Export — custom opal-sweep button */}
      {onExportPDF && (
        <div className="sovereignty-report__export-wrap">
          <button
            type="button"
            className="sovereignty-report__export-btn"
            onClick={onExportPDF}
          >
            <span className="sovereignty-report__export-text">
              {t('sovereignty.export_pdf', { defaultValue: 'Export PDF' })}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
