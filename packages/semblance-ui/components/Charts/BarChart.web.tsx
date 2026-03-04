import type { BarChartProps } from './Charts.types';
import './BarChart.css';

const DEFAULT_COLOR = '#6ECFA3';
const DEFAULT_HEIGHT = 120;
const PADDING = { top: 8, right: 4, bottom: 20, left: 4 };

export function BarChart({ data, color = DEFAULT_COLOR, height = DEFAULT_HEIGHT }: BarChartProps) {
  const validData = data.filter((d): d is { label: string; value: number } => d.value !== null);

  if (validData.length === 0) {
    return (
      <div className="bar-chart__empty" style={{ height }}>
        No data available
      </div>
    );
  }

  const chartWidth = 400;
  const maxVal = Math.max(...validData.map((d) => d.value), 1);
  const barAreaWidth = chartWidth - PADDING.left - PADDING.right;
  const barWidth = Math.min(barAreaWidth / data.length - 2, 24);
  const chartHeight = height - PADDING.top - PADDING.bottom;

  return (
    <div className="bar-chart" role="img" aria-label="Bar chart">
      <svg
        className="bar-chart__svg"
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const cx = PADDING.left + (i + 0.5) * (barAreaWidth / data.length);
          const barH = d.value !== null ? (d.value / maxVal) * chartHeight : 0;

          return (
            <g key={d.label}>
              {d.value !== null && (
                <rect
                  className="bar-chart__bar"
                  x={cx - barWidth / 2}
                  y={PADDING.top + chartHeight - barH}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  fill={color}
                  opacity={0.8}
                />
              )}
              <text
                className="bar-chart__label"
                x={cx}
                y={height - 4}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
