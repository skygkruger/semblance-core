/**
 * EmptyFeatureState — Standardized empty state for feature sections.
 * WireframeSpinner + descriptive text + optional action button.
 * Replaces ad-hoc "No X configured" text.
 */

import { WireframeSpinner } from '@semblance/ui/components/WireframeSpinner/WireframeSpinner';

interface EmptyFeatureStateProps {
  /** What will appear here when active */
  message: string;
  /** Optional action button label */
  actionLabel?: string;
  /** Action callback */
  onAction?: () => void;
  /** Spinner size */
  spinnerSize?: number;
}

export function EmptyFeatureState({
  message,
  actionLabel,
  onAction,
  spinnerSize = 48,
}: EmptyFeatureStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      gap: 16,
      minHeight: 140,
    }}>
      <WireframeSpinner size={spinnerSize} />
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 12,
        color: '#A8B4C0',
        letterSpacing: '0.04em',
        textAlign: 'center',
        maxWidth: 320,
        lineHeight: 1.5,
      }}>
        {message}
      </span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="btn btn--opal btn--sm"
          onClick={onAction}
        >
          <span className="btn__text">{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
