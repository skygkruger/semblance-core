/**
 * ConnectorRouter — Routes connector.* and import.* IPC actions to the correct adapter.
 *
 * Registered in ServiceRegistry for all connector.* and import.* action types.
 * Maps payload.connectorId to the appropriate OAuth/native adapter.
 */

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

export class ConnectorRouter implements ServiceAdapter {
  private adapters: Map<string, ServiceAdapter> = new Map();

  /** Register an adapter for a specific connector ID. */
  registerAdapter(connectorId: string, adapter: ServiceAdapter): void {
    this.adapters.set(connectorId, adapter);
  }

  /** Check if an adapter is registered for a connector ID. */
  hasAdapter(connectorId: string): boolean {
    return this.adapters.has(connectorId);
  }

  /** Get a registered adapter by connector ID. */
  getAdapter(connectorId: string): ServiceAdapter | undefined {
    return this.adapters.get(connectorId);
  }

  /** List all registered connector IDs. */
  listRegistered(): string[] {
    return Array.from(this.adapters.keys());
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const p = payload as Record<string, unknown>;
    const connectorId = p['connectorId'] as string | undefined;

    if (!connectorId) {
      return {
        success: false,
        error: { code: 'MISSING_CONNECTOR_ID', message: 'payload.connectorId is required' },
      };
    }

    const adapter = this.adapters.get(connectorId);
    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_CONNECTOR',
          message: `No adapter registered for connector: ${connectorId}`,
        },
      };
    }

    return adapter.execute(action, payload);
  }
}
