import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Circle } from 'react-native-svg';
import { brandColors, nativeSpacing } from '../../tokens/native';
import type { TrendLineChartProps } from './Charts.types';

const DEFAULT_COLOR = brandColors.veridian;
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
  const { t } = useTranslation();
  const validPoints = data.filter((d): d is { date: string; value: number } => d.value !== null);

  if (validPoints.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>{t('charts.notEnoughData')}</Text>
      </View>
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
    ? `${linePath} L${points[points.length - 1].x},${height - PADDING.bottom} L${points[0].x},${height - PADDING.bottom} Z`
    : '';

  return (
    <View style={styles.container} accessibilityRole="image" accessibilityLabel="Trend chart">
      <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="none">
        {showArea && (
          <Path d={areaPath} fill={color} opacity={0.15} />
        )}
        <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.length <= 30 && points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} stroke={color} strokeWidth={2} fill={brandColors.background} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'DMSans-Regular', fontSize: 13, color: brandColors.silver1 },
});
