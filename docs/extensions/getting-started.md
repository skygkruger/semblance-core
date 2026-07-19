# Getting started with Semblance extensions

Semblance extensions are **signed capabilities** that run inside the extension runner sandbox. They receive **mediated clients** from `@semblance/extension-sdk` — never raw Vault, Gateway, or OS handles.

## Prerequisites

- Node.js 20+
- `@semblance/extension-sdk` (ships with Semblance core)
- A publisher signing key (Ed25519) registered with the Kernel trust store (Slice 12.2)

## Extension API v1

The frozen surface is identified by:

| Constant | Value |
|----------|-------|
| `EXTENSION_API_V1` | `v1` |
| `EXTENSION_PLATFORM_API_V1` | `2026-07-18` |
| Manifest schema | `extension-manifest-v1` |

Your capability manifest must declare `platformApi: "2026-07-18"` and list every permission explicitly.

## Minimal extension

```typescript
import type { SemblanceExtensionV1, ExtensionInitContextV1 } from '@semblance/extension-sdk';

export function createExtension(): SemblanceExtensionV1 {
  return {
    id: 'com.example.hello',
    name: 'Hello Capability',
    version: '1.0.0',
    tools: [
      {
        definition: {
          name: 'hello_world',
          description: 'Return a greeting',
          parameters: { type: 'object', properties: {} },
        },
        handler: async () => ({ result: 'Hello from a sovereign extension' }),
        isLocal: true,
      },
    ],
    async initialize(ctx: ExtensionInitContextV1) {
      await ctx.health.report({
        extensionId: ctx.extensionId,
        status: 'healthy',
        checks: [{ name: 'boot', status: 'healthy', observedAt: new Date().toISOString() }],
        reportedAt: new Date().toISOString(),
      });
    },
  };
}
```

## Init context (mediated only)

`ExtensionInitContextV1` exposes:

- `clients.vault` — read-only document search
- `clients.gateway` — typed action transport (audited)
- `clients.kernel` — entitlement snapshot (cannot bypass PremiumGate)
- `uiSlots`, `schedules`, `health`, `migration`, `receipts` — see linked docs

Legacy in-process DR loading may still receive deprecated handles during migration; **new third-party extensions must use v1 clients only**.

## Build and sign

1. Bundle your extension as a tarball (`index.mjs` + `package.json`).
2. Write a signed artifact manifest (Slice 6) or full capability manifest v1 (see [manifest.md](./manifest.md)).
3. Install through Capabilities UI (Slice 12.3) or load via `loadSignedDigitalRepresentative` in tests.

## Next steps

- [Manifest](./manifest.md) — declare permissions
- [Capabilities](./capabilities.md) — client interfaces
- [Security](./security.md) — sandbox rules
- [Distribution](./distribution.md) — publishing signed artifacts

## Runner example

The extension runner test `packages/extension-runner/tests/contracts-v1.test.ts` demonstrates building a v1 init context from the protocol fixture — use it as a reference implementation.
