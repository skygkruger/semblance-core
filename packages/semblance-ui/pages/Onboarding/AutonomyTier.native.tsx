import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { AutonomySelector } from '../../components/AutonomySelector/AutonomySelector';
import { Button } from '../../components/Button/Button';
import type { AutonomyTierProps } from './AutonomyTier.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function AutonomyTier({ value, onChange, onContinue }: AutonomyTierProps) {
  const { t } = useTranslation('onboarding');
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>
        {t('autonomy.headline')}
      </Text>
      <Text style={styles.subtext}>
        {t('autonomy.subtext')}
      </Text>

      <View style={styles.selectorWrap}>
        <AutonomySelector value={value} onChange={onChange} />
      </View>

      <View style={styles.btnWrap}>
        <Button variant="approve" onPress={onContinue}>{t('autonomy.continue_button')}</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s6,
    paddingHorizontal: nativeSpacing.s5,
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  pronoun: {
    fontFamily: nativeFontFamily.displayItalic,
    color: brandColors.veridian,
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  selectorWrap: {
    width: '100%',
    maxWidth: 400,
  },
  btnWrap: {
    marginTop: nativeSpacing.s2,
  },
});
