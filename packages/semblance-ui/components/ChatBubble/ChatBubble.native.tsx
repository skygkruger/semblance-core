import { View, Text, StyleSheet } from 'react-native';
import type { ChatBubbleProps } from './ChatBubble.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function ChatBubble({ role, content, timestamp, streaming = false }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={styles.content}>
          {content}
          {streaming ? '\u2588' : ''}
        </Text>
        {timestamp ? (
          <Text style={styles.timestamp}>{timestamp}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: nativeSpacing.s1,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s3,
    borderRadius: nativeRadius.lg,
  },
  bubbleUser: {
    backgroundColor: 'rgba(110,207,163,0.12)',
  },
  bubbleAssistant: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
  },
  content: {
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.text,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.silver,
    marginTop: nativeSpacing.s2,
  },
});
