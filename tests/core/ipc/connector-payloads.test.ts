/**
 * Connector IPC Payload Schema Tests — Validate Zod schemas for 7 new action types.
 */

import { describe, it, expect } from 'vitest';
import {
  ConnectorAuthPayload,
  ConnectorAuthStatusPayload,
  ConnectorDisconnectPayload,
  ConnectorSyncPayload,
  ConnectorListItemsPayload,
  ImportRunPayload,
  ImportStatusPayload,
  ActionPayloadMap,
} from '../../../packages/core/types/ipc.js';

describe('Connector IPC Payload Schemas', () => {
  it('ConnectorAuthPayload validates correct payload', () => {
    const result = ConnectorAuthPayload.safeParse({
      connectorId: 'spotify',
    });
    expect(result.success).toBe(true);
  });

  it('ConnectorAuthPayload accepts optional apiKey', () => {
    const result = ConnectorAuthPayload.safeParse({
      connectorId: 'readwise',
      apiKey: 'rw_abc123',
    });
    expect(result.success).toBe(true);
  });

  it('ConnectorAuthPayload rejects missing connectorId', () => {
    const result = ConnectorAuthPayload.safeParse({});
    expect(result.success).toBe(false);
  });

  it('ConnectorAuthStatusPayload validates correct payload', () => {
    const result = ConnectorAuthStatusPayload.safeParse({
      connectorId: 'github',
    });
    expect(result.success).toBe(true);
  });

  it('ConnectorDisconnectPayload validates correct payload', () => {
    const result = ConnectorDisconnectPayload.safeParse({
      connectorId: 'oura',
    });
    expect(result.success).toBe(true);
  });

  it('ConnectorSyncPayload validates with optional params', () => {
    const result = ConnectorSyncPayload.safeParse({
      connectorId: 'spotify',
      since: '2025-01-01T00:00:00Z',
      limit: 100,
    });
    expect(result.success).toBe(true);
  });

  it('ConnectorSyncPayload rejects invalid datetime', () => {
    const result = ConnectorSyncPayload.safeParse({
      connectorId: 'spotify',
      since: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('ConnectorListItemsPayload validates with pagination', () => {
    const result = ConnectorListItemsPayload.safeParse({
      connectorId: 'github',
      pageToken: 'abc123',
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it('ImportRunPayload validates correct payload', () => {
    const result = ImportRunPayload.safeParse({
      sourcePath: '/home/user/exports/chrome-history.json',
      sourceType: 'browser_history',
    });
    expect(result.success).toBe(true);
  });

  it('ImportStatusPayload validates with optional importId', () => {
    const valid1 = ImportStatusPayload.safeParse({});
    expect(valid1.success).toBe(true);

    const valid2 = ImportStatusPayload.safeParse({ importId: 'abc123' });
    expect(valid2.success).toBe(true);
  });

  it('all 7 connector action types are in ActionPayloadMap', () => {
    expect(ActionPayloadMap['connector.auth']).toBeDefined();
    expect(ActionPayloadMap['connector.auth_status']).toBeDefined();
    expect(ActionPayloadMap['connector.disconnect']).toBeDefined();
    expect(ActionPayloadMap['connector.sync']).toBeDefined();
    expect(ActionPayloadMap['connector.list_items']).toBeDefined();
    expect(ActionPayloadMap['import.run']).toBeDefined();
    expect(ActionPayloadMap['import.status']).toBeDefined();
  });
});
