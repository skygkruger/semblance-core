export interface DotMatrixProps {
  mobile?: boolean;
  className?: string;
  width?: number;
  height?: number;
}

export interface Dot {
  x: number;
  y: number;
  phase: number;
}
