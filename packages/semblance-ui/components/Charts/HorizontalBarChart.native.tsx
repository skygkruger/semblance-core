import { View, Text, StyleSheet } from 'react-native';
import { brandColors, nativeSpacing } from '../../tokens/native';
import type { HorizontalBarChartProps } from './Charts.types';

const defaultFormat = (v: number): string => `$${Math.abs(v).toFixed(2)}`;

export function HorizontalBarChart({ data, formatValue = defaultFormat }: HorizontalBarChartProps) {
  if (data.length === 0) return null;

  return (
    <View style={styles.container} accessibilityRole="image" accessibilityLabel="Category breakdown chart">
      {data.map((d) => (
        <View key={d.label} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>{d.label}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                {
                  width: `${Math.max(d.percentage, 1)}%`,
                  backgroundColor: d.color,
                },
              ]}
            />
          </View>
          <Text style={styles.value} accessibilityLabel={`${d.label}: ${formatValue(d.value)}`}>
            {formatValue(d.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: nativeSpacing.sp2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: nativeSpacing.sp2 },
  label: {
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
    color: brandColors.silver3,
    minWidth: 80,
    flexShrink: 0,
  },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: brandColors.border1,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  bar: { height: 6, borderRadius: 9999, minWidth: 2 },
  value: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: brandColors.whiteDim,
    minWidth: 56,
    textAlign: 'right',
    flexShrink: 0,
  },
});
