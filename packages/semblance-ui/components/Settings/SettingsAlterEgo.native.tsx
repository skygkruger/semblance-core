import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SettingsAlterEgoProps } from './SettingsAlterEgo.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function SettingsAlterEgo(_props: SettingsAlterEgoProps) {
  const { t } = useTranslation('settings');
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('alter_ego.title')}</Text>
      </View>
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
    justifyContent: 'center',
    height: 56,
    paddingHorizontal: nativeSpacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
    fontSize: nativeFontSize.base,
    color: brandColors.white,
  },
});
