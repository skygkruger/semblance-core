import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import type { InputProps } from './Input.types';
import { OpalBorderView, OPAL_BORDER_COLORS } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const FOCUSED_BORDER_COLORS = Array(7).fill('rgba(110,207,163,0.4)') as string[];
const ERROR_BORDER_COLORS = Array(7).fill(brandColors.rust) as string[];

export function Input({
  value,
  onChangeText,
  onChange,
  placeholder,
  error = false,
  errorMessage,
  disabled = false,
  secureTextEntry = false,
  autoFocus = false,
}: InputProps) {
  const [focused, setFocused] = useState(false);

  const handleChangeText = (text: string) => {
    onChangeText?.(text);
    onChange?.({ target: { value: text } });
  };

  return (
    <View style={styles.wrapper}>
      <OpalBorderView
        borderRadius={nativeRadius.xl}
        borderColors={error ? ERROR_BORDER_COLORS : focused ? FOCUSED_BORDER_COLORS : OPAL_BORDER_COLORS}
        style={disabled ? styles.inputDisabled : undefined}
      >
        <TextInput
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={brandColors.sv1}
          secureTextEntry={secureTextEntry}
          editable={!disabled}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
          accessibilityState={{ disabled }}
        />
      </OpalBorderView>
      {error && errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  input: {
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: 14,
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    color: brandColors.wDim,
    minHeight: 48,
  },
  inputDisabled: {
    opacity: 0.4,
  },
  errorMessage: {
    color: brandColors.rust,
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
    marginTop: nativeSpacing.s1,
  },
});
