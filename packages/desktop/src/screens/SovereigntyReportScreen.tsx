import { useState, useEffect, useCallback } from 'react';
import { SovereigntyReportCard } from '@semblance/ui';
import { useAppState } from '../state/AppState';
import { generateSovereigntyReport, renderSovereigntyReportPDF } from '../ipc/commands';
import type { SovereigntyReportData } from '../ipc/types';
import { StaticBracket } from '../components/StaticBracket';

export function SovereigntyReportScreen() {
  const state = useAppState();
  const { knowledgeStats, privacyStatus } = state;
  const [report, setReport] = useState<SovereigntyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  const now = new Date();
  const periodEnd = now.toISOString().split('T')[0]!;
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  // Fetch real report data on mount and when period changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    generateSovereigntyReport(periodStart, periodEnd)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Report generation failed'))
      .finally(() => setLoading(false));
  }, [periodStart, periodEnd]);

  const handleExportPDF = useCallback(async () => {
    try {
      const reportData = JSON.stringify(report ?? { periodStart, periodEnd });
      const { pdfBase64 } = await renderSovereigntyReportPDF(reportData);
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `sovereignty-report-${periodEnd}.pdf`;
      link.click();
    } catch (err) {
      console.error('[SovereigntyReportScreen] PDF export failed:', err);
    }
  }, [periodStart, periodEnd, report]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">Generating sovereignty report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-scroll">
        <div className="page-layout" style={{ textAlign: 'center', paddingTop: 64 }}>
          <p style={{ color: '#B07A8A', fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.04em', marginBottom: 16 }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => { setError(null); setLoading(true); generateSovereigntyReport(periodStart, periodEnd).then(setReport).catch((err) => setError(err instanceof Error ? err.message : 'Report generation failed')).finally(() => setLoading(false)); }}
            style={{
              padding: '8px 20px', background: 'rgba(110,207,163,0.1)',
              border: '1px solid rgba(110,207,163,0.3)', borderRadius: 8,
              color: '#6ECFA3', fontFamily: "'DM Mono', monospace",
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
    <div className="page-layout">
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[7, 30, 90, 365].map(days => {
          const isActive = periodDays === days;
          const label = days === 7 ? '7 days' : days === 30 ? '30 days' : days === 90 ? '90 days' : '1 year';
          return (
            <button
              key={days}
              type="button"
              onClick={() => setPeriodDays(days)}
              className="btn btn--opal btn--sm"
              style={isActive ? {
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.04em',
                borderColor: 'rgba(110, 207, 163, 0.45)',
                boxShadow: '0 0 12px rgba(110, 207, 163, 0.18), inset 0 0 8px rgba(110, 207, 163, 0.08)',
              } : {
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.04em',
              }}
            >
              <span className="btn__text">{label}</span>
            </button>
          );
        })}
      </div>

      <StaticBracket>
      <SovereigntyReportCard
        periodStart={periodStart}
        periodEnd={periodEnd}
        generatedAt={report?.generatedAt ?? now.toISOString()}
        deviceId={report?.deviceId ?? `${navigator.userAgent.includes('Windows') ? 'windows' : 'desktop'}-local`}
        knowledgeSummary={{
          documents: report?.knowledgeSummary
            ? Object.values(report.knowledgeSummary).reduce((sum, n) => sum + (n as number), 0)
            : knowledgeStats.documentCount,
          chunks: knowledgeStats.chunkCount,
        }}
        autonomousActions={{
          byDomain: report?.autonomousActions?.byDomain ?? {},
          totalTimeSavedSeconds: report?.autonomousActions?.totalTimeSavedSeconds ?? 0,
        }}
        hardLimitsEnforced={report?.hardLimitsEnforced ?? 0}
        auditChainStatus={{
          verified: report?.auditChainStatus?.verified ?? (privacyStatus.allLocal && !privacyStatus.anomalyDetected),
          totalEntries: report?.auditChainStatus?.totalEntries ?? 0,
          daysCovered: report?.auditChainStatus?.daysCovered ?? 0,
        }}
        signatureVerified={!!report?.signature?.signatureHex}
        publicKeyFingerprint={report?.signature?.publicKeyFingerprint}
        comparisonStatement={report?.comparisonStatement}
        onExportPDF={handleExportPDF}
      />
      </StaticBracket>
    </div>
    </div>
  );
}
