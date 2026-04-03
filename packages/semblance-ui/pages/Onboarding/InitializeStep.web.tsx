import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import { SkeletonCard } from '../../components/SkeletonCard/SkeletonCard';
import type { InitializeStepProps, ModelDownload } from './InitializeStep.types';
import './Onboarding.css';

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function DownloadRow({ download, completeLabel, errorLabel, retryLabel, onRetry }: {
  download: ModelDownload;
  completeLabel: string;
  errorLabel: string;
  retryLabel: string;
  onRetry?: (modelName: string) => void;
}) {
  const progress = download.totalBytes > 0
    ? (download.downloadedBytes / download.totalBytes) * 100
    : 0;
  const isComplete = download.status === 'complete';
  const isError = download.status === 'error';

  return (
    <div style={{
      padding: 16,
      borderRadius: 8,
      backgroundColor: '#111518',
      border: `1px solid ${isError ? 'rgba(232, 101, 122, 0.4)' : 'rgba(99,102,241,0.15)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--fb)', fontSize: 14, color: isError ? '#E8657A' : '#EEF1F4' }}>
          {download.modelName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: isComplete ? '#6ECFA3' : isError ? '#E8657A' : '#8593A4' }}>
            {isComplete ? completeLabel : isError ? errorLabel : `${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)}`}
          </span>
          {isError && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(download.modelName)}
              style={{
                fontFamily: 'var(--fm)',
                fontSize: 11,
                color: '#6ECFA3',
                background: 'rgba(110, 207, 163, 0.1)',
                border: '1px solid rgba(110, 207, 163, 0.25)',
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {retryLabel}
            </button>
          )}
        </div>
      </div>
      {!isError && (
        <ProgressBar
          value={isComplete ? 100 : progress}
          indeterminate={download.status === 'pending'}
        />
      )}
    </div>
  );
}

export function InitializeStep({ downloads, knowledgeMoment, loading, onComplete, aiName, runtimeReady = false, onRetryModel }: InitializeStepProps) {
  const { t } = useTranslation('onboarding');
  const [timeoutFired, setTimeoutFired] = useState(false);

  // Timeout fallback: allow proceeding after 90s regardless of state
  useEffect(() => {
    const timer = setTimeout(() => setTimeoutFired(true), 90_000);
    return () => clearTimeout(timer);
  }, []);

  const allComplete = downloads.length > 0 && downloads.every(d => d.status === 'complete');
  const allSettled = downloads.length > 0 && downloads.every(d => d.status === 'complete' || d.status === 'error');
  const failedDownloads = downloads.filter(d => d.status === 'error');
  const hasFailures = failedDownloads.length > 0;

  // Check if embedding model specifically completed (minimum for functionality)
  const embeddingComplete = downloads.some(d =>
    d.status === 'complete' && d.modelName.toLowerCase().includes('embed')
  );

  // Continue is available when:
  // - runtimeReady (ideal case: all models done, runtime loaded)
  // - embeddingComplete (minimum: embedding model works, some others may have failed)
  // - timeoutFired (fallback: user shouldn't be stuck forever)
  const canContinue = runtimeReady || embeddingComplete || timeoutFired;
  const showDownloads = !allComplete;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 480,
      width: '100%',
      animation: 'dissolve 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      {showDownloads && (
        <div className="onboarding-content-frame" style={{ width: '100%' }}>
          <SkeletonCard variant="generic" message={t('initialize.initializing')} height={220} />
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {downloads.map((dl) => (
              <DownloadRow
                key={dl.modelName}
                download={dl}
                completeLabel={t('initialize.download_complete_status')}
                errorLabel={t('initialize.download_error')}
                retryLabel={t('initialize.retry')}
                onRetry={onRetryModel}
              />
            ))}
          </div>
        </div>
      )}

      {allComplete && loading && (
        <div className="onboarding-content-frame" style={{ width: '100%' }}>
          <SkeletonCard variant="indexing" height={220} />
        </div>
      )}

      {allComplete && !loading && knowledgeMoment && (
        <>
          <h2 className="naming__headline">
            <span className="ai-name-shimmer">{aiName || 'Semblance'}</span>
            {t('initialize.knowledge_moment_suffix')}
          </h2>
          <div className="onboarding-content-frame" style={{ width: '100%' }}>
            <div className="knowledge-moment-card surface-opal opal-surface">
              <h3 className="knowledge-moment-card__title">
                {knowledgeMoment.title}
              </h3>
              <p className="knowledge-moment-card__summary">
                {knowledgeMoment.summary}
              </p>
              {knowledgeMoment.connections.length > 0 && (
                <div className="knowledge-moment-card__tags">
                  {knowledgeMoment.connections.map((conn) => (
                    <span key={conn} className="knowledge-moment-card__tag">
                      {conn}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {allComplete && !loading && !knowledgeMoment && (
        <>
          <h2 className="naming__headline">{t('initialize.ready_headline')}</h2>
          <p className="naming__subtext" style={{ maxWidth: 360 }}>
            {t('initialize.ready_subtext')}
          </p>
        </>
      )}

      {/* Warning for partial failures */}
      {allSettled && hasFailures && canContinue && (
        <p style={{
          fontFamily: 'var(--fb)',
          fontSize: 13,
          color: '#EDDD52',
          maxWidth: 400,
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0,
        }}>
          {t('initialize.continue_warnings_detail', {
            models: failedDownloads.map(d => d.modelName).join(', '),
          })}
        </p>
      )}

      {/* Continue button: shown when downloads are settled (complete or error) and not still loading knowledge moment */}
      {(allSettled && !loading) && (
        <div style={{ marginTop: 8 }}>
          <Button
            variant="opal"
            size="lg"
            onClick={onComplete}
            disabled={!canContinue}
          >
            <span className="btn__text">
              {hasFailures ? t('initialize.continue_with_warnings') : t('initialize.start_button')}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
