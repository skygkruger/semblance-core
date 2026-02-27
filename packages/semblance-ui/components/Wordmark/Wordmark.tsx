import './Wordmark.css';

type WordmarkSize = 'nav' | 'hero' | 'footer';

interface WordmarkProps {
  size?: WordmarkSize;
  shimmer?: boolean;
  className?: string;
}

export function Wordmark({ size = 'nav', shimmer = true, className = '' }: WordmarkProps) {
  const sizeClass = `wordmark--${size}`;
  const shimmerClass = shimmer && size !== 'footer' ? 'wordmark--shimmer' : '';

  return (
    <span className={`wordmark ${sizeClass} ${shimmerClass} ${className}`.trim()}>
      Semblance
    </span>
  );
}
