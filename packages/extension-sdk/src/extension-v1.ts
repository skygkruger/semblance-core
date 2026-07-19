import type { ExtensionRunnerClientsV1 } from './clients.js';
import type { ExtensionHealthClient } from './health.js';
import type { ExtensionMigrationClient } from './migration.js';
import type { ExtensionReceiptClient } from './receipt.js';
import type { ExtensionScheduleClient } from './schedule.js';
import type { ExtensionUiSlotClient } from './ui-slot.js';

export interface ExtensionToolDefinitionV1 {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ExtensionToolHandlerResultV1 {
  result?: unknown;
  error?: string;
}

export type ExtensionToolHandlerV1 = (
  args: Record<string, unknown>,
) => Promise<ExtensionToolHandlerResultV1> | ExtensionToolHandlerResultV1;

export interface ExtensionToolV1 {
  definition: ExtensionToolDefinitionV1;
  handler: ExtensionToolHandlerV1;
  isLocal: boolean;
  actionType?: string;
}

/**
 * Mediated init context for Extension API v1.
 * No raw Vault/Gateway/OS/database/network handles.
 */
export interface ExtensionInitContextV1 {
  extensionId: string;
  dataDir: string;
  model?: string;
  clients: ExtensionRunnerClientsV1;
  uiSlots: ExtensionUiSlotClient;
  schedules: ExtensionScheduleClient;
  health: ExtensionHealthClient;
  migration: ExtensionMigrationClient;
  receipts: ExtensionReceiptClient;
}

export interface SemblanceExtensionV1 {
  id: string;
  name: string;
  version: string;
  tools?: ExtensionToolV1[];
  insightTypes?: string[];
  initialize?: (ctx: ExtensionInitContextV1) => Promise<void> | void;
}
