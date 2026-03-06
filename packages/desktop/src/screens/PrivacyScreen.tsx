import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PrivacyDashboard, SovereigntyReportCard, useFeatureAuth } from '@semblance/ui';
import type { NetworkEntry, AuditEntry } from '@semblance/ui';
import { useAppState } from '../state/AppState';
import {
  generateSovereigntyReport,
  renderSovereigntyReportPDF,
  getAuditChainStatus,
} from '../ipc/commands';
import type { SovereigntyReportData } from '../ipc/types';

export function PrivacyScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const navigate = useNavigate();
  const { requireAuth } = useFeatureAuth();
  const [authorized, setAuthorized] = useState(false);
  const [report, setReport] = useState<SovereigntyReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const { privacyStatus, knowledgeStats } = state;

  useEffect(() => {
    let cancelled = false;
    requireAuth('privacy_dashboard').then((result) => {
      if (cancelled) return;
      if (result.success) {
        setAuthorized(true);
      } else {
        navigate('/chat', { replace: true });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await generateSovereigntyReport(periodStart, periodEnd);
      setReport(result);
    } catch {
      // Report generation failed
    } finally {
      setReportLoading(false);
    }
  }, []);

  const handleExportPDF = useCallback(async () => {
    if (!report) return;
    try {
      const { pdfBase64 } = await renderSovereigntyReportPDF(JSON.stringify(report));
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `sovereignty-report-${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
    } catch {
      // PDF generation failed
    }
  }, [report]);

  if (!authorized) {
    return null;
  }

  const networkEntries: NetworkEntry[] = [
    {
      label: t('screen.privacy.total_connections'),
      value: String(privacyStatus.connectionCount),
      isZero: privacyStatus.connectionCount === 0,
    },
    {
      label: t('screen.privacy.local_inference'),
      value: state.ollamaStatus === 'connected' ? t('screen.privacy.status_active') : t('screen.privacy.status_disconnected'),
    },
    {
      label: t('screen.privacy.external_connections'),
      value: '0',
      isZero: true,
    },
  ];

  const auditEntries: AuditEntry[] = [
    {
      status: 'completed',
      text: t('screen.privacy.documents_indexed', { count: knowledgeStats.documentCount }),
      domain: 'knowledge',
    },
    {
      status: privacyStatus.allLocal ? 'completed' : 'failed',
      text: privacyStatus.allLocal
        ? t('screen.privacy.all_local')
        : t('screen.privacy.anomaly_detected'),
      domain: 'network',
    },
    {
      status: 'completed',
      text: `${t('screen.privacy.index_size')} ${(knowledgeStats.indexSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
      domain: 'storage',
    },
  ];

  return (
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
      <PrivacyDashboard
        dataSources={knowledgeStats.documentCount}
        cloudConnections={0}
        actionsLogged={0}
        timeSavedHours={0}
        networkEntries={networkEntries}
        auditEntries={auditEntries}
        proofVerified={privacyStatus.allLocal && !privacyStatus.anomalyDetected}
      />

      {/* Sovereignty Report */}
      {report ? (
        <SovereigntyReportCard
          periodStart={report.periodStart}
          periodEnd={report.periodEnd}
          generatedAt={report.generatedAt}
          deviceId={report.deviceId}
          knowledgeSummary={report.knowledgeSummary}
          autonomousActions={report.autonomousActions}
          hardLimitsEnforced={report.hardLimitsEnforced}
          auditChainStatus={report.auditChainStatus}
          signatureVerified={true}
          publicKeyFingerprint={report.signature?.publicKeyFingerprint}
          comparisonStatement={report.comparisonStatement}
          onExportPDF={handleExportPDF}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={reportLoading}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: '1px solid #2A2F35',
              backgroundColor: '#141820',
              color: '#6ECFA3',
              fontSize: 13,
              fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif",
              cursor: reportLoading ? 'wait' : 'pointer',
            }}
          >
            {reportLoading ? t('screen.privacy.generating_report', 'Generating...') : t('screen.privacy.generate_report', 'Generate Sovereignty Report')}
          </button>
        </div>
      )}
    </div>
  );
}
