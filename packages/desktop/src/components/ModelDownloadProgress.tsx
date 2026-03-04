/**
 * ModelDownloadProgress — Shows model download progress with speed, ETA, and percentage.
 * Used during onboarding (Step 5) and in Settings AI Engine section.
 */

import { ProgressBar } from '@semblance/ui';
import './ModelDownloadProgress.css';

export interface ModelDownloadState {
  modelName: string;
  totalBytes: number;
  downloadedBytes: number;
  speedBytesPerSec: number;
  status: 'pending' | 'downloading' | 'verifying' | 'complete' | 'error';
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatETA(remainingBytes: number, speedBytesPerSec: number): string {
  if (speedBytesPerSec <= 0) return 'Calculating...';
  const seconds = Math.ceil(remainingBytes / speedBytesPerSec);
  if (seconds < 60) return `${seconds}s remaining`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m remaining`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.ceil((seconds % 3600) / 60);
  return `${hours}h ${mins}m remaining`;
}

const STATUS_LABELS: Record<ModelDownloadState['status'], string> = {
  pending: 'Waiting to download...',
  downloading: 'Downloading...',
  verifying: 'Verifying integrity...',
  complete: 'Download complete',
  error: 'Download failed',
};

export function ModelDownloadProgress({
  downloads,
  onRetry,
}: {
  downloads: ModelDownloadState[];
  onRetry?: (modelName: string) => void;
}) {
  if (downloads.length === 0) return null;

  return (
    <div className="model-download">
      {downloads.map((dl) => {
        const percent = dl.totalBytes > 0
          ? Math.round((dl.downloadedBytes / dl.totalBytes) * 100)
          : 0;
        const remaining = dl.totalBytes - dl.downloadedBytes;

        return (
          <div key={dl.modelName} className="model-download__item">
            <div className="model-download__header">
              <span className="model-download__name">{dl.modelName}</span>
              <span className="model-download__percent">
                {dl.status === 'downloading' ? `${percent}%` : STATUS_LABELS[dl.status]}
              </span>
            </div>

            <ProgressBar
              value={percent}
              max={100}
              indeterminate={dl.status === 'verifying' || dl.status === 'pending'}
            />

            <div className="model-download__meta">
              {dl.status === 'downloading' && (
                <>
                  <span>
                    {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)}
                    {dl.speedBytesPerSec > 0 ? ` — ${formatBytes(dl.speedBytesPerSec)}/s` : ''}
                  </span>
                  <span>{formatETA(remaining, dl.speedBytesPerSec)}</span>
                </>
              )}
              {dl.status === 'complete' && (
                <span className="model-download__complete">{formatBytes(dl.totalBytes)}</span>
              )}
              {dl.status === 'error' && (
                <div className="model-download__error-row">
                  <span className="model-download__error-text">{dl.error || 'Unknown error'}</span>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(dl.modelName)}
                      className="model-download__retry"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
