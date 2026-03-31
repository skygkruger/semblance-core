/**
 * ConnectionsScreen — Uses the Storybook ConnectionsScreen component from @semblance/ui.
 * This is a thin wrapper that loads connector data and passes it to the Storybook component.
 * Includes multi-account support: lists accounts per provider, set primary, remove, add another.
 */

import { useState, useCallback, useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { ConnectionsScreen as ConnectionsScreenUI } from '@semblance/ui';
import type { ConnectorEntry } from '@semblance/ui';
import {
  ipcSend,
  getConnectedServices,
  listConnectorAccounts,
  setConnectorPrimaryAccount,
  removeConnectorAccount,
} from '../ipc/commands';
import type { OAuthAccount } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';
import {
  createDefaultConnectorRegistry,
} from '@semblance/core/importers/connector-registry';
import type {
  ConnectorCategory as CoreConnectorCategory,
  ConnectorState,
} from '@semblance/core/importers/connector-status';
import { useAppState, useAppDispatch } from '../state/AppState';

const registry = createDefaultConnectorRegistry();

/**
 * Connectors enabled in the current release.
 * Only connectors with registered gateway adapters (real working backends)
 * are shown. All other connectors are preserved in the registry code but
 * hidden from the UI until their backends are implemented.
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

/**
 * Map provider keys (from OAuthTokenManager) to connector IDs (used in UI).
 * getOAuthConfigForConnector maps connectorId -> providerKey; this is the reverse.
 */
const PROVIDER_TO_CONNECTOR: Record<string, string> = {
  'google': 'gmail',
  'google-calendar': 'google-calendar',
  'google-drive': 'google-drive',
  'dropbox': 'dropbox',
  'github': 'github',
  'spotify': 'spotify',
  'notion': 'notion',
  'slack': 'slack-oauth',
};

function getCurrentPlatform(): 'macos' | 'windows' | 'linux' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
}

/** Map core connector category to semblance-ui ConnectorCategory */
function mapCategory(cat: CoreConnectorCategory): 'native' | 'oauth' | 'manual' {
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

export function ConnectionsScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const license = useLicense();
  const [connectors, setConnectors] = useState<ConnectorEntry[]>([]);
  const [accountsByConnector, setAccountsByConnector] = useState<Record<string, OAuthAccount[]>>({});
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Load all OAuth accounts and group by connector ID
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      // Load accounts per enabled connector
      const grouped: Record<string, OAuthAccount[]> = {};
      for (const connectorId of ENABLED_CONNECTORS) {
        try {
          const accounts = await listConnectorAccounts(connectorId);
          if (accounts && accounts.length > 0) {
            grouped[connectorId] = accounts;
          }
        } catch {
          // Connector may not have OAuth config — skip silently
        }
      }
      setAccountsByConnector(grouped);
    } catch {
      // Graceful failure — account list is supplementary
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    const platform = getCurrentPlatform();
    const allConnectors = registry.listByPlatform(platform)
      .filter((c) => ENABLED_CONNECTORS.has(c.id));
    const connectorStates: Record<string, ConnectorState> = (state as unknown as Record<string, unknown>)['connectorStates'] as Record<string, ConnectorState> ?? {};
    const isPremium = license.tier !== 'free';

    const entries: ConnectorEntry[] = allConnectors.map((connector) => {
      const connState = connectorStates[connector.id];
      const isLocked = connector.isPremium && !isPremium;
      return {
        id: connector.id,
        displayName: connector.displayName,
        description: isLocked ? 'Digital Representative required' : connector.description,
        status: isLocked ? 'disconnected' as const : (connState?.status ?? 'disconnected'),
        category: mapCategory(connector.category),
        isPremium: connector.isPremium,
        platform: connector.platform as 'all' | 'macos' | 'windows' | 'linux',
        userEmail: connState?.userEmail,
        lastSyncedAt: connState?.lastSyncedAt,
        iconType: connector.iconType,
      };
    });

    setConnectors(entries);
  }, [state, license.tier]);

  // Hydrate connector states from stored OAuth tokens on mount
  useEffect(() => {
    getConnectedServices().then((connectedServices) => {
      if (connectedServices && Array.isArray(connectedServices)) {
        for (const svc of connectedServices) {
          // Handle both old string[] and new object[] response shapes
          const connectorId = typeof svc === 'string' ? svc : svc.connectorId;
          const lastSyncedAt = typeof svc === 'string' ? undefined : (svc.lastSyncedAt ?? undefined);
          dispatch({
            type: 'SET_CONNECTOR_STATE',
            connectorId,
            state: {
              connectorId,
              status: 'connected',
              lastSyncedAt,
            },
          });
        }
      }
    }).catch(() => {});
  }, [dispatch]);

  // Load multi-account data on mount
  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Listen for indexing-complete events to update sync timestamps
  useEffect(() => {
    const unlisten = listen<{ connectorId: string }>('semblance://indexing-complete', (event) => {
      const { connectorId } = event.payload;
      if (connectorId) {
        dispatch({
          type: 'SET_CONNECTOR_STATE',
          connectorId,
          state: {
            connectorId,
            status: 'connected',
            lastSyncedAt: new Date().toISOString(),
          },
        });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [dispatch]);

  const handleConnect = useCallback(async (connectorId: string) => {
    try {
      const result = await ipcSend({
        action: 'connector.auth',
        payload: { connectorId },
      });
      // Check if sidecar returned a failure response
      if (result && typeof result === 'object' && (result as Record<string, unknown>).success === false) {
        const errorMsg = (result as Record<string, unknown>).error as string || 'Connection failed';
        console.error(`Connector auth failed for ${connectorId}:`, errorMsg);
        emit('semblance://toast', {
          id: `conn_err_${Date.now()}`,
          message: errorMsg,
          variant: 'attention',
        }).catch(() => {});
      } else {
        // Auth succeeded — show "Syncing..." until indexing-complete fires
        dispatch({
          type: 'SET_CONNECTOR_STATE',
          connectorId,
          state: {
            connectorId,
            status: 'syncing',
            lastSyncedAt: undefined,
          },
        });
        emit('semblance://toast', {
          id: `conn_ok_${Date.now()}`,
          message: `${connectorId} connected successfully`,
          variant: 'success',
        }).catch(() => {});
        // Auto-sync immediately after successful connection
        try {
          await ipcSend({
            action: 'connector.sync',
            payload: { connectorId },
          });
        } catch (syncErr) {
          console.error(`Auto-sync failed for ${connectorId}:`, syncErr);
        }
        // Refresh account list after new account connected
        loadAccounts();
      }
    } catch (err) {
      console.error(`Failed to connect ${connectorId}:`, err);
      emit('semblance://toast', {
        id: `conn_err_${Date.now()}`,
        message: `Failed to connect ${connectorId}`,
        variant: 'attention',
      }).catch(() => {});
    }
  }, [dispatch, loadAccounts]);

  const handleDisconnect = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.disconnect',
        payload: { connectorId },
      });
      // Update UI state to reflect disconnection
      dispatch({
        type: 'SET_CONNECTOR_STATE',
        connectorId,
        state: { connectorId, status: 'disconnected' as ConnectorState['status'], lastSyncedAt: undefined },
      });
      // Refresh accounts
      loadAccounts();
    } catch (err) {
      console.error(`Failed to disconnect ${connectorId}:`, err);
    }
  }, [dispatch, loadAccounts]);

  const handleSync = useCallback(async (connectorId: string) => {
    // Show syncing state
    dispatch({
      type: 'SET_CONNECTOR_STATE',
      connectorId,
      state: { connectorId, status: 'syncing' as ConnectorState['status'] },
    });
    try {
      await ipcSend({
        action: 'connector.sync',
        payload: { connectorId },
      });
      // indexing-complete event will update status to 'connected' with timestamp
    } catch (err) {
      console.error(`Failed to sync ${connectorId}:`, err);
      // Revert to connected (not stuck on syncing) and show error
      dispatch({
        type: 'SET_CONNECTOR_STATE',
        connectorId,
        state: { connectorId, status: 'connected' as ConnectorState['status'] },
      });
      emit('semblance://toast', {
        id: `sync_err_${Date.now()}`,
        message: `Sync failed for ${connectorId}`,
        variant: 'attention',
      }).catch(() => {});
    }
  }, [dispatch]);

  const handleSetPrimary = useCallback(async (accountId: string) => {
    try {
      await setConnectorPrimaryAccount(accountId);
      loadAccounts();
      emit('semblance://toast', {
        id: `primary_ok_${Date.now()}`,
        message: 'Primary account updated',
        variant: 'success',
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to set primary account:', err);
      emit('semblance://toast', {
        id: `primary_err_${Date.now()}`,
        message: 'Failed to set primary account',
        variant: 'attention',
      }).catch(() => {});
    }
  }, [loadAccounts]);

  const handleRemoveAccount = useCallback(async (accountId: string, connectorId: string) => {
    try {
      await removeConnectorAccount(accountId);
      // Refresh account list
      const updatedAccounts = await listConnectorAccounts(connectorId).catch(() => []);
      // If no accounts remain, update connector status to disconnected
      if (!updatedAccounts || updatedAccounts.length === 0) {
        dispatch({
          type: 'SET_CONNECTOR_STATE',
          connectorId,
          state: { connectorId, status: 'disconnected' as ConnectorState['status'], lastSyncedAt: undefined },
        });
      }
      loadAccounts();
      emit('semblance://toast', {
        id: `remove_ok_${Date.now()}`,
        message: 'Account removed',
        variant: 'success',
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to remove account:', err);
      emit('semblance://toast', {
        id: `remove_err_${Date.now()}`,
        message: 'Failed to remove account',
        variant: 'attention',
      }).catch(() => {});
    }
  }, [dispatch, loadAccounts]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8">
        <ConnectionsScreenUI
          connectors={connectors}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onSync={handleSync}
        />

        {/* Multi-Account Section — shown below the connector cards */}
        {Object.keys(accountsByConnector).length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: '#B8C0C8',
              marginBottom: 16,
            }}>
              CONNECTED ACCOUNTS
            </h2>

            {connectors
              .filter((c) => c.status === 'connected' || c.status === 'syncing')
              .map((connector) => {
                const accounts = accountsByConnector[connector.id] ?? [];
                if (accounts.length === 0) return null;

                return (
                  <div key={connector.id} style={{ marginBottom: 20 }}>
                    <div style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12,
                      fontWeight: 400,
                      color: '#EEF1F4',
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                    }}>
                      {connector.displayName}
                    </div>

                    {accounts.map((account) => (
                      <div key={account.accountId} className="surface-slate" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        marginBottom: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 12,
                            color: '#EEF1F4',
                            letterSpacing: '0.04em',
                          }}>
                            {account.userEmail}
                          </span>
                          {account.isPrimary && (
                            <span style={{
                              fontSize: 10,
                              fontFamily: "'DM Mono', monospace",
                              color: '#6ECFA3',
                              padding: '2px 6px',
                              background: 'rgba(110,207,163,0.08)',
                              borderRadius: 4,
                              letterSpacing: '0.05em',
                            }}>
                              PRIMARY
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {!account.isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(account.accountId)}
                              style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.09)',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 11,
                                color: '#5E6B7C',
                                cursor: 'pointer',
                                fontFamily: "'DM Mono', monospace",
                              }}
                            >
                              Set Primary
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveAccount(account.accountId, connector.id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(176,122,138,0.3)',
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 11,
                              color: '#B07A8A',
                              cursor: 'pointer',
                              fontFamily: "'DM Mono', monospace",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add another account button */}
                    <button
                      type="button"
                      onClick={() => handleConnect(connector.id)}
                      className="surface-slate surface-slate--hoverable"
                      style={{
                        padding: '10px',
                        width: '100%',
                        marginTop: 4,
                        fontSize: 11,
                        color: '#5E6B7C',
                        cursor: 'pointer',
                        fontFamily: "'DM Mono', monospace",
                        letterSpacing: '0.04em',
                        borderStyle: 'dashed',
                      }}
                    >
                      + Add another account
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
