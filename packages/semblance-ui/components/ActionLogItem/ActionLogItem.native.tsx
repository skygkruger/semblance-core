import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ActionLogItemProps, ActionStatus } from './ActionLogItem.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const statusColors: Record<ActionStatus, string> = {
  completed: brandColors.veridian,
  pending: brandColors.amber,
  failed: brandColors.rust,
  undone: brandColors.silver,
};

export function ActionLogItem({
  status,
  text,
  domain,
  timestamp,
  onUndo,
}: ActionLogItemProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
      <View style={styles.content}>
        <Text style={styles.text} numberOfLines={2}>{text}</Text>
        <View style={styles.meta}>
          {domain ? <Text style={styles.domain}>{domain}</Text> : null}
          {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
        </View>
      </View>
      {onUndo && status === 'completed' ? (
        <Pressable
          onPress={onUndo}
          style={({ pressed }) => [styles.undoButton, pressed && styles.undoPressed]}
          accessibilityLabel="Undo action"
          accessibilityRole="button"
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: nativeSpacing.s3,
    paddingHorizontal: nativeSpacing.s4,
    gap: nativeSpacing.s3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.text,
  },
  meta: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
    marginTop: nativeSpacing.s1,
  },
  domain: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.silver,
  },
  time: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.muted,
  },
  undoButton: {
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s1,
  },
  undoPressed: {
    opacity: 0.6,
  },
  undoText: {
    fontSize: nativeFontSize.sm,
    fontFamily: nativeFontFamily.uiMedium,
    color: brandColors.veridian,
  },
});
