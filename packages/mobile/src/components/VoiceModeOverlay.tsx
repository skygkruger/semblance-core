// VoiceModeOverlay — Full-screen voice interaction overlay for mobile.
// Shows state-dependent UI: waveform while listening, spinner while processing,
// transcript text while speaking.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { VoiceConversationState } from '@semblance/core/voice/voice-conversation-manager';

interface VoiceModeOverlayProps {
  state: VoiceConversationState;
  transcript?: string;
  onClose: () => void;
  onTap: () => void;
}

const STATE_TEXT: Record<VoiceConversationState, string> = {
  idle: 'Tap to speak',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
  error: 'Something went wrong. Tap to retry.',
};

export function VoiceModeOverlay({ state, transcript, onClose, onTap }: VoiceModeOverlayProps) {
  return (
    <View style={styles.overlay}>
      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        accessibilityLabel="Close voice mode"
        accessibilityRole="button"
      >
        <Text style={styles.closeText}>Done</Text>
      </TouchableOpacity>

      {/* Main content area */}
      <TouchableOpacity
        style={styles.mainArea}
        onPress={onTap}
        accessibilityLabel={STATE_TEXT[state]}
        accessibilityRole="button"
      >
        {/* State indicator */}
        <View style={[
          styles.indicator,
          state === 'listening' && styles.indicatorListening,
          state === 'speaking' && styles.indicatorSpeaking,
          state === 'error' && styles.indicatorError,
        ]} />

        {/* Status text */}
        <Text style={styles.stateText}>{STATE_TEXT[state]}</Text>

        {/* Transcript */}
        {transcript ? (
          <Text style={styles.transcript} numberOfLines={3}>
            {transcript}
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: 12,
  },
  closeText: {
    color: '#e8e3e3',
    fontSize: 16,
    fontWeight: '600',
  },
  mainArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  indicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#374151',
    marginBottom: 24,
  },
  indicatorListening: {
    backgroundColor: '#f87171',
  },
  indicatorSpeaking: {
    backgroundColor: '#60a5fa',
  },
  indicatorError: {
    backgroundColor: '#f59e0b',
  },
  stateText: {
    color: '#e8e3e3',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 12,
  },
  transcript: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
