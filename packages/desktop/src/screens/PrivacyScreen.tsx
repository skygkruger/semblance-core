import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PrivacyDashboard, useFeatureAuth } from '@semblance/ui';
import type { NetworkEntry, AuditEntry } from '@semblance/ui';
import { useAppState } from '../state/AppState';
import {
  renderSovereigntyReportPDF,
  getAuditChainStatus,
  getHardwareKeyBackend,
  getHardwareKeyInfo,
} from '../ipc/commands';

export function PrivacyScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const navigate = useNavigate();
  const { requireAuth } = useFeatureAuth();
  const [authorized, setAuthorized] = useState(false);
  const { privacyStatus, knowledgeStats } = state;

  const [chainIntegrity, setChainIntegrity] = useState<{
    verified: boolean; entryCount: number; daysVerified: number; loading: boolean;
  }>({ verified: false, entryCount: 0, daysVerified: 0, loading: true });

  const [keySecurity, setKeySecurity] = useState<{
    hardwareBacked: boolean; backend: string; publicKeyFingerprint: string; loading: boolean;
  }>({ hardwareBacked: false, backend: '', publicKeyFingerprint: '', loading: true });

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

  // Load chain integrity from IPC
  useEffect(() => {
    if (!authorized) return;
    getAuditChainStatus().then(status => {
      setChainIntegrity({
        verified: status.verified,
        entryCount: status.entryCount,
        daysVerified: status.daysVerified,
        loading: false,
      });
    }).catch(() => {
      setChainIntegrity(prev => ({ ...prev, loading: false }));
    });
  }, [authorized]);

  // Load key security from IPC
  useEffect(() => {
    if (!authorized) return;
    getHardwareKeyBackend().then(result => {
      setKeySecurity({
        hardwareBacked: result.backend !== 'software' && result.backend !== 'memory-only',
        backend: result.backend,
        publicKeyFingerprint: '',
        loading: false,
      });
      return getHardwareKeyInfo();
    }).then(info => {
      if (info) {
        setKeySecurity(prev => ({
          ...prev,
          publicKeyFingerprint: info.publicKeyHex?.slice(0, 14) ?? info.keyId ?? '',
        }));
      }
    }).catch(() => {
      setKeySecurity(prev => ({ ...prev, loading: false }));
    });
  }, [authorized]);

  const handleExportPDF = useCallback(async () => {
    try {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const reportData = JSON.stringify({ periodStart, periodEnd });
      const { pdfBase64 } = await renderSovereigntyReportPDF(reportData);
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `sovereignty-report-${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
    } catch (err) {
      console.error('[PrivacyScreen] PDF export failed:', err);
    }
  }, []);

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
    <div className="h-full overflow-y-auto">
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
      <PrivacyDashboard
        dataSources={knowledgeStats.documentCount}
        cloudConnections={0}
        actionsLogged={0}
        timeSavedHours={0}
        networkEntries={networkEntries}
        auditEntries={auditEntries}
        proofVerified={privacyStatus.allLocal && !privacyStatus.anomalyDetected}
        chainIntegrity={chainIntegrity}
        keySecurity={keySecurity}
        onExportReceipt={handleExportPDF}
      />
    </div>
    </div>
  );
}
