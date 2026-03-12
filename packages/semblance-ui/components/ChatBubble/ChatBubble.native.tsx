import { View, Text, StyleSheet } from 'react-native';
import type { ChatBubbleProps } from './ChatBubble.types';
import { OpalBorderView, USER_BORDER_COLORS } from '../OpalBorderView/OpalBorderView.native';
import { MarkdownText } from './MarkdownText.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function ChatBubble({ role, content, timestamp, streaming = false }: ChatBubbleProps) {
  const isUser = role === 'user';

  const bubbleContent = (
    <>
      {isUser ? (
        <Text style={styles.content}>
          {content}
          {streaming ? '\u2588' : ''}
        </Text>
      ) : (
        <View>
          <MarkdownText text={content} />
          {streaming ? <Text style={styles.content}>{'\u2588'}</Text> : null}
        </View>
      )}
      {timestamp ? (
        <Text style={styles.timestamp}>{timestamp}</Text>
      ) : null}
    </>
  );

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {isUser ? (
        <OpalBorderView
          style={styles.bubble}
          borderRadius={nativeRadius.lg}
          backgroundColor="rgba(110,207,163,0.03)"
          borderColors={USER_BORDER_COLORS}
          shimmerOpacity={0.35}
        >
          {bubbleContent}
        </OpalBorderView>
      ) : (
        <OpalBorderView
          style={styles.bubble}
          borderRadius={nativeRadius.lg}
        >
          {bubbleContent}
        </OpalBorderView>
      )}
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
  },
  content: {
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.text,
    lineHeight: 22.5,
  },
  timestamp: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv2,
    marginTop: nativeSpacing.s2,
  },
});
