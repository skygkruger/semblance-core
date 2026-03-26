import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { SkeletonCard } from '../../components/SkeletonCard/SkeletonCard';
import type { InitialIndexStepProps } from './InitialIndexStep.types';
import './Onboarding.css';

function formatEta(seconds: number): string {
  if (seconds < 5) return 'Almost done';
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5}s remaining`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins}m remaining`;
}

export function InitialIndexStep({ sources, complete, onContinue, onBack }: InitialIndexStepProps) {
  const { t } = useTranslation('onboarding');
  const totalCount = sources.reduce((sum, s) => sum + s.count, 0);
  const startTimeRef = useRef<number>(Date.now());
  const [eta, setEta] = useState<string | null>(null);

  // Track indexing rate and compute ETA
  useEffect(() => {
    const indexing = sources.filter(s => s.status === 'indexing');
    if (indexing.length === 0 || complete) { setEta(null); return; }

    const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
    if (totalCount > 0 && elapsedSec > 2) {
      const rate = totalCount / elapsedSec; // items per second
      // Estimate ~200 items per source as a rough total (we don't know exact total)
      const estimatedTotal = sources.length * 200;
      const remaining = Math.max(0, estimatedTotal - totalCount);
      const etaSec = rate > 0 ? remaining / rate : 0;
      setEta(formatEta(etaSec));
    } else if (totalCount === 0) {
      setEta('Estimating...');
    }
  }, [sources, totalCount, complete]);

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
      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-2xl)' }}>
        {complete
          ? t('initial_index.complete_headline')
          : t('initial_index.headline')}
      </h2>
      <p style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontSize: 13,
        color: '#8593A4',
        textAlign: 'center',
        margin: 0,
        maxWidth: 360,
        lineHeight: 1.5,
      }}>
        {complete
          ? `Complete \u00B7 ${totalCount} items`
          : t('initial_index.subtext')}
      </p>

      <div className="onboarding-content-frame" style={{ width: '100%' }}>
        {!complete && sources.length === 0 && (
          <SkeletonCard variant="indexing" height={120} />
        )}

        {sources.map((source) => (
          <div key={source.id} style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: '#111518',
            border: '1px solid rgba(107,95,168,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 14,
                color: '#EEF1F4',
              }}>
                {source.name}
              </span>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: source.status === 'complete' ? '#6ECFA3' : '#8593A4',
              }}>
                {source.status === 'complete'
                  ? `${source.count} items`
                  : source.status === 'indexing'
                    ? (source.count > 0 ? `${source.count} items indexed` : 'Estimating...')
                    : t('initial_index.source_pending')}
              </span>
            </div>
            <ProgressBar
              value={source.status === 'complete' ? 100 : 0}
              indeterminate={source.status === 'indexing'}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px',
              color: '#5E6B7C', transition: 'color 150ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#8593A4')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5E6B7C')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15l-5-5 5-5" />
            </svg>
          </button>
        )}
        <Button variant="opal" size="md" onClick={onContinue}>
          <span className="btn__text">
            {complete
              ? t('initial_index.continue_button')
              : t('initial_index.continue_background_button')}
          </span>
        </Button>
      </div>
    </div>
  );
}
