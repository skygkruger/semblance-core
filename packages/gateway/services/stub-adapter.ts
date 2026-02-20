// Stub Service Adapter — Returns stub responses for all actions.
// Will be replaced by real adapters in Sprint 2.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

export class StubAdapter implements ServiceAdapter {
  async execute(action: ActionType, _payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    return {
      success: true,
      data: {
        stub: true,
        action,
        message: 'Service adapter not yet implemented. This is a stub response.',
      },
    };
  }
}
