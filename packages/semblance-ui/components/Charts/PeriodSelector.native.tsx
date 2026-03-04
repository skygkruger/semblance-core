import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { brandColors, nativeSpacing } from '../../tokens/native';
import type { PeriodSelectorProps, PeriodOption } from './Charts.types';

const OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'custom', label: 'Custom' },
];

export function PeriodSelector({ selected, onSelect }: PeriodSelectorProps) {
  return (
    <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel="Period selector">
      {OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.btn, selected === opt.value && styles.btnActive]}
          onPress={() => onSelect(opt.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === opt.value }}
        >
          <Text style={[styles.btnText, selected === opt.value && styles.btnTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: nativeSpacing.sp1,
    padding: 2,
    backgroundColor: brandColors.surface1,
    borderRadius: 8,
  },
  btn: {
    paddingVertical: nativeSpacing.sp1,
    paddingHorizontal: nativeSpacing.sp3,
    borderRadius: 4,
  },
  btnActive: {
    backgroundColor: brandColors.surface3,
  },
  btnText: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: brandColors.silver2,
  },
  btnTextActive: {
    color: brandColors.veridian,
  },
});
