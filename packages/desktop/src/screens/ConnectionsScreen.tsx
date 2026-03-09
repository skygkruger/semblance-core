/**
 * ConnectionsScreen — Uses the Storybook ConnectionsScreen component from @semblance/ui.
 * This is a thin wrapper that loads connector data and passes it to the Storybook component.
 */

import { useState, useCallback, useEffect } from 'react';
import { ConnectionsScreen as ConnectionsScreenUI } from '@semblance/ui';
import type { ConnectorEntry } from '@semblance/ui';
import { ipcSend } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';
import {
  createDefaultConnectorRegistry,
} from '@semblance/core/importers/connector-registry';
import type {
  ConnectorCategory as CoreConnectorCategory,
  ConnectorState,
} from '@semblance/core/importers/connector-status';
import { useAppState } from '../state/AppState';

const registry = createDefaultConnectorRegistry();

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
  const license = useLicense();
  const [connectors, setConnectors] = useState<ConnectorEntry[]>([]);

  useEffect(() => {
    const platform = getCurrentPlatform();
    const allConnectors = registry.listByPlatform(platform);
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

  const handleConnect = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.auth',
        payload: { connectorId },
      });
    } catch (err) {
      console.error(`Failed to connect ${connectorId}:`, err);
    }
  }, []);

  const handleDisconnect = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.disconnect',
        payload: { connectorId },
      });
    } catch (err) {
      console.error(`Failed to disconnect ${connectorId}:`, err);
    }
  }, []);

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
