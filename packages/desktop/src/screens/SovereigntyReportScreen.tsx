import { useCallback } from 'react';
import { SovereigntyReportCard } from '@semblance/ui';
import { useAppState } from '../state/AppState';
import { renderSovereigntyReportPDF } from '../ipc/commands';

export function SovereigntyReportScreen() {
  const state = useAppState();
  const { knowledgeStats, privacyStatus } = state;

  const now = new Date();
  const periodEnd = now.toISOString().split('T')[0]!;
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  const handleExportPDF = useCallback(async () => {
    try {
      const reportData = JSON.stringify({ periodStart, periodEnd });
      const { pdfBase64 } = await renderSovereigntyReportPDF(reportData);
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `sovereignty-report-${periodEnd}.pdf`;
      link.click();
    } catch (err) {
      console.error('[SovereigntyReportScreen] PDF export failed:', err);
    }
  }, [periodStart, periodEnd]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <SovereigntyReportCard
        periodStart={periodStart}
        periodEnd={periodEnd}
        generatedAt={now.toISOString()}
        deviceId={`${navigator.userAgent.includes('Windows') ? 'windows' : 'desktop'}-local`}
        knowledgeSummary={{
          documents: knowledgeStats.documentCount,
          chunks: knowledgeStats.chunkCount,
        }}
        autonomousActions={{
          byDomain: {},
          totalTimeSavedSeconds: 0,
        }}
        hardLimitsEnforced={0}
        auditChainStatus={{
          verified: privacyStatus.allLocal && !privacyStatus.anomalyDetected,
          totalEntries: 0,
          daysCovered: 0,
        }}
        onExportPDF={handleExportPDF}
      />
    </div>
  );
}
