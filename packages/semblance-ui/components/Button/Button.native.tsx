import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { ButtonProps, ButtonVariant, ButtonSize } from './Button.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
  ghost: { bg: 'transparent', text: brandColors.silver, border: 'transparent' },
  solid: { bg: brandColors.veridian, text: brandColors.void, border: brandColors.veridian },
  subtle: { bg: 'rgba(110,207,163,0.1)', text: brandColors.veridian, border: 'transparent' },
  approve: { bg: brandColors.veridian, text: brandColors.void, border: brandColors.veridian },
  dismiss: { bg: 'transparent', text: brandColors.silver, border: brandColors.s3 },
  destructive: { bg: 'rgba(201,123,110,0.1)', text: brandColors.rust, border: 'rgba(201,123,110,0.3)' },
};

const sizeStyles: Record<ButtonSize, { paddingH: number; paddingV: number; fontSize: number; minHeight: number }> = {
  sm: { paddingH: nativeSpacing.s3, paddingV: nativeSpacing.s1, fontSize: nativeFontSize.sm, minHeight: 32 },
  md: { paddingH: nativeSpacing.s4, paddingV: nativeSpacing.s2, fontSize: nativeFontSize.base, minHeight: 44 },
  lg: { paddingH: nativeSpacing.s6, paddingV: nativeSpacing.s3, fontSize: nativeFontSize.md, minHeight: 52 },
};

export function Button({
  variant = 'ghost',
  size = 'md',
  children,
  disabled = false,
  onPress,
  onClick,
}: ButtonProps) {
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];
  const handlePress = onPress ?? onClick;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: vs.bg,
          borderColor: vs.border,
          paddingHorizontal: ss.paddingH,
          paddingVertical: ss.paddingV,
          minHeight: ss.minHeight,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.label, { color: vs.text, fontSize: ss.fontSize }]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nativeRadius.md,
    borderWidth: 1,
  },
  label: {
    fontFamily: nativeFontFamily.uiMedium,
    textAlign: 'center',
  },
});
