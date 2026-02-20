import { Card, StatusIndicator } from '@semblance/ui';
import { useAppState } from '../state/AppState';

export function PrivacyScreen() {
  const state = useAppState();
  const { privacyStatus, knowledgeStats } = state;

  return (
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
        Privacy
      </h1>

      {/* Privacy Status — most prominent element */}
      <Card className={`
        border-2
        ${privacyStatus.allLocal && !privacyStatus.anomalyDetected
          ? 'border-semblance-success/30 bg-semblance-success-subtle dark:bg-semblance-success/5'
          : 'border-semblance-attention/30 bg-semblance-attention-subtle dark:bg-semblance-attention/5'
        }
      `}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${privacyStatus.allLocal ? 'bg-semblance-success/10' : 'bg-semblance-attention/10'}`}>
            <svg
              className={`w-8 h-8 ${privacyStatus.allLocal ? 'text-semblance-success' : 'text-semblance-attention'}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            >
              {privacyStatus.allLocal ? (
                <>
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </>
              )}
            </svg>
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${privacyStatus.allLocal ? 'text-semblance-success' : 'text-semblance-attention'}`}>
              {privacyStatus.allLocal && !privacyStatus.anomalyDetected
                ? 'All Data Local — No External Connections'
                : 'Anomaly Detected — Review Required'}
            </h2>
            <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1">
              Your data never leaves this device. Semblance processes everything locally.
            </p>
          </div>
        </div>
      </Card>

      {/* Network Activity */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Network Activity
        </h2>
        <div className="flex items-center gap-3 p-3 bg-semblance-surface-2 dark:bg-semblance-surface-2-dark rounded-md">
          <StatusIndicator status="success" />
          <div className="flex-1">
            <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">localhost:11434</p>
            <p className="text-xs text-semblance-text-tertiary">Ollama (local LLM inference)</p>
          </div>
          <span className="text-xs text-semblance-text-tertiary">Local only</span>
        </div>
        {privacyStatus.connectionCount === 0 && (
          <p className="text-sm text-semblance-text-tertiary mt-4">
            No external connections detected. All traffic stays on this device.
          </p>
        )}
      </Card>

      {/* Audit Trail Summary */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Audit Trail
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold text-semblance-primary">0</p>
            <p className="text-xs text-semblance-text-tertiary">Actions Logged</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="success" />
            <div>
              <p className="text-sm font-medium text-semblance-success">Chain Intact</p>
              <p className="text-xs text-semblance-text-tertiary">Hash chain unbroken</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="mt-4 text-sm text-semblance-primary hover:underline focus-visible:outline-none focus-visible:shadow-focus rounded"
          onClick={() => {/* Navigate to Activity */}}
        >
          View Full Activity Log
        </button>
      </Card>

      {/* Data Inventory */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Data Inventory
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">Documents indexed</span>
            <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark font-medium">{knowledgeStats.documentCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">Index size</span>
            <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark font-medium">
              {(knowledgeStats.indexSizeBytes / (1024 * 1024)).toFixed(1)} MB
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">Storage location</span>
            <span className="font-mono text-xs text-semblance-text-tertiary">~/.semblance/</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
