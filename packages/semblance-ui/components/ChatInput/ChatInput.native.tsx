import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ChatInputProps } from './ChatInput.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

const MAX_HEIGHT = 6 * 24; // ~6 lines

export function ChatInput({
  onSend,
  onAttach,
  disabled = false,
  placeholder = 'Awaiting direction',
}: ChatInputProps) {
  const { t } = useTranslation('agent');
  const [value, setValue] = useState('');
  const [inputHeight, setInputHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleContentSizeChange = useCallback(
    (e: { nativeEvent: { contentSize: { height: number } } }) => {
      const h = e.nativeEvent.contentSize.height;
      setInputHeight(Math.min(h, MAX_HEIGHT));
    },
    [],
  );

  const canSend = !disabled && value.trim().length > 0;

  return (
    <View style={[styles.container, disabled && styles.containerDisabled]}>
      {onAttach && (
        <Pressable
          style={styles.attachBtn}
          onPress={onAttach}
          disabled={disabled}
          hitSlop={8}
          accessibilityLabel={t('input.attach_document')}
          accessibilityRole="button"
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              stroke={disabled ? brandColors.sv1 : brandColors.sv2}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      )}

      <TextInput
        ref={inputRef}
        style={[styles.input, inputHeight > 0 && { height: inputHeight }]}
        value={value}
        onChangeText={setValue}
        onContentSizeChange={handleContentSizeChange}
        onSubmitEditing={handleSend}
        placeholder={placeholder}
        placeholderTextColor={brandColors.sv1}
        editable={!disabled}
        multiline
        blurOnSubmit={false}
        textAlignVertical="top"
        accessibilityLabel={t('input.message_input_label')}
      />

      <Pressable
        style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!canSend}
        hitSlop={8}
        accessibilityLabel={t('input.send_message')}
        accessibilityRole="button"
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path
            d="m22 2-7 20-4-9-9-4Z"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M22 2 11 13"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...opalSurface,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: nativeSpacing.s2,
    padding: nativeSpacing.s3,
    borderRadius: nativeRadius.lg,
  },
  containerDisabled: {
    opacity: 0.5,
  },
  attachBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nativeRadius.full,
  },
  input: {
    flex: 1,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: 0,
    minHeight: 44,
    maxHeight: MAX_HEIGHT,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nativeRadius.full,
    backgroundColor: brandColors.veridian,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
