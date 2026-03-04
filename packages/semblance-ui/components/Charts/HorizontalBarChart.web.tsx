import type { HorizontalBarChartProps } from './Charts.types';
import './HorizontalBarChart.css';

const defaultFormat = (v: number): string => `$${Math.abs(v).toFixed(2)}`;

export function HorizontalBarChart({ data, formatValue = defaultFormat }: HorizontalBarChartProps) {
  if (data.length === 0) return null;

  return (
    <div className="h-bar-chart" role="img" aria-label="Category breakdown chart">
      {data.map((d) => (
        <div key={d.label} className="h-bar-chart__row">
          <span className="h-bar-chart__label" title={d.label}>{d.label}</span>
          <div className="h-bar-chart__track">
            <div
              className="h-bar-chart__bar"
              style={{
                width: `${Math.max(d.percentage, 1)}%`,
                backgroundColor: d.color,
              }}
            />
          </div>
          <span className="h-bar-chart__value" aria-label={`${d.label}: ${formatValue(d.value)}`}>
            {formatValue(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
