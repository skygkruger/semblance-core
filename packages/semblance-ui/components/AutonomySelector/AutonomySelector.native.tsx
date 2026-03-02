import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { AutonomySelectorProps } from './AutonomySelector.types';
import { tiers } from './AutonomySelector.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function AutonomySelector({ value, onChange }: AutonomySelectorProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel="Autonomy tier selection"
    >
      {tiers.map((tier) => {
        const isSelected = tier.id === value;
        const isRecommended = tier.id === 'partner';

        return (
          <Pressable
            key={tier.id}
            style={[
              styles.option,
              isSelected && styles.optionSelected,
              isRecommended && !isSelected && styles.optionRecommended,
            ]}
            onPress={() => onChange(tier.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
          >
            <View style={styles.header}>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.name}>{tier.name}</Text>
              {isRecommended && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Recommended</Text>
                </View>
              )}
            </View>
            <Text style={styles.description}>{tier.description}</Text>
            <Text style={styles.detail}>{tier.detail}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: nativeSpacing.s3,
  },
  option: {
    ...opalSurface,
    borderWidth: 2,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s5,
    minHeight: 44,
  },
  optionSelected: {
    borderColor: brandColors.veridian,
    backgroundColor: 'rgba(110, 207, 163, 0.06)',
  },
  optionRecommended: {
    backgroundColor: 'rgba(110, 207, 163, 0.03)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: brandColors.sv1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: brandColors.veridian,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brandColors.veridian,
  },
  name: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.md,
    color: brandColors.white,
  },
  badge: {
    backgroundColor: 'rgba(110, 207, 163, 0.10)',
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: nativeRadius.full,
  },
  badgeText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
  },
  description: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    marginTop: nativeSpacing.s2,
    marginLeft: 28, // radio width (16) + gap (12)
  },
  detail: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    marginTop: nativeSpacing.s1,
    marginLeft: 28,
  },
});
