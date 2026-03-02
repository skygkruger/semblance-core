import { PrivacyDashboard } from '@semblance/ui';
import type { NetworkEntry, AuditEntry } from '@semblance/ui';
import { useAppState } from '../state/AppState';

export function PrivacyScreen() {
  const state = useAppState();
  const { privacyStatus, knowledgeStats } = state;

  const networkEntries: NetworkEntry[] = [
    {
      label: 'Total connections',
      value: String(privacyStatus.connectionCount),
      isZero: privacyStatus.connectionCount === 0,
    },
    {
      label: 'Local inference',
      value: state.ollamaStatus === 'connected' ? 'Active' : 'Disconnected',
    },
    {
      label: 'External connections',
      value: '0',
      isZero: true,
    },
  ];

  const auditEntries: AuditEntry[] = [
    {
      status: 'completed',
      text: `${knowledgeStats.documentCount} documents indexed`,
      domain: 'knowledge',
    },
    {
      status: privacyStatus.allLocal ? 'completed' : 'failed',
      text: privacyStatus.allLocal
        ? 'All data local — no external connections'
        : 'Anomaly detected — review required',
      domain: 'network',
    },
    {
      status: 'completed',
      text: `Index size: ${(knowledgeStats.indexSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
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
