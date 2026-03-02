import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import type { InputProps } from './Input.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

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
      <TextInput
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={brandColors.silver}
        secureTextEntry={secureTextEntry}
        editable={!disabled}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
        accessibilityState={{ disabled }}
      />
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
    backgroundColor: brandColors.s1,
    borderWidth: 1,
    borderColor: brandColors.s3,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s3,
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.text,
    minHeight: 44,
  },
  inputFocused: {
    borderColor: brandColors.veridian,
  },
  inputError: {
    borderColor: brandColors.rust,
  },
  inputDisabled: {
    opacity: 0.4,
  },
  errorMessage: {
    color: brandColors.rust,
    fontSize: nativeFontSize.sm,
    fontFamily: nativeFontFamily.ui,
    marginTop: nativeSpacing.s1,
  },
});
