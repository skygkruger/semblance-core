// Service Adapter Interface — Contract for all service adapters.
// Real adapters arrive in Sprint 2. The interface is defined now.

import type { ActionType } from '@semblance/core';

export interface ServiceAdapter {
  execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }>;
}
