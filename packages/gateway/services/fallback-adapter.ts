// Fallback Service Adapter — Returns error for unregistered action types.
// Real adapters are registered via connector-registration.ts at Gateway startup.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

export class FallbackAdapter implements ServiceAdapter {
  async execute(action: ActionType, _payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    return {
      success: false,
      error: {
        code: 'NO_ADAPTER',
        message: `No service adapter registered for action: ${action}`,
      },
    };
  }
}
