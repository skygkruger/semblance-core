// Service Registry — Maps action types to their service adapters.
// Real adapters plug in here in Sprint 2.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';
import { StubAdapter } from './stub-adapter.js';

export class ServiceRegistry {
  private adapters: Map<string, ServiceAdapter> = new Map();
  private defaultAdapter: ServiceAdapter;

  constructor() {
    this.defaultAdapter = new StubAdapter();
  }

  /**
   * Register an adapter for a specific action type.
   */
  register(action: ActionType, adapter: ServiceAdapter): void {
    this.adapters.set(action, adapter);
  }

  /**
   * Get the adapter for an action type. Falls back to stub adapter.
   */
  getAdapter(action: ActionType): ServiceAdapter {
    return this.adapters.get(action) ?? this.defaultAdapter;
  }

  /**
   * Check if a real (non-stub) adapter is registered for an action.
   */
  hasRealAdapter(action: ActionType): boolean {
    return this.adapters.has(action);
  }
}
