import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { ButtonProps, ButtonVariant, ButtonSize } from './Button.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border: string; pressedBg?: string; pressedText?: string; pressedBorder?: string }> = {
  ghost: { bg: 'transparent', text: brandColors.sv2, border: 'rgba(255,255,255,0.12)' },
  solid: { bg: 'rgba(255,255,255,0.08)', text: '#FFFFFF', border: 'rgba(255,255,255,0.09)' },
  subtle: { bg: 'transparent', text: brandColors.sv1, border: 'transparent' },
  opal: {
    bg: brandColors.s1,
    text: '#98a0a8',
    border: 'rgba(152,160,168,0.5)',
    pressedBg: brandColors.veridianDim,
    pressedText: brandColors.veridian,
    pressedBorder: brandColors.veridianWire,
  },
  approve: { bg: 'transparent', text: brandColors.veridian, border: brandColors.veridianWire },
  dismiss: { bg: 'transparent', text: '#8593A4', border: '#8593A4' },
  destructive: { bg: 'transparent', text: brandColors.sv2, border: brandColors.b1 },
};

const sizeStyles: Record<ButtonSize, { paddingH: number; paddingV: number; fontSize: number; minHeight: number }> = {
  sm: { paddingH: 12, paddingV: 6, fontSize: nativeFontSize.sm, minHeight: 32 },
  md: { paddingH: 20, paddingV: 10, fontSize: nativeFontSize.base, minHeight: 44 },
  lg: { paddingH: 28, paddingV: 14, fontSize: nativeFontSize.md, minHeight: 52 },
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
          backgroundColor: pressed && vs.pressedBg ? vs.pressedBg : vs.bg,
          borderColor: pressed && vs.pressedBorder ? vs.pressedBorder : vs.border,
          paddingHorizontal: ss.paddingH,
          paddingVertical: ss.paddingV,
          minHeight: ss.minHeight,
          opacity: disabled ? 0.35 : pressed && !vs.pressedBg ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      {({ pressed }) => typeof children === 'string' ? (
        <Text style={[styles.label, { color: pressed && vs.pressedText ? vs.pressedText : vs.text, fontSize: ss.fontSize }]}>
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
    fontFamily: nativeFontFamily.ui,
    textAlign: 'center',
  },
});
