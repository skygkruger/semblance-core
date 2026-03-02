import { useTranslation } from 'react-i18next';
import { PrivacyDashboard } from '@semblance/ui';
import type { NetworkEntry, AuditEntry } from '@semblance/ui';
import { useAppState } from '../state/AppState';

export function PrivacyScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const { privacyStatus, knowledgeStats } = state;

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
    <div className="max-w-container-lg mx-auto px-6 py-8">
      <PrivacyDashboard
        dataSources={knowledgeStats.documentCount}
        cloudConnections={0}
        actionsLogged={0}
        timeSavedHours={0}
        networkEntries={networkEntries}
        auditEntries={auditEntries}
        proofVerified={privacyStatus.allLocal && !privacyStatus.anomalyDetected}
      />
    </div>
  );
}
