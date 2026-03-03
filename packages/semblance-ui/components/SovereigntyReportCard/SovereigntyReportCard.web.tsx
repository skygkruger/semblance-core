import type { SovereigntyReportCardProps } from './SovereigntyReportCard.types';
import './SovereigntyReportCard.css';

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
  if (loading) {
    return (
      <div className={`sovereignty-report ${className}`.trim()}>
        <div className="sovereignty-report__loading">Generating sovereignty report...</div>
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
    <div className={`sovereignty-report ${className}`.trim()}>
      {/* Header */}
      <div className="sovereignty-report__header">
        <h2 className="sovereignty-report__title">Sovereignty Report</h2>
        <span className="sovereignty-report__period">
          {periodStart.slice(0, 10)} — {periodEnd.slice(0, 10)}
        </span>
        <span className="sovereignty-report__device">
          Generated {generatedAt.slice(0, 19).replace('T', ' ')} &middot; {deviceId}
        </span>
      </div>

      <div className="sovereignty-report__divider" />

      {/* Knowledge Summary */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">Knowledge Summary</h3>
        {Object.entries(knowledgeSummary).map(([source, count]) => (
          <div key={source} className="sovereignty-report__row">
            <span className="sovereignty-report__row-label">
              {source.charAt(0).toUpperCase() + source.slice(1)}
            </span>
            <span className="sovereignty-report__row-value">{count}</span>
          </div>
        ))}
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">Total</span>
          <span className="sovereignty-report__row-value sovereignty-report__row-value--veridian">
            {totalKnowledge}
          </span>
        </div>
      </div>

      {/* Autonomous Actions */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">Autonomous Actions</h3>
        {Object.entries(autonomousActions.byDomain).map(([domain, count]) => (
          <div key={domain} className="sovereignty-report__row">
            <span className="sovereignty-report__row-label">{domain}</span>
            <span className="sovereignty-report__row-value">{count}</span>
          </div>
        ))}
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">Total</span>
          <span className="sovereignty-report__row-value">{totalActions}</span>
        </div>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">Time Saved</span>
          <span className="sovereignty-report__row-value sovereignty-report__row-value--veridian">
            {timeSavedFormatted}
          </span>
        </div>
      </div>

      {/* Hard Limits */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">Hard Limits Enforced</h3>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">Actions declined</span>
          <span className="sovereignty-report__row-value">{hardLimitsEnforced}</span>
        </div>
      </div>

      {/* Audit Chain */}
      <div className="sovereignty-report__section">
        <h3 className="sovereignty-report__section-title">Audit Chain Status</h3>
        <span
          className={`sovereignty-report__chain-badge ${
            auditChainStatus.verified
              ? 'sovereignty-report__chain-badge--verified'
              : 'sovereignty-report__chain-badge--broken'
          }`}
        >
          {auditChainStatus.verified ? 'Chain Verified' : 'Chain Break Detected'}
        </span>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">Entries</span>
          <span className="sovereignty-report__row-value">{auditChainStatus.totalEntries}</span>
        </div>
        <div className="sovereignty-report__row">
          <span className="sovereignty-report__row-label">Days covered</span>
          <span className="sovereignty-report__row-value">{auditChainStatus.daysCovered}</span>
        </div>
      </div>

      {/* Signature */}
      {publicKeyFingerprint && (
        <div className="sovereignty-report__section">
          <h3 className="sovereignty-report__section-title">Signature</h3>
          {signatureVerified !== undefined && (
            <span
              className={`sovereignty-report__chain-badge ${
                signatureVerified
                  ? 'sovereignty-report__chain-badge--verified'
                  : 'sovereignty-report__chain-badge--broken'
              }`}
            >
              {signatureVerified ? 'Signature Valid' : 'Signature Invalid'}
            </span>
          )}
          <span className="sovereignty-report__fingerprint">{publicKeyFingerprint}</span>
        </div>
      )}

      {/* Comparison Statement */}
      {comparisonStatement && (
        <div className="sovereignty-report__section">
          <h3 className="sovereignty-report__section-title">Comparison Statement</h3>
          <p className="sovereignty-report__comparison">{comparisonStatement}</p>
        </div>
      )}

      {/* Export */}
      {onExportPDF && (
        <button
          type="button"
          className="sovereignty-report__export-btn"
          onClick={onExportPDF}
        >
          Export PDF
        </button>
      )}
    </div>
  );
}
