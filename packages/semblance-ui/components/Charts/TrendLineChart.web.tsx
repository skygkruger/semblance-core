import type { TrendLineChartProps } from './Charts.types';
import './TrendLineChart.css';

const DEFAULT_COLOR = '#6ECFA3';
const DEFAULT_HEIGHT = 120;
const PADDING = { top: 8, right: 8, bottom: 8, left: 8 };

function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

export function TrendLineChart({
  data,
  color = DEFAULT_COLOR,
  height = DEFAULT_HEIGHT,
  showArea = false,
  yDomain,
}: TrendLineChartProps) {
  const validPoints = data.filter((d): d is { date: string; value: number } => d.value !== null);

  if (validPoints.length < 2) {
    return (
      <div className="trend-chart__empty" style={{ height }}>
        Not enough data to chart
      </div>
    );
  }

  const values = validPoints.map((d) => d.value);
  const yMin = yDomain ? yDomain[0] : Math.min(...values);
  const yMax = yDomain ? yDomain[1] : Math.max(...values);

  const chartWidth = 400;
  const xScale = linearScale([0, validPoints.length - 1], [PADDING.left, chartWidth - PADDING.right]);
  const yScale = linearScale([yMin, yMax], [height - PADDING.bottom, PADDING.top]);

  const points = validPoints.map((d, i) => ({
    x: xScale(i),
    y: yScale(d.value),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const areaPath = showArea
    ? `${linePath} L${points[points.length - 1]!.x},${height - PADDING.bottom} L${points[0]!.x},${height - PADDING.bottom} Z`
    : '';

  return (
    <div className="trend-chart" role="img" aria-label="Trend chart">
      <svg
        className="trend-chart__svg"
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="none"
      >
        {showArea && (
          <path className="trend-chart__area" d={areaPath} fill={color} />
        )}
        <path className="trend-chart__line" d={linePath} stroke={color} />
        {points.length <= 30 && points.map((p, i) => (
          <circle
            key={i}
            className="trend-chart__dot"
            cx={p.x}
            cy={p.y}
            r={3}
            stroke={color}
          />
        ))}
      </svg>
    </div>
  );
}
