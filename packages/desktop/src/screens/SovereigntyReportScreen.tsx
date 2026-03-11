import { useState, useEffect, useCallback } from 'react';
import { SovereigntyReportCard } from '@semblance/ui';
import { useAppState } from '../state/AppState';
import { generateSovereigntyReport, renderSovereigntyReportPDF } from '../ipc/commands';
import type { SovereigntyReportData } from '../ipc/types';

export function SovereigntyReportScreen() {
  const state = useAppState();
  const { knowledgeStats, privacyStatus } = state;
  const [report, setReport] = useState<SovereigntyReportData | null>(null);

  const now = new Date();
  const periodEnd = now.toISOString().split('T')[0]!;
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  // Fetch real report data on mount
  useEffect(() => {
    generateSovereigntyReport(periodStart, periodEnd)
      .then(setReport)
      .catch((err) => console.error('[SovereigntyReportScreen] Failed to load report:', err));
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

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
      <SovereigntyReportCard
        periodStart={periodStart}
        periodEnd={periodEnd}
        generatedAt={report?.generatedAt ?? now.toISOString()}
        deviceId={report?.deviceId ?? `${navigator.userAgent.includes('Windows') ? 'windows' : 'desktop'}-local`}
        knowledgeSummary={{
          documents: report?.knowledgeSummary?.documents ?? knowledgeStats.documentCount,
          chunks: report?.knowledgeSummary?.chunks ?? knowledgeStats.chunkCount,
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
        onExportPDF={handleExportPDF}
      />
    </div>
    </div>
  );
}
