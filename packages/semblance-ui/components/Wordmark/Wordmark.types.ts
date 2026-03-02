export type WordmarkSize = 'nav' | 'hero' | 'footer';

export interface WordmarkProps {
  size?: WordmarkSize;
  shimmer?: boolean;
  className?: string;
}
