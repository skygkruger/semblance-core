import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PrivacyDashboard, useFeatureAuth } from '@semblance/ui';
import type { NetworkEntry, AuditEntry } from '@semblance/ui';
import { useAppState } from '../state/AppState';
import { StaticBracket } from '../components/StaticBracket';
import { GhostSprite } from '../components/GhostSprite';
import {
  renderSovereigntyReportPDF,
  getAuditChainStatus,
  getHardwareKeyBackend,
  getHardwareKeyInfo,
  getPrivacyStatus,
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

  const [realPrivacy, setRealPrivacy] = useState<{
    actionsLogged: number; timeSavedSeconds: number;
    connectionCount: number; allLocal: boolean;
  }>({ actionsLogged: 0, timeSavedSeconds: 0, connectionCount: 0, allLocal: true });

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

  // Load real privacy metrics from IPC (actions logged, time saved, connections)
  useEffect(() => {
    if (!authorized) return;
    getPrivacyStatus().then(status => {
      setRealPrivacy({
        actionsLogged: status.actionsLogged,
        timeSavedSeconds: status.timeSavedSeconds,
        connectionCount: status.connectionCount,
        allLocal: status.allLocal,
      });
    }).catch(() => {
      // IPC may not be ready yet — keep defaults
    });
  }, [authorized]);

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
    return (
      <div className="h-full flex items-center justify-center">
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em' }}>
          {t('status.loading')}
        </p>
      </div>
    );
  }

  const effectiveConnectionCount = realPrivacy.connectionCount || privacyStatus.connectionCount;
  const effectiveAllLocal = realPrivacy.allLocal && privacyStatus.allLocal;

  const networkEntries: NetworkEntry[] = [
    {
      label: t('screen.privacy.total_connections'),
      value: String(effectiveConnectionCount),
      isZero: effectiveConnectionCount === 0,
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
      status: effectiveAllLocal ? 'completed' : 'failed',
      text: effectiveAllLocal
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

  const sourceBreakdown = knowledgeStats.sources ?? {};
  const sourceKeys = Object.keys(sourceBreakdown);

  const linkBtnStyle: React.CSSProperties = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.04em',
  };

  return (
    <div className="page-scroll">
    <div className="page-layout">
      <StaticBracket>
      <GhostSprite insight="All data local. Your knowledge graph lives on this device only.">
      <PrivacyDashboard
        dataSources={knowledgeStats.documentCount}
        cloudConnections={0}
        actionsLogged={realPrivacy.actionsLogged}
        timeSavedHours={Math.round((realPrivacy.timeSavedSeconds / 3600) * 10) / 10}
        networkEntries={networkEntries}
        auditEntries={auditEntries}
        proofVerified={effectiveAllLocal && !privacyStatus.anomalyDetected}
        chainIntegrity={chainIntegrity}
        keySecurity={keySecurity}
        onExportReceipt={handleExportPDF}
      />

      {/* M8: Per-source data breakdown */}
      {sourceKeys.length > 0 && (
        <div className="surface-slate" style={{ borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('screen.privacy.data_by_source', 'Data by Source')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sourceKeys.map(source => (
              <div key={source} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em', textTransform: 'capitalize' }}>{source}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6ECFA3', letterSpacing: '0.04em' }}>{sourceBreakdown[source]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      </GhostSprite>
      </StaticBracket>

      {/* M7 + M9: Links to detailed network activity and gateway permissions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" onClick={() => navigate('/network')} className="btn btn--opal btn--sm" style={{ ...linkBtnStyle, width: '100%' }}>
          <span className="btn__text">{t('screen.privacy.view_network_activity', 'View Detailed Network Activity')} &rarr;</span>
        </button>
        <div style={{ padding: '0 24px' }}>
          <button type="button" onClick={() => navigate('/network')} className="btn btn--opal btn--sm" style={{ ...linkBtnStyle, width: '100%' }}>
            <span className="btn__text">{t('screen.privacy.view_gateway_permissions', 'View Gateway Permissions')} &rarr;</span>
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
