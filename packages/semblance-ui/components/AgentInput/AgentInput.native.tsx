import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner';
import type { AgentInputProps } from './AgentInput.types';
import { VOICE_LABELS, PLACEHOLDER_HINTS } from './AgentInput.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function AgentInput({
  placeholder,
  thinking = false,
  activeDocument,
  onSend,
  onSubmit,
  autoFocus = false,
  voiceEnabled = false,
  voiceState = 'idle',
  audioLevel = 0,
  onVoiceStart,
  onVoiceStop,
  onVoiceCancel,
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const [inputHeight, setInputHeight] = useState(44);
  const inputRef = useRef<TextInput>(null);

  const hints = placeholder ? [placeholder] : PLACEHOLDER_HINTS;

  // Hint cycling -- only when multiple hints and user is not active
  useEffect(() => {
    if (isFocused || value || hints.length <= 1) return;
    const interval = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIndex((i) => (i + 1) % hints.length);
        setHintVisible(true);
      }, 400);
    }, 4500);
    return () => clearInterval(interval);
  }, [isFocused, value, hints.length]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSend?.(trimmed);
      onSubmit?.(trimmed);
      setValue('');
      setInputHeight(44);
    }
  }, [value, onSend, onSubmit]);

  const isVoiceActive = voiceEnabled && voiceState !== 'idle';

  const handleChangeText = useCallback(
    (text: string) => {
      if (thinking || isVoiceActive) return;
      setValue(text);
    },
    [thinking, isVoiceActive],
  );

  const handleContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const newHeight = Math.min(Math.max(44, e.nativeEvent.contentSize.height), 120);
      setInputHeight(newHeight);
    },
    [],
  );

  const handleSubmitEditing = useCallback(
    (_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      handleSend();
    },
    [handleSend],
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (voiceEnabled && voiceState === 'listening') {
      onVoiceCancel?.();
    }
  }, [voiceEnabled, voiceState, onVoiceCancel]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleMicPress = useCallback(() => {
    if (!voiceEnabled) return;
    switch (voiceState) {
      case 'idle':
      case 'error':
        onVoiceStart?.();
        break;
      case 'listening':
        onVoiceStop?.();
        break;
      case 'speaking':
        onVoiceCancel?.();
        break;
    }
  }, [voiceEnabled, voiceState, onVoiceStart, onVoiceStop, onVoiceCancel]);

  const hasValue = value.trim().length > 0;

  // Compute waveform bar heights from audioLevel (0-1)
  const barHeights =
    voiceEnabled && voiceState === 'listening'
      ? [0.4, 0.7, 1.0, 0.7, 0.4].map((scale) => Math.max(4, Math.round(scale * audioLevel * 20)))
      : [];

  const showHint = !value && !isFocused && !isVoiceActive && !thinking;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {activeDocument && (
        <View style={styles.documentPill}>
          <Text style={styles.documentName} numberOfLines={1}>
            {activeDocument.name}
          </Text>
          <Pressable
            onPress={activeDocument.onDismiss}
            hitSlop={8}
            style={styles.documentDismiss}
            accessibilityLabel="Dismiss document"
          >
            <Text style={styles.documentDismissText}>x</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.container}>
        {/* Text input -- always rendered, hidden when thinking or voice active */}
        <View style={styles.fieldWrapper}>
          <TextInput
            ref={inputRef}
            style={[
              styles.field,
              { height: inputHeight },
              (thinking || isVoiceActive) && styles.fieldHidden,
            ]}
            value={thinking || isVoiceActive ? '' : value}
            onChangeText={handleChangeText}
            onContentSizeChange={handleContentSizeChange}
            onSubmitEditing={handleSubmitEditing}
            onFocus={handleFocus}
            onBlur={handleBlur}
            multiline
            blurOnSubmit
            autoFocus={!thinking && autoFocus}
            editable={!thinking && !isVoiceActive}
            placeholder=""
            placeholderTextColor={brandColors.sv1}
            returnKeyType="send"
            textAlignVertical="top"
            accessibilityLabel="Message input"
          />

          {/* Thinking overlay */}
          {thinking && (
            <View style={styles.thinkingOverlay} accessibilityLabel="Thinking">
              <WireframeSpinner size={40} speed={0.8} />
              <Text style={styles.thinkingText}>On it.</Text>
            </View>
          )}

          {/* Placeholder hint */}
          {showHint && (
            <View style={styles.hintContainer} pointerEvents="none">
              <Text style={[styles.hintText, { opacity: hintVisible ? 1 : 0 }]}>
                {hints[hintIndex]}
              </Text>
            </View>
          )}

          {/* Voice overlay */}
          {voiceEnabled && isVoiceActive && (
            <View style={styles.voiceOverlay}>
              {voiceState === 'listening' && (
                <View style={styles.waveform}>
                  {barHeights.map((h, i) => (
                    <View
                      key={i}
                      style={[styles.waveformBar, { height: h }]}
                    />
                  ))}
                </View>
              )}
              {voiceState === 'processing' && (
                <Text style={styles.voiceStatus}>Processing...</Text>
              )}
              {voiceState === 'speaking' && (
                <Text style={styles.voiceStatus}>Speaking...</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {voiceEnabled && (
            <Pressable
              onPress={handleMicPress}
              disabled={voiceState === 'processing'}
              accessibilityLabel={VOICE_LABELS[voiceState]}
              style={[
                styles.micButton,
                voiceState === 'listening' && styles.micButtonListening,
                voiceState === 'error' && styles.micButtonError,
              ]}
              hitSlop={8}
            >
              <Text style={styles.micIcon}>
                {voiceState === 'speaking' ? 'S' : voiceState === 'error' ? '!' : 'M'}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleSend}
            disabled={thinking || !hasValue || (voiceEnabled && voiceState === 'processing')}
            style={[
              styles.sendButton,
              (thinking || !hasValue) && styles.sendButtonDisabled,
            ]}
            accessibilityLabel="Send"
            hitSlop={8}
          >
            <Text
              style={[
                styles.sendIcon,
                (thinking || !hasValue) && styles.sendIconDisabled,
              ]}
            >
              {'\u21B5'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  documentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brandColors.s2,
    borderRadius: nativeRadius.sm,
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    marginBottom: nativeSpacing.s2,
    gap: nativeSpacing.s2,
  },
  documentName: {
    flex: 1,
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  documentDismiss: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  documentDismissText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
  },
  container: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: nativeSpacing.s4,
    paddingRight: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s2,
    gap: nativeSpacing.s2,
  },
  fieldWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  field: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    paddingVertical: nativeSpacing.s2,
    minHeight: 44,
    maxHeight: 120,
  },
  fieldHidden: {
    opacity: 0,
  },
  thinkingOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
  },
  thinkingText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
  },
  hintContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  hintText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv1,
  },
  voiceOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s1,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveformBar: {
    width: 3,
    backgroundColor: brandColors.veridian,
    borderRadius: 1.5,
  },
  voiceStatus: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s1,
  },
  micButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nativeRadius.full,
  },
  micButtonListening: {
    backgroundColor: 'rgba(110, 207, 163, 0.15)',
  },
  micButtonError: {
    backgroundColor: 'rgba(201, 123, 110, 0.15)',
  },
  micIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nativeRadius.full,
    backgroundColor: brandColors.veridian,
  },
  sendButtonDisabled: {
    backgroundColor: brandColors.s3,
  },
  sendIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.md,
    color: brandColors.base,
  },
  sendIconDisabled: {
    color: brandColors.sv1,
  },
});
