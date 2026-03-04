import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ActionLogItemProps, ActionStatus } from './ActionLogItem.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const statusColors: Record<ActionStatus, string> = {
  completed: brandColors.veridian,
  pending: brandColors.amber,
  failed: brandColors.rust,
  undone: brandColors.sv1,
};

export function ActionLogItem({
  status,
  text,
  domain,
  timestamp,
  onUndo,
}: ActionLogItemProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
      <Text style={styles.text} numberOfLines={1}>{text}</Text>
      {domain ? <Text style={styles.domain}>{domain}</Text> : null}
      {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
      {onUndo && status === 'completed' ? (
        <Pressable
          onPress={onUndo}
          style={({ pressed }) => [styles.undoButton, pressed && styles.undoPressed]}
          accessibilityLabel={t('a11y.undo_action')}
          accessibilityRole="button"
        >
          <Text style={styles.undoText}>{t('button.undo')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: nativeSpacing.s3,
    paddingHorizontal: nativeSpacing.s4,
    gap: nativeSpacing.s3,
    borderRadius: nativeRadius.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: nativeRadius.full,
  },
  text: {
    flex: 1,
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.sv3,
  },
  domain: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
    backgroundColor: brandColors.s2,
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: nativeRadius.sm,
    overflow: 'hidden',
  },
  time: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.slate3,
  },
  undoButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  undoPressed: {
    opacity: 0.6,
  },
  undoText: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
  },
});
