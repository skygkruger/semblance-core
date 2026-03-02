// NetworkScreen — Mobile interface for Semblance Network (peer-to-peer sharing).
// Peers list, active sharing, offer/accept flow, revocation, sync status.
// Business logic in packages/core/. This screen is props-driven presentation.
// CRITICAL: No networking imports. All network calls go through Gateway IPC.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, FlatList, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface NetworkPeer {
  id: string;
  name: string;
  deviceType: 'desktop' | 'mobile';
  status: 'connected' | 'discovered' | 'offline';
  lastSeenAt: string;
  sharedCategories: string[];
}

export interface SharingOffer {
  id: string;
  fromPeerName: string;
  categories: string[];
  createdAt: string;
  expiresAt: string;
}

export interface NetworkScreenProps {
  peers: NetworkPeer[];
  activeOffers: SharingOffer[];
  syncStatus: { lastSyncAt: string | null; inProgress: boolean };
  onCreateOffer: (peerId: string, categories: string[]) => Promise<void>;
  onAcceptOffer: (offerId: string) => Promise<void>;
  onDeclineOffer: (offerId: string) => void;
  onRevokePeer: (peerId: string) => Promise<void>;
  onRefreshPeers: () => void;
}

export const NetworkScreen: React.FC<NetworkScreenProps> = ({
  peers,
  activeOffers,
  syncStatus,
  onAcceptOffer,
  onDeclineOffer,
  onRevokePeer,
  onRefreshPeers,
}) => {
  const { t } = useTranslation();
  const [expandedPeerId, setExpandedPeerId] = useState<string | null>(null);

  const handleRevoke = (peer: NetworkPeer) => {
    Alert.alert(
      'Revoke Access',
      `Remove ${peer.name} and delete all cached shared context?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => onRevokePeer(peer.id) },
      ],
    );
  };

  const statusColor = (status: NetworkPeer['status']): string => {
    if (status === 'connected') return colors.success;
    if (status === 'discovered') return colors.accent;
    return colors.textTertiary;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('screen.semblance_network.title')}</Text>
        <TouchableOpacity onPress={onRefreshPeers}>
          <Text style={styles.refreshButton}>[Refresh]</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Status */}
      <View style={styles.syncBar}>
        <Text style={styles.syncText}>
          {syncStatus.inProgress
            ? 'Syncing...'
            : syncStatus.lastSyncAt
              ? `Last sync: ${new Date(syncStatus.lastSyncAt).toLocaleTimeString()}`
              : 'Not synced'}
        </Text>
      </View>

      {/* Pending Offers */}
      {activeOffers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('screen.semblance_network.pending_offers')}</Text>
          {activeOffers.map(offer => (
            <View key={offer.id} style={styles.offerCard}>
              <Text style={styles.offerFrom}>{offer.fromPeerName}</Text>
              <Text style={styles.offerCategories}>
                Sharing: {offer.categories.join(', ')}
              </Text>
              <View style={styles.offerActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => onAcceptOffer(offer.id)}
                >
                  <Text style={styles.acceptButtonText}>{t('button.accept')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={() => onDeclineOffer(offer.id)}
                >
                  <Text style={styles.declineButtonText}>{t('button.decline')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Peers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('screen.semblance_network.discovered_peers')}</Text>
        {peers.length === 0 && (
          <Text style={styles.emptyText}>{t('screen.semblance_network.empty_peers')}</Text>
        )}
        {peers.map(peer => (
          <TouchableOpacity
            key={peer.id}
            style={styles.peerCard}
            onPress={() => setExpandedPeerId(expandedPeerId === peer.id ? null : peer.id)}
          >
            <View style={styles.peerHeader}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(peer.status) }]} />
              <View style={styles.peerInfo}>
                <Text style={styles.peerName}>{peer.name}</Text>
                <Text style={styles.peerDevice}>
                  {peer.deviceType} / {peer.status}
                </Text>
              </View>
            </View>
            {expandedPeerId === peer.id && (
              <View style={styles.peerExpanded}>
                {peer.sharedCategories.length > 0 && (
                  <Text style={styles.sharedLabel}>
                    Sharing: {peer.sharedCategories.join(', ')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() => handleRevoke(peer)}
                >
                  <Text style={styles.revokeButtonText}>{t('screen.semblance_network.revoke_access')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  refreshButton: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  syncBar: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xl,
  },
  syncText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  offerCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  offerFrom: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  offerCategories: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  offerActions: { flexDirection: 'row', gap: spacing.sm },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  declineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  declineButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    paddingVertical: spacing.md,
  },
  peerCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  peerHeader: { flexDirection: 'row', alignItems: 'center' },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  peerInfo: { flex: 1 },
  peerName: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  peerDevice: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  peerExpanded: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  sharedLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.sm,
  },
  revokeButton: {
    borderWidth: 1,
    borderColor: colors.attention,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  revokeButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.attention,
  },
});
