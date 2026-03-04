import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AutonomySelectorProps } from './AutonomySelector.types';
import { tiers } from './AutonomySelector.types';
import { OpalBorderView, OPAL_BORDER_COLORS } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const VERIDIAN_BORDER_COLORS = Array(7).fill('rgba(110,207,163,0.6)') as string[];

export function AutonomySelector({ value, onChange }: AutonomySelectorProps) {
  const { t } = useTranslation('agent');
  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('autonomy.selector_label')}
    >
      {tiers.map((tier) => {
        const isSelected = tier.id === value;
        const isRecommended = tier.id === 'partner';

        return (
          <Pressable
            key={tier.id}
            onPress={() => onChange(tier.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
          >
          <OpalBorderView
            borderRadius={nativeRadius.lg}
            borderWidth={2}
            borderColors={isSelected ? VERIDIAN_BORDER_COLORS : OPAL_BORDER_COLORS}
            backgroundColor={isSelected ? 'rgba(110,207,163,0.06)' : isRecommended ? 'rgba(110,207,163,0.03)' : '#111518'}
          >
          <View style={styles.option}>
            <View style={styles.header}>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.name}>{t(`autonomy.${tier.id}.name`)}</Text>
              {isRecommended && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('autonomy.recommended_badge')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.description}>{t(`autonomy.${tier.id}.description`)}</Text>
            <Text style={styles.detail}>{t(`autonomy.${tier.id}.detail`)}</Text>
          </View>
          </OpalBorderView>
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
    paddingVertical: nativeSpacing.s5,
    paddingHorizontal: nativeSpacing.s6,
    minHeight: 44,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontFamily: nativeFontFamily.ui,
    fontSize: 16,
    color: brandColors.white,
  },
  badge: {
    backgroundColor: 'rgba(110, 207, 163, 0.10)',
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: nativeRadius.sm,
  },
  badgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.veridian,
    textTransform: 'uppercase',
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
