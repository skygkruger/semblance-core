# Extension capabilities (API v1 clients)

Extensions interact with Semblance only through typed clients exported by `@semblance/extension-sdk`. Raw handles are intentionally unavailable.

## Client bundle

```typescript
import type { ExtensionRunnerClientsV1 } from '@semblance/extension-sdk';
```

| Client | Interface | Access |
|--------|-----------|--------|
| Vault | `VaultClient` | Read-only document search + summaries |
| Gateway | `GatewayActionClient` | Typed, audited actions |
| Kernel | `KernelEntitlementClient` | Entitlement snapshot (`isPremium()`) |
| UI | `ExtensionUiSlotClient` | Register components for declared slots |
| Schedule | `ExtensionScheduleClient` | Register cron handlers for declared schedules |
| Health | `ExtensionHealthClient` | Report health + ping runner |
| Migration | `ExtensionMigrationClient` | Schema upgrades + uninstall policy |
| Receipt | `ExtensionReceiptClient` | List audited action receipts |

## Vault (read-only)

```typescript
const results = await ctx.clients.vault.searchDocuments({
  query: 'quarterly report',
  limit: 10,
  sources: ['files'],
});
```

## Gateway (typed actions)

```typescript
const result = await ctx.clients.gateway.executeAction({
  action: 'email.send',
  payload: { to: ['user@example.com'], subject: 'Hi', body: '…' },
  estimatedTimeSavedSeconds: 120,
});
```

Every action is logged to the audit trail before execution. Extensions cannot open HTTP connections directly.

## Kernel (entitlement)

```typescript
if (!ctx.clients.kernel.isPremium()) {
  return { error: 'Digital Representative entitlement required' };
}
```

Extensions **cannot** bypass `PremiumGate`. Kernel client reflects the same authority.

## UI slots

```typescript
ctx.uiSlots.register({
  slotId: 'settings.capabilities',
  registration: { component: MySettingsPanel, priority: 10 },
});
```

## Schedules

```typescript
await ctx.schedules.register({
  spec: { scheduleId: 'daily_digest', cron: '0 7 * * *', timezone: 'local' },
  handler: async () => { /* … */ },
});
```

## Health

```typescript
await ctx.health.report({
  extensionId: ctx.extensionId,
  status: 'healthy',
  checks: [{ name: 'database', status: 'healthy', observedAt: new Date().toISOString() }],
  reportedAt: new Date().toISOString(),
});
```

## Migration

```typescript
const state = ctx.migration.getState();
await ctx.migration.runUpgrade(state.schemaVersion, state.schemaVersion + 1);
const { policy } = await ctx.migration.prepareUninstall();
```

## Receipts

```typescript
const recent = await ctx.receipts.listRecent(20);
```

Receipts surface audit outcomes — not raw audit storage.

## Runner helpers

`@semblance/extension-runner` provides test/dev adapters:

- `buildExtensionRunnerClientsV1`
- `buildExtensionInitContextV1`
- `createRecordingVaultClient`, `createRecordingGatewayClient`, …

See `packages/extension-runner/tests/contracts-v1.test.ts`.
