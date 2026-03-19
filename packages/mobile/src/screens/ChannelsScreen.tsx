// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider';

interface ChannelInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const CHANNELS: ChannelInfo[] = [
  { id: 'imessage', name: 'iMessage', icon: 'MSG', description: 'Apple iMessage via local database access' },
  { id: 'telegram', name: 'Telegram', icon: 'TG', description: 'Telegram Bot API with local session storage' },
  { id: 'signal', name: 'Signal', icon: 'SIG', description: 'Signal Protocol with local key management' },
  { id: 'slack', name: 'Slack', icon: 'SLK', description: 'Slack workspace integration via OAuth' },
  { id: 'whatsapp', name: 'WhatsApp', icon: 'WA', description: 'WhatsApp Business API with local bridge' },
];

export function ChannelsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const semblance = useSemblance();

  const renderChannel = ({ item }: { item: ChannelInfo }) => (
    <View style={styles.channelCard}>
      <View style={styles.channelHeader}>
        <View style={styles.iconBadge}>
          <Text style={styles.iconText}>{item.icon}</Text>
        </View>
        <View style={styles.channelInfo}>
          <Text style={styles.channelName}>{item.name}</Text>
          <Text style={styles.channelDescription}>{item.description}</Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, styles.statusNotConfigured]} />
        <Text style={styles.statusText}>Not configured</Text>
      </View>
    </View>
  );

  if (!semblance.ready) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Messaging Channels</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {semblance.initializing ? semblance.progressLabel : 'Connecting to runtime...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Messaging Channels</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Desktop Configuration Required</Text>
        <Text style={styles.infoBody}>
          Messaging channels are configured through the Semblance desktop app, where OAuth
          flows and local database access can be securely established. Once connected on
          desktop, channel data syncs to your knowledge graph and is accessible here.
        </Text>
      </View>

      <FlatList
        data={CHANNELS}
        renderItem={renderChannel}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No channels available.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  title: {
    fontFamily: 'DMSans-Regular',
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 8,
  },
  infoCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.primary,
    marginBottom: 8,
  },
  infoBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  separator: {
    height: 8,
  },
  channelCard: {
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primarySubtleDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  channelDescription: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusNotConfigured: {
    backgroundColor: colors.muted,
  },
  statusText: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
  },
  emptyText: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 24,
  },
});

export default ChannelsScreen;
