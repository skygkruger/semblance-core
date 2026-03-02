/**
 * ConnectionsScreen (Native) -- Full-page screen showing all available connectors
 * grouped into three sections using SectionList.
 */

import { View, Text, Pressable, SectionList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ConnectorCard } from '../ConnectorCard/ConnectorCard';
import type { ConnectionsScreenProps, ConnectorEntry } from './ConnectionsScreen.types';
import { SECTION_CONFIG } from './ConnectionsScreen.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

interface SectionData {
  title: string;
  data: ConnectorEntry[];
}

function buildSections(connectors: ConnectorEntry[], t: (key: string) => string): SectionData[] {
  const sections: SectionData[] = [];
  for (const { key } of SECTION_CONFIG) {
    const items = connectors.filter((c) => c.category === key);
    if (items.length > 0) {
      sections.push({ title: t(`section_headers.${key}`), data: items });
    }
  }
  return sections;
}

export function ConnectionsScreen({
  connectors,
  onConnect,
  onDisconnect,
  onSync,
}: ConnectionsScreenProps) {
  const { t } = useTranslation('connections');
  const hasAny = connectors.length > 0;
  const connectedCount = connectors.filter((c) => c.status === 'connected').length;

  if (!hasAny) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>
          {t('subtitle_empty')}
        </Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyHeading}>{t('empty.heading')}</Text>
          <Text style={styles.emptyBody}>
            {t('empty.body')}
          </Text>
          <View style={styles.emptyActions}>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => onConnect('email')}
              accessibilityLabel={t('empty.btn_email')}
            >
              <Text style={styles.emptyBtnText}>{t('empty.btn_email')}</Text>
            </Pressable>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => onConnect('calendar')}
              accessibilityLabel={t('empty.btn_calendar')}
            >
              <Text style={styles.emptyBtnText}>{t('empty.btn_calendar')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const sections = buildSections(connectors, t);

  return (
    <SectionList<ConnectorEntry, SectionData>
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{t('title')}</Text>
          <Text style={styles.subtitle}>
            {t('subtitle_count', { connected: connectedCount, total: connectors.length })}
          </Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item: connector }) => (
        <View style={styles.cardWrapper}>
          <ConnectorCard
            id={connector.id}
            displayName={connector.displayName}
            description={connector.description}
            status={connector.status}
            isPremium={connector.isPremium}
            platform={connector.platform}
            userEmail={connector.userEmail}
            lastSyncedAt={connector.lastSyncedAt}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onSync={onSync}
          />
        </View>
      )}
      SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  content: {
    padding: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s12,
  },
  headerContainer: {
    gap: nativeSpacing.s2,
    marginBottom: nativeSpacing.s4,
  },
  title: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
  },
  subtitle: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
    lineHeight: 22,
  },
  sectionHeader: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: nativeSpacing.s2,
    marginTop: nativeSpacing.s4,
  },
  cardWrapper: {
    marginBottom: nativeSpacing.s3,
  },
  sectionSeparator: {
    height: nativeSpacing.s2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nativeSpacing.s6,
    paddingVertical: nativeSpacing.s12,
    gap: nativeSpacing.s4,
  },
  emptyHeading: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s4,
  },
  emptyBtn: {
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s3,
    borderRadius: nativeRadius.md,
    borderWidth: 1,
    borderColor: brandColors.veridian,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBtnText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.base,
    color: brandColors.veridian,
  },
});
