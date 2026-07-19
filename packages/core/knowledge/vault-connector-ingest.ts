/**
 * Injectable hooks for dual-writing connector sync results into the vault event log.
 * Implementation lives in @semblance/vault — core defines only the wiring contract.
 */

import type { RawCalendarEvent } from './calendar-indexer.js';
import type { RawEmailMessage } from './email-indexer.js';

export interface VaultConnectorEmailIndexedParams {
  message: RawEmailMessage;
  accountId: string;
  indexedEmailId: string;
  occurredAt?: string;
}

export interface VaultConnectorCalendarIndexedParams {
  event: RawCalendarEvent;
  accountId: string;
  indexedEventId: string;
  occurredAt?: string;
}

export interface VaultConnectorIngestHooks {
  onEmailIndexed(params: VaultConnectorEmailIndexedParams): void | Promise<void>;
  onCalendarEventIndexed(params: VaultConnectorCalendarIndexedParams): void | Promise<void>;
}
