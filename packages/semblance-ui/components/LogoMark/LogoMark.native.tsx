import { useTranslation } from 'react-i18next';
import { Image, StyleSheet } from 'react-native';
import type { LogoMarkProps } from './LogoMark.types';

export function LogoMark({ size = 120 }: LogoMarkProps) {
  const { t } = useTranslation();

  return (
    <Image
      source={require('../../../assets/semblance-logo-final-1.png')}
      style={[styles.image, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityLabel={t('brand.semblance')}
    />
  );
}

const styles = StyleSheet.create({
  image: {},
});
