// Chart component types — shared between web and native renderers.

export interface HorizontalBarDatum {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

export interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  formatValue?: (v: number) => string;
}

export interface TrendPoint {
  date: string;
  value: number | null;
}

export interface TrendLineChartProps {
  data: TrendPoint[];
  color?: string;
  height?: number;
  showArea?: boolean;
  yDomain?: [number, number];
}

export interface BarDatum {
  label: string;
  value: number | null;
}

export interface BarChartProps {
  data: BarDatum[];
  color?: string;
  height?: number;
}

export type PeriodOption = '7d' | '30d' | '90d' | 'custom';

export interface PeriodSelectorProps {
  selected: PeriodOption;
  onSelect: (p: PeriodOption) => void;
}
