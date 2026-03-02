import { Image, StyleSheet } from 'react-native';
import type { LogoMarkProps } from './LogoMark.types';

export function LogoMark({ size = 120 }: LogoMarkProps) {
  return (
    <Image
      source={require('../../../assets/semblance-logo-final-1.png')}
      style={[styles.image, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityLabel="Semblance"
    />
  );
}

const styles = StyleSheet.create({
  image: {},
});
