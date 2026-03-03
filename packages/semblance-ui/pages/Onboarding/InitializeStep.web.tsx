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

function DownloadRow({ download, completeLabel }: { download: ModelDownload; completeLabel: string }) {
  const progress = download.totalBytes > 0
    ? (download.downloadedBytes / download.totalBytes) * 100
    : 0;
  const isComplete = download.status === 'complete';

  return (
    <div style={{
      padding: 16,
      borderRadius: 8,
      backgroundColor: '#111518',
      border: '1px solid rgba(107,95,168,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontSize: 14, color: '#EEF1F4' }}>
          {download.modelName}
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: isComplete ? '#6ECFA3' : '#8593A4' }}>
          {isComplete ? completeLabel : `${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)}`}
        </span>
      </div>
      <ProgressBar
        value={isComplete ? 100 : progress}
        indeterminate={download.status === 'pending'}
      />
    </div>
  );
}

export function InitializeStep({ downloads, knowledgeMoment, loading, onComplete, aiName }: InitializeStepProps) {
  const { t } = useTranslation('onboarding');
  const allComplete = downloads.length > 0 && downloads.every(d => d.status === 'complete');

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
      {!allComplete && (
        <>
          <SkeletonCard variant="generic" message="Initializing" height={220} />
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {downloads.map((dl) => (
              <DownloadRow key={dl.modelName} download={dl} completeLabel={t('initialize.download_complete_status')} />
            ))}
          </div>
        </>
      )}

      {allComplete && loading && (
        <SkeletonCard variant="indexing" height={220} />
      )}

      {allComplete && !loading && knowledgeMoment && (
        <>
          <h2 className="naming__headline">
            <span className="ai-name-shimmer">{aiName || 'Semblance'}</span>
            {t('initialize.knowledge_moment_suffix')}
          </h2>
          <div className="knowledge-moment-card opal-surface">
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

      {allComplete && !loading && (
        <div style={{ marginTop: 8 }}>
          <Button variant="approve" size="lg" onClick={onComplete}>
            {t('initialize.start_button')}
          </Button>
        </div>
      )}
    </div>
  );
}
