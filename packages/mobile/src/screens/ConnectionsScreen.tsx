// ConnectionsScreen — Mobile equivalent of desktop ConnectionsScreen.
// Shows all available connectors grouped by category (OAuth, Native, File Import).
// Users can connect/disconnect services. OAuth connectors open system browser.
// All data stays on device — connector registry is from @semblance/core.
//
// CRITICAL: No network imports in this file. Auth flows are delegated to the runtime.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';
import {
  createDefaultConnectorRegistry,
} from '@semblance/core/importers/connector-registry';
import type {
  ConnectorCategory as CoreConnectorCategory,
  ConnectorDefinition,
  ConnectorState,
  ConnectorStatus,
} from '@semblance/core/importers/connector-status';

const registry = createDefaultConnectorRegistry();

/**
 * Connectors enabled in the current release.
 * Mirrors desktop — only connectors with registered gateway adapters
 * (real working backends) are shown.
 */
const ENABLED_CONNECTORS = new Set([
  'gmail',
  'google-calendar',
  'google-drive',
  'slack-oauth',
  'github',
  'dropbox',
  'spotify',
  'notion',
]);

type UICategory = 'oauth' | 'native' | 'manual';

function mapCategory(cat: CoreConnectorCategory): UICategory {
  switch (cat) {
    case 'cloud_storage':
    case 'productivity':
    case 'developer':
      return 'oauth';
    case 'reading_research':
    case 'social':
    case 'music_entertainment':
    case 'messaging':
      return 'oauth';
    case 'health_fitness':
      return 'native';
    case 'finance':
      return 'manual';
    default:
      return 'oauth';
  }
}

interface ConnectorEntry {
  id: string;
  displayName: string;
  description: string;
  status: ConnectorStatus;
  category: UICategory;
  isPremium: boolean;
  platform: string;
  lastSyncedAt?: string;
  iconType?: string;
}

function getCurrentPlatform(): 'macos' | 'windows' | 'linux' {
  // On mobile we list 'all' platform connectors; native ones are platform-specific
  // but the registry's listByPlatform with 'all' won't include macOS-only ones.
  // For mobile, just use 'all' — mobile-specific connectors are handled separately.
  if (Platform.OS === 'ios') return 'macos';
  return 'linux'; // Android maps closest to Linux for registry purposes
}

function StatusBadge({ status }: { status: ConnectorStatus }) {
  const { t } = useTranslation('connections');
  const badgeColor = status === 'connected'
    ? colors.success
    : status === 'error'
      ? colors.attention
      : status === 'pending'
        ? colors.accent
        : colors.textTertiary;

  return (
    <View style={[statusStyles.badge, { borderColor: badgeColor }]}>
      <View style={[statusStyles.dot, { backgroundColor: badgeColor }]} />
      <Text style={[statusStyles.text, { color: badgeColor }]}>
        {t(`status.${status}`)}
      </Text>
    </View>
  );
}

const statusStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

function ConnectorRow({
  connector,
  onConnect,
  onDisconnect,
  onSync,
}: {
  connector: ConnectorEntry;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const { t } = useTranslation('connections');
  const isConnected = connector.status === 'connected';
  const isPending = connector.status === 'pending';

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.info}>
        <View style={rowStyles.nameRow}>
          <Text style={rowStyles.name}>{connector.displayName}</Text>
          {connector.isPremium && (
            <View style={rowStyles.drBadge}>
              <Text style={rowStyles.drBadgeText}>{t('card.dr_badge')}</Text>
            </View>
          )}
        </View>
        <Text style={rowStyles.description} numberOfLines={1}>
          {connector.description}
        </Text>
        {connector.lastSyncedAt && (
          <Text style={rowStyles.syncTime}>
            {t('card.synced_prefix', { time: new Date(connector.lastSyncedAt).toLocaleDateString() })}
          </Text>
        )}
      </View>
      <View style={rowStyles.actions}>
        <StatusBadge status={connector.status} />
        {isPending ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
        ) : isConnected ? (
          <View style={rowStyles.buttonRow}>
            <TouchableOpacity
              style={rowStyles.syncButton}
              onPress={() => onSync(connector.id)}
              accessibilityRole="button"
            >
              <Text style={rowStyles.syncButtonText}>{t('card.btn_sync')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={rowStyles.disconnectButton}
              onPress={() => onDisconnect(connector.id)}
              accessibilityRole="button"
            >
              <Text style={rowStyles.disconnectButtonText}>{t('card.btn_disconnect')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={rowStyles.connectButton}
            onPress={() => onConnect(connector.id)}
            accessibilityRole="button"
          >
            <Text style={rowStyles.connectButtonText}>{t('card.btn_connect')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  drBadge: {
    marginLeft: 8,
    backgroundColor: 'rgba(110, 207, 163, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  drBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  description: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  syncTime: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textSecondaryDark,
    marginTop: 4,
  },
  actions: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },
  connectButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  connectButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  syncButton: {
    borderWidth: 1,
    borderColor: colors.textTertiary,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  syncButtonText: {
    fontFamily: typography.fontBody,
    fontSize: 12,
    color: colors.textSecondaryDark,
  },
  disconnectButton: {
    borderWidth: 1,
    borderColor: colors.attention,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  disconnectButtonText: {
    fontFamily: typography.fontBody,
    fontSize: 12,
    color: colors.attention,
  },
});

/** Persist connector states to AsyncStorage so they survive app restarts. */
async function persistConnectorStates(states: Record<string, ConnectorState>): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('semblance.connector_states', JSON.stringify(states));
  } catch {
    // Storage write failed — state still in memory
  }
}

/** Build an OAuth2 authorization URL for the given connector. */
function buildOAuthUrl(connectorId: string): string {
  const redirectUri = 'semblance://oauth/callback';
  const state = `${connectorId}:${Date.now()}`;

  // Provider-specific authorization endpoints
  const authEndpoints: Record<string, { url: string; scope: string }> = {
    'gmail': {
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    },
    'google-calendar': {
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    },
    'google-drive': {
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
    },
    'github': {
      url: 'https://github.com/login/oauth/authorize',
      scope: 'read:user repo',
    },
    'spotify': {
      url: 'https://accounts.spotify.com/authorize',
      scope: 'user-read-recently-played user-library-read',
    },
    'dropbox': {
      url: 'https://www.dropbox.com/oauth2/authorize',
      scope: '',
    },
    'notion': {
      url: 'https://api.notion.com/v1/oauth/authorize',
      scope: '',
    },
    'slack-oauth': {
      url: 'https://slack.com/oauth/v2/authorize',
      scope: 'channels:read channels:history',
    },
  };

  const endpoint = authEndpoints[connectorId];
  if (!endpoint) {
    throw new Error(`No OAuth endpoint configured for ${connectorId}`);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    scope: endpoint.scope,
  });

  return `${endpoint.url}?${params.toString()}`;
}

export function ConnectionsScreen() {
  const { t } = useTranslation();
  const { t: tConn } = useTranslation('connections');
  const [connectorStates, setConnectorStates] = useState<Record<string, ConnectorState>>({});
  const [loading, setLoading] = useState(true);

  // Build connector list from registry
  const connectors = useMemo<ConnectorEntry[]>(() => {
    const platform = getCurrentPlatform();
    const allConnectors = registry.listByPlatform(platform)
      .filter((c) => ENABLED_CONNECTORS.has(c.id));

    return allConnectors.map((connector) => {
      const connState = connectorStates[connector.id];
      return {
        id: connector.id,
        displayName: connector.displayName,
        description: connector.description,
        status: connState?.status ?? 'disconnected',
        category: mapCategory(connector.category),
        isPremium: connector.isPremium,
        platform: connector.platform,
        lastSyncedAt: connState?.lastSyncedAt,
        iconType: connector.iconType,
      };
    });
  }, [connectorStates]);

  useEffect(() => {
    // Load persisted connector states from AsyncStorage
    const loadStates = async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem('semblance.connector_states');
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, ConnectorState>;
          setConnectorStates(parsed);
        }
      } catch {
        // First launch or storage unavailable — start empty
      }
      setLoading(false);
    };
    loadStates();
  }, []);

  useEffect(() => {
    // Listen for OAuth callback deep links
    const handleDeepLink = (event: { url: string }) => {
      if (event.url.startsWith('semblance://oauth/callback')) {
        const url = new URL(event.url);
        const state = url.searchParams.get('state') ?? '';
        const connectorId = state.split(':')[0];
        if (connectorId) {
          setConnectorStates((prev) => {
            const next = {
              ...prev,
              [connectorId]: {
                connectorId,
                status: 'connected' as ConnectorStatus,
                lastSyncedAt: new Date().toISOString(),
              },
            };
            persistConnectorStates(next);
            return next;
          });
        }
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  // Group connectors by UI category
  const grouped = useMemo(() => {
    const groups: Record<UICategory, ConnectorEntry[]> = {
      oauth: [],
      native: [],
      manual: [],
    };
    for (const c of connectors) {
      groups[c.category].push(c);
    }
    return groups;
  }, [connectors]);

  const connectedCount = connectors.filter((c) => c.status === 'connected').length;

  const handleConnect = useCallback(async (connectorId: string) => {
    const connDef = registry.get(connectorId);
    if (!connDef) return;

    // Update UI to pending state
    setConnectorStates((prev) => ({
      ...prev,
      [connectorId]: {
        connectorId,
        status: 'pending',
      },
    }));

    if (connDef.authType === 'oauth2' || connDef.authType === 'pkce') {
      // OAuth connectors: open the authorization URL in the system browser.
      // The deep link listener above handles the callback and marks connected.
      try {
        const oauthUrl = buildOAuthUrl(connectorId);
        await Linking.openURL(oauthUrl);
        // State stays 'pending' until the deep link callback arrives
      } catch {
        Alert.alert(
          connDef.displayName,
          t('screen.connections.auth_failed'),
          [{ text: t('button.done') }],
        );
        setConnectorStates((prev) => {
          const next = {
            ...prev,
            [connectorId]: { connectorId, status: 'error' as ConnectorStatus },
          };
          persistConnectorStates(next);
          return next;
        });
      }
    } else if (connDef.authType === 'native') {
      // Native connectors access local data directly — mark connected and persist
      setConnectorStates((prev) => {
        const next = {
          ...prev,
          [connectorId]: {
            connectorId,
            status: 'connected' as ConnectorStatus,
            lastSyncedAt: new Date().toISOString(),
          },
        };
        persistConnectorStates(next);
        return next;
      });
    } else {
      // File import / API key connectors — open document picker for user's export file
      try {
        const DocumentPicker = await import('react-native-document-picker').catch(() => null);
        if (DocumentPicker) {
          const result = await DocumentPicker.default.pick({
            type: [DocumentPicker.default.types.allFiles],
          });
          if (result?.[0]?.uri) {
            // Feed the file to the runtime's import pipeline
            const runtimeState = getRuntimeState();
            if (runtimeState.core) {
              await runtimeState.core.importers?.importFile?.(result[0].uri, connectorId);
            }
            setConnectorStates((prev) => {
              const next = {
                ...prev,
                [connectorId]: {
                  connectorId,
                  status: 'connected' as ConnectorStatus,
                  lastSyncedAt: new Date().toISOString(),
                },
              };
              persistConnectorStates(next);
              return next;
            });
          } else {
            // User cancelled — revert to disconnected
            setConnectorStates((prev) => {
              const next = {
                ...prev,
                [connectorId]: { connectorId, status: 'disconnected' as ConnectorStatus },
              };
              persistConnectorStates(next);
              return next;
            });
          }
        } else {
          Alert.alert(
            connDef.displayName,
            'File picker unavailable on this device.',
          );
          setConnectorStates((prev) => {
            const next = {
              ...prev,
              [connectorId]: { connectorId, status: 'disconnected' as ConnectorStatus },
            };
            persistConnectorStates(next);
            return next;
          });
        }
      } catch (err) {
        if ((err as Record<string, unknown>)?.code !== 'DOCUMENT_PICKER_CANCELED') {
          console.error('[ConnectionsScreen] file import failed:', err);
        }
        setConnectorStates((prev) => {
          const next = {
            ...prev,
            [connectorId]: { connectorId, status: 'disconnected' as ConnectorStatus },
          };
          persistConnectorStates(next);
          return next;
        });
      }
    }
  }, [t]);

  const handleDisconnect = useCallback((connectorId: string) => {
    Alert.alert(
      t('button.disconnect'),
      `${t('button.disconnect')} ${registry.get(connectorId)?.displayName ?? connectorId}?`,
      [
        { text: t('button.cancel'), style: 'cancel' },
        {
          text: t('button.disconnect'),
          style: 'destructive',
          onPress: () => {
            setConnectorStates((prev) => {
              const next = {
                ...prev,
                [connectorId]: {
                  connectorId,
                  status: 'disconnected' as ConnectorStatus,
                },
              };
              persistConnectorStates(next);
              return next;
            });
          },
        },
      ],
    );
  }, [t]);

  const handleSync = useCallback(async (connectorId: string) => {
    // Mark as syncing
    setConnectorStates((prev) => ({
      ...prev,
      [connectorId]: {
        ...prev[connectorId]!,
        connectorId,
        status: 'pending' as ConnectorStatus,
      },
    }));

    try {
      const runtimeState = getRuntimeState();
      if (runtimeState.core) {
        // Trigger knowledge graph re-ingestion for this connector's data
        await runtimeState.core.knowledge.reindex?.({ source: connectorId });
      }
      setConnectorStates((prev) => {
        const next = {
          ...prev,
          [connectorId]: {
            ...prev[connectorId]!,
            connectorId,
            status: 'connected' as ConnectorStatus,
            lastSyncedAt: new Date().toISOString(),
          },
        };
        persistConnectorStates(next);
        return next;
      });
    } catch (err) {
      console.error(`[ConnectionsScreen] sync failed for ${connectorId}:`, err);
      setConnectorStates((prev) => ({
        ...prev,
        [connectorId]: {
          ...prev[connectorId]!,
          connectorId,
          status: 'error' as ConnectorStatus,
        },
      }));
    }
  }, []);

  const categoryKeys: UICategory[] = ['oauth', 'native', 'manual'];
  const sectionHeaders: Record<UICategory, string> = {
    oauth: tConn('section_headers.oauth'),
    native: tConn('section_headers.native'),
    manual: tConn('section_headers.manual'),
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{tConn('title')}</Text>
      <Text style={styles.subtitle}>
        {connectedCount > 0
          ? tConn('subtitle_count', { connected: connectedCount, total: connectors.length })
          : tConn('subtitle_empty')
        }
      </Text>

      {categoryKeys.map((cat) => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        return (
          <View key={cat} style={styles.section}>
            <Text style={styles.sectionTitle}>{sectionHeaders[cat]}</Text>
            <View style={styles.sectionCard}>
              {items.map((connector) => (
                <ConnectorRow
                  key={connector.id}
                  connector={connector}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onSync={handleSync}
                />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: 'hidden',
  },
});
