import { useTranslation } from 'react-i18next';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import { WireframeSpinner } from '../../components/WireframeSpinner/WireframeSpinner';
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

export function InitializeStep({ downloads, knowledgeMoment, loading, onComplete }: InitializeStepProps) {
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
          <div style={{ width: 64, height: 64 }}>
            <WireframeSpinner size={64} />
          </div>
          <h2 className="naming__headline">{t('initialize.downloading_headline')}</h2>
          <p className="naming__subtext" style={{ maxWidth: 360 }}>
            {t('initialize.downloading_subtext')}
          </p>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {downloads.map((dl) => (
              <DownloadRow key={dl.modelName} download={dl} completeLabel={t('initialize.download_complete_status')} />
            ))}
          </div>
        </>
      )}

      {allComplete && loading && (
        <>
          <div style={{ width: 64, height: 64 }}>
            <WireframeSpinner size={64} />
          </div>
          <h2 className="naming__headline">{t('initialize.building_headline')}</h2>
          <p className="naming__subtext" style={{ maxWidth: 360 }}>
            {t('initialize.building_subtext')}
          </p>
        </>
      )}

      {allComplete && !loading && knowledgeMoment && (
        <>
          <h2 className="naming__headline">{t('initialize.knowledge_moment_headline')}</h2>
          <div style={{
            width: '100%',
            padding: 20,
            borderRadius: 12,
            backgroundColor: '#111518',
            border: '1px solid rgba(110,207,163,0.15)',
          }}>
            <h3 style={{
              fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, color: '#EEF1F4',
              margin: '0 0 8px',
            }}>
              {knowledgeMoment.title}
            </h3>
            <p style={{
              fontFamily: 'DM Sans, system-ui, sans-serif', fontSize: 14, color: '#8593A4',
              margin: '0 0 12px', lineHeight: 1.5,
            }}>
              {knowledgeMoment.summary}
            </p>
            {knowledgeMoment.connections.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {knowledgeMoment.connections.map((conn) => (
                  <span
                    key={conn}
                    style={{
                      fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#6ECFA3',
                      padding: '2px 8px', borderRadius: 6,
                      backgroundColor: 'rgba(110,207,163,0.08)',
                    }}
                  >
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
