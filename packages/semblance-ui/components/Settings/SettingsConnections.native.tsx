import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { BackArrow, ChevronRight } from './SettingsIcons';
import type { SettingsConnectionsProps } from './SettingsConnections.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function SettingsConnections({
  connections,
  onManageAll,
  onConnectionTap,
  onBack,
}: SettingsConnectionsProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();

  const connected = connections.filter((c) => c.isConnected);
  const disconnected = connections.filter((c) => !c.isConnected);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel={tc('a11y.go_back')}>
          <BackArrow />
        </Pressable>
        <Text style={styles.headerTitle}>{t('connections.title')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {connected.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>{t('connections.section_connected')}</Text>
            {connected.map((conn) => (
              <Pressable
                key={conn.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onConnectionTap(conn.id)}
                accessibilityRole="button"
              >
                <View style={[styles.dot, { backgroundColor: conn.categoryColor }]} />
                <Text style={styles.rowLabel}>{conn.name}</Text>
                <Text style={styles.rowValue}>
                  {t('connections.value_items_suffix', { n: conn.entityCount })}{conn.lastSync ? ` \u00B7 ${conn.lastSync}` : ''}
                </Text>
                <View style={styles.rowChevron}>
                  <ChevronRight />
                </View>
              </Pressable>
            ))}
          </>
        )}

        {disconnected.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>{t('connections.section_not_connected')}</Text>
            {disconnected.map((conn) => (
              <View key={conn.id} style={styles.rowStatic}>
                <View style={[styles.dot, styles.dotDisconnected]} />
                <Text style={[styles.rowLabel, { color: brandColors.sv1 }]}>{conn.name}</Text>
                <Text style={styles.rowValue}>{t('connections.value_not_connected')}</Text>
              </View>
            ))}
          </>
        )}

        {connections.length === 0 && (
          <Text style={[styles.explanation, { paddingTop: nativeSpacing.s5 }]}>
            {t('connections.empty_body')}
          </Text>
        )}

        <View style={styles.ghostButtonContainer}>
          <Pressable
            onPress={onManageAll}
            style={({ pressed }) => [styles.ghostButton, pressed && styles.ghostButtonPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.ghostButtonText}>{t('connections.btn_manage_all')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: nativeSpacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
    fontSize: 16,
    color: brandColors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: nativeSpacing.s8,
  },
  sectionHeader: {
    paddingTop: nativeSpacing.s5,
    paddingBottom: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s5,
    fontSize: nativeFontSize.xs,
    fontWeight: '400',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: brandColors.sv1,
    fontFamily: nativeFontFamily.mono,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  rowLabel: {
    flex: 1,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    fontFamily: nativeFontFamily.mono,
    marginRight: nativeSpacing.s2,
  },
  rowChevron: {
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    marginRight: nativeSpacing.s3,
    flexShrink: 0,
  },
  dotDisconnected: {
    backgroundColor: brandColors.sv1,
  },
  explanation: {
    paddingHorizontal: nativeSpacing.s5,
    fontSize: nativeFontSize.sm,
    fontWeight: '300',
    color: brandColors.sv3,
    lineHeight: 20,
  },
  ghostButtonContainer: {
    paddingTop: nativeSpacing.s5,
    paddingHorizontal: nativeSpacing.s4,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.3)',
    borderRadius: nativeRadius.md,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s4,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButtonPressed: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
  },
  ghostButtonText: {
    color: brandColors.veridian,
    fontFamily: nativeFontFamily.ui,
    fontSize: 14,
    fontWeight: '400',
  },
});
