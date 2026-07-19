import { describe, expect, it } from 'vitest';
import {
  PermissionEnforcementError,
  createTestEnforcedClients,
} from '../src/permission-enforcement.js';

describe('extension runner permission enforcement', () => {
  it('blocks gateway actions outside granted action capabilities', async () => {
    const clients = createTestEnforcedClients({
      dataCapabilities: ['email.read'],
      actionCapabilities: ['email.send'],
      networkDestinations: ['api.google.com'],
      tools: [],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    });

    await expect(
      clients.gateway.executeAction({ action: 'calendar.create', payload: {} }),
    ).rejects.toBeInstanceOf(PermissionEnforcementError);
  });

  it('allows granted gateway actions', async () => {
    const clients = createTestEnforcedClients({
      dataCapabilities: ['email.read'],
      actionCapabilities: ['email.send'],
      networkDestinations: ['api.google.com'],
      tools: [],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    });

    const result = await clients.gateway.executeAction({ action: 'email.send', payload: {} });
    expect(result.status).toBe('success');
  });

  it('blocks undeclared UI slot registration when not granted', () => {
    const clients = createTestEnforcedClients({
      dataCapabilities: [],
      actionCapabilities: [],
      networkDestinations: [],
      tools: [],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    });

    expect(() =>
      clients.uiSlots.register({
        slotId: 'settings.capabilities',
        registration: { component: () => null },
      }),
    ).toThrow(/not in granted permissions/);
  });

  it('blocks vault reads when no data capabilities are granted', async () => {
    const clients = createTestEnforcedClients({
      dataCapabilities: [],
      actionCapabilities: [],
      networkDestinations: [],
      tools: [],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    });

    await expect(clients.vault.searchDocuments({ query: 'test' })).rejects.toBeInstanceOf(
      PermissionEnforcementError,
    );
  });
});
