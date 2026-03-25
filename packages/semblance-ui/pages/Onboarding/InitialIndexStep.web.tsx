import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { SkeletonCard } from '../../components/SkeletonCard/SkeletonCard';
import type { InitialIndexStepProps } from './InitialIndexStep.types';
import './Onboarding.css';

export function InitialIndexStep({ sources, complete, onContinue, onBack }: InitialIndexStepProps) {
  const { t } = useTranslation('onboarding');
  const totalCount = sources.reduce((sum, s) => sum + s.count, 0);

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
          ? t('initial_index.complete_subtext', { count: totalCount })
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
                  ? t('initial_index.source_complete', { count: source.count })
                  : source.status === 'indexing'
                    ? t('initial_index.source_indexing')
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
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 13,
              color: '#5E6B7C',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 12px',
            }}
          >
            {t('initial_index.back_button')}
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
