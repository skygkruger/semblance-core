import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { brandColors, nativeSpacing } from '../../tokens/native';
import type { BarChartProps } from './Charts.types';

const DEFAULT_COLOR = brandColors.veridian;
const DEFAULT_HEIGHT = 120;
const PADDING = { top: 8, right: 4, bottom: 20, left: 4 };

export function BarChart({ data, color = DEFAULT_COLOR, height = DEFAULT_HEIGHT }: BarChartProps) {
  const { t } = useTranslation();
  const validData = data.filter((d): d is { label: string; value: number } => d.value !== null);

  if (validData.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>{t('charts.noData')}</Text>
      </View>
    );
  }

  const chartWidth = 400;
  const maxVal = Math.max(...validData.map((d) => d.value), 1);
  const barAreaWidth = chartWidth - PADDING.left - PADDING.right;
  const barWidth = Math.min(barAreaWidth / data.length - 2, 24);
  const chartHeight = height - PADDING.top - PADDING.bottom;

  return (
    <View accessibilityRole="image" accessibilityLabel="Bar chart">
      <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const cx = PADDING.left + (i + 0.5) * (barAreaWidth / data.length);
          const barH = d.value !== null ? (d.value / maxVal) * chartHeight : 0;

          return (
            <View key={d.label}>
              {d.value !== null && (
                <Rect
                  x={cx - barWidth / 2}
                  y={PADDING.top + chartHeight - barH}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  fill={color}
                  opacity={0.8}
                />
              )}
              <SvgText
                x={cx}
                y={height - 4}
                fontSize={9}
                fill={brandColors.silver1}
                textAnchor="middle"
                fontFamily="DMMono-Regular"
              >
                {d.label}
              </SvgText>
            </View>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'DMSans-Regular', fontSize: 13, color: brandColors.silver1 },
});
