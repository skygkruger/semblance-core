# Semblance Extension API

Extensions allow optional packages (like `@semblance/dr`) to register tools, insight trackers, gateway adapters, and UI slots with the Semblance core without creating static dependencies.

## Architecture

```
semblance-core (public, MIT)
  └── packages/core/extensions/    ← Extension framework (this directory)
       ├── types.ts                ← Interface definitions
       ├── loader.ts               ← Dynamic import loader
       ├── ui-slots.ts             ← UI slot registry
       └── index.ts                ← Barrel exports

@semblance/dr (private, proprietary)
  └── Implements SemblanceExtension interface
       └── Discovered at runtime via dynamic import()
```

## Extension Interface

An extension implements `SemblanceExtension`:

```typescript
import type { SemblanceExtension } from '@semblance/core';

const extension: SemblanceExtension = {
  id: '@semblance/dr',
  name: 'Digital Representative',
  version: '1.0.0',
  tools: [/* ExtensionTool[] */],
  insightTrackers: [/* ExtensionInsightTracker[] */],
  gatewayAdapters: [/* ExtensionGatewayAdapter[] */],
  uiSlots: { /* name → component mappings */ },
};
```

### Extension Tools

Tools are registered with the Orchestrator and become available to the LLM during chat:

```typescript
const tool: ExtensionTool = {
  definition: {
    name: 'query_spending',
    description: 'Query spending by category and date range',
    parameters: { /* JSON Schema */ },
  },
  handler: async (args) => {
    // Implementation
    return { result: { total: 142.50, category: 'dining' } };
  },
  isLocal: true,           // true = no Gateway IPC, handled in-process
  actionType: 'finance.fetch_transactions',  // optional Gateway action mapping
};
```

### Insight Trackers

Trackers are registered with the ProactiveEngine and generate insights during each polling cycle:

```typescript
const tracker: ExtensionInsightTracker = {
  generateInsights(): ProactiveInsight[] {
    return [{
      id: 'spending-alert-1',
      type: 'spending-alert',    // Extension types are open strings
      priority: 'high',
      title: 'Unusual spending detected',
      summary: 'Restaurant spending is 3x your monthly average',
      sourceIds: ['txn-123', 'txn-456'],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 30,
    }];
  },
};
```

### Gateway Adapters

Adapters handle external service integrations through the Gateway:

```typescript
const adapter: ExtensionGatewayAdapter = {
  actionType: 'finance.fetch_transactions',
  createAdapter: (ctx) => {
    // ctx provides db, oauthTokenManager, auditTrail, etc.
    return new PlaidAdapter(ctx.oauthTokenManager);
  },
};
```

### UI Slots

Extensions can fill named rendering slots in the desktop/mobile apps:

```typescript
import { registerSlot } from '@semblance/core';

registerSlot('financial-dashboard', FinancialDashboard, { priority: 10 });
registerSlot('finance-settings', FinanceSettingsSection, { priority: 10 });
```

The app checks for filled slots and renders them (or shows nothing / an upgrade prompt when empty):

```typescript
import { getSlot } from '@semblance/core';

const DashboardSlot = getSlot('financial-dashboard');
// DashboardSlot is null when @semblance/dr is not installed
```

## Lifecycle

### Boot Sequence

1. App calls `loadExtensions()` which dynamically imports known extension packages
2. `createOrchestrator({ extensions })` wires tools into the Orchestrator
3. ProactiveEngine receives trackers via `engine.registerTracker(tracker)`
4. Gateway receives adapters via `gateway.registerExtensionAdapters(adapters)`
5. UI slots are filled by extension's `uiSlots` mappings

### Registration (Manual)

Extensions can also be registered manually for testing or custom setups:

```typescript
import { registerExtension, getLoadedExtensions } from '@semblance/core';

registerExtension(myExtension);
const all = getLoadedExtensions(); // synchronous access
```

## Creating an Extension Package

An extension package must export a `createExtension()` function:

```typescript
// @semblance/dr/index.ts
import type { SemblanceExtension } from '@semblance/core';

export function createExtension(): SemblanceExtension {
  return {
    id: '@semblance/dr',
    name: 'Digital Representative',
    version: '1.0.0',
    tools: [/* ... */],
    insightTrackers: [/* ... */],
    gatewayAdapters: [/* ... */],
  };
}
```

The loader discovers this function via dynamic `import()`. When the package is not installed, the import fails silently and no extension is loaded.

## Insight Type System

Core insight types are a closed set defined in `ProactiveInsightType`. Extension insight types are open strings:

```typescript
// Core types (autocomplete-friendly)
type ProactiveInsightType =
  | 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict'
  | 'birthday' | 'contact_frequency'
  | 'location-reminder' | 'weather-alert'
  | 'commute-departure' | 'weather-summary';

// Extension types are any string
interface ProactiveInsight {
  type: ProactiveInsightType | (string & {});  // open union
}
```

## Graceful Degradation

When no extensions are installed:
- Orchestrator uses only `BASE_TOOLS` (core tools)
- ProactiveEngine runs only core trackers (calendar, email, location)
- Gateway has no extension adapters registered
- UI slots return `null` (app shows nothing or upgrade prompt)
- `loadExtensions()` returns an empty array
- Zero runtime errors, zero console warnings
