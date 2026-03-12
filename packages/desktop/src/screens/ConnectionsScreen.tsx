/**
 * ConnectionsScreen — Uses the Storybook ConnectionsScreen component from @semblance/ui.
 * This is a thin wrapper that loads connector data and passes it to the Storybook component.
 */

import { useState, useCallback, useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { ConnectionsScreen as ConnectionsScreenUI } from '@semblance/ui';
import type { ConnectorEntry } from '@semblance/ui';
import { ipcSend, getConnectedServices } from '../ipc/commands';
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
    getConnectedServices().then((connectedIds) => {
      if (connectedIds && Array.isArray(connectedIds)) {
        for (const connectorId of connectedIds) {
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
      }
    }).catch(() => {});
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
        // Auth succeeded — update connector state so UI shows "Connected"
        dispatch({
          type: 'SET_CONNECTOR_STATE',
          connectorId,
          state: {
            connectorId,
            status: 'connected',
            lastSyncedAt: new Date().toISOString(),
          },
        });
        emit('semblance://toast', {
          id: `conn_ok_${Date.now()}`,
          message: `${connectorId} connected successfully`,
          variant: 'success',
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`Failed to connect ${connectorId}:`, err);
      emit('semblance://toast', {
        id: `conn_err_${Date.now()}`,
        message: `Failed to connect ${connectorId}`,
        variant: 'attention',
      }).catch(() => {});
    }
  }, [dispatch]);

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
    } catch (err) {
      console.error(`Failed to disconnect ${connectorId}:`, err);
    }
  }, [dispatch]);

  const handleSync = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.sync',
        payload: { connectorId },
      });
    } catch (err) {
      console.error(`Failed to sync ${connectorId}:`, err);
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8">
        <ConnectionsScreenUI
          connectors={connectors}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onSync={handleSync}
        />
      </div>
    </div>
  );
}
