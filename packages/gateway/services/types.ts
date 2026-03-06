// Service Adapter Interface — Contract for all service adapters.
// Adapters are registered at Gateway startup via connector-registration.ts.

import type { ActionType } from '@semblance/core';

export interface ServiceAdapter {
  execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }>;
}
