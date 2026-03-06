// Service Registry — Maps action types to their service adapters.
// Adapters are registered at Gateway startup via connector-registration.ts.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';
import { FallbackAdapter } from './fallback-adapter.js';

export class ServiceRegistry {
  private adapters: Map<string, ServiceAdapter> = new Map();
  private defaultAdapter: ServiceAdapter;

  constructor() {
    this.defaultAdapter = new FallbackAdapter();
  }

  /**
   * Register an adapter for a specific action type.
   */
  register(action: ActionType, adapter: ServiceAdapter): void {
    this.adapters.set(action, adapter);
  }

  /**
   * Get the adapter for an action type. Falls back to error response for unregistered actions.
   */
  getAdapter(action: ActionType): ServiceAdapter {
    return this.adapters.get(action) ?? this.defaultAdapter;
  }

  /**
   * Check if a dedicated adapter is registered for an action.
   */
  hasAdapter(action: ActionType): boolean {
    return this.adapters.has(action);
  }
}
