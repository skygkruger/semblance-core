/**
 * ShimmerDescription — Page sub-header with sage/blue/silver shimmer.
 * Sits below the page-title, adds a living visual element.
 */

interface ShimmerDescriptionProps {
  text: string;
}

export function ShimmerDescription({ text }: ShimmerDescriptionProps) {
  return (
    <p className="shimmer-desc" style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: 14,
      letterSpacing: '0.04em',
      lineHeight: 1.5,
      margin: 0,
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      background: 'linear-gradient(105deg, #7a94b0 0%, #9ab4c8 12%, #b8cdd8 24%, #c8dce6 36%, #a0c0b0 48%, #8ab8a0 54%, #a0c0b0 62%, #c8dce6 74%, #b8cdd8 82%, #9ab4c8 90%, #7a94b0 100%)',
      backgroundSize: '300% auto',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      animation: 'shimmer 19s linear infinite',
      animationDelay: '-6s',
    }}>
      {text}
    </p>
  );
}
