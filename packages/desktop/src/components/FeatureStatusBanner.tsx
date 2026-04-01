/**
 * FeatureStatusBanner — Identity strip at the top of a PageContainer section.
 * Shows feature name, status dot + label, optional description.
 */

interface FeatureStatusBannerProps {
  /** Section title in sub-header tier */
  title: string;
  /** Status label — "READY", "NO EXPORTS", "ACTIVE", etc. */
  statusLabel: string;
  /** Status type controls dot color */
  status?: 'active' | 'waiting' | 'inactive' | 'error';
  /** Optional description below title */
  description?: string;
}

const STATUS_COLORS = {
  active: '#6ECFA3',
  waiting: '#EDDD52',
  inactive: '#5E6B7C',
  error: '#E8657A',
};

export function FeatureStatusBanner({
  title,
  statusLabel,
  status = 'inactive',
  description,
}: FeatureStatusBannerProps) {
  const dotColor = STATUS_COLORS[status];

  return (
    <div className="bracket-section" style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 400,
          color: '#B8C0C8',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            animation: status === 'active' ? 'pulse 2s ease-in-out infinite' : 'none',
            animationDelay: '-1000s',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            fontWeight: 400,
            color: dotColor,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {statusLabel}
          </span>
        </div>
      </div>
      {description && (
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          color: '#A8B4C0',
          letterSpacing: '0.04em',
          margin: '6px 0 0',
          lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}
    </div>
  );
}
