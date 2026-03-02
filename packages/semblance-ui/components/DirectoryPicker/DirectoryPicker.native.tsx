import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { DirectoryPickerProps } from './DirectoryPicker.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function DirectoryPicker({ directories, onAdd, onRemove, onRescan }: DirectoryPickerProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {directories.map((dir) => (
        <View key={dir.path} style={styles.row}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
              stroke={brandColors.veridian}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>

          <View style={styles.info}>
            <Text style={styles.path} numberOfLines={1}>
              {dir.path}
            </Text>
            <View style={styles.meta}>
              {dir.fileCount !== undefined && (
                <Text style={styles.metaText}>{dir.fileCount} files</Text>
              )}
              {dir.lastIndexed && (
                <Text style={styles.metaText}>{t('screen.directory.last_indexed', { time: dir.lastIndexed })}</Text>
              )}
            </View>
          </View>

          <View style={styles.actions}>
            {onRescan && (
              <Pressable
                style={styles.actionBtn}
                onPress={() => onRescan(dir.path)}
                hitSlop={8}
                accessibilityLabel={`Re-scan ${dir.path}`}
                accessibilityRole="button"
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke={brandColors.sv1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M3 3v5h5" stroke={brandColors.sv1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" stroke={brandColors.sv1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M16 16h5v5" stroke={brandColors.sv1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
            )}
            <Pressable
              style={styles.actionBtn}
              onPress={() => onRemove(dir.path)}
              hitSlop={8}
              accessibilityLabel={`Remove ${dir.path}`}
              accessibilityRole="button"
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M18 6 6 18" stroke={brandColors.rust} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="m6 6 12 12" stroke={brandColors.rust} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable
        style={styles.addBtn}
        onPress={onAdd}
        accessibilityLabel={t('a11y.add_folder')}
        accessibilityRole="button"
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12h14" stroke={brandColors.veridian} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 5v14" stroke={brandColors.veridian} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.addBtnText}>{t('button.add_folder')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: nativeSpacing.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
    padding: nativeSpacing.s3,
    backgroundColor: brandColors.s2,
    borderRadius: nativeRadius.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  path: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
  },
  meta: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
  },
  metaText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s1,
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nativeRadius.md,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s3,
    marginTop: nativeSpacing.s1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(110, 207, 163, 0.30)',
    borderRadius: nativeRadius.md,
    minHeight: 44,
  },
  addBtnText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
});
