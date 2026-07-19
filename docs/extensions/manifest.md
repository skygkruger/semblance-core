# Extension manifest (v1)

Capability manifests use schema **`extension-manifest-v1`** (`schemaVersion: 1`). The canonical JSON Schema lives at:

`packages/protocol/schemas/extension-manifest-v1.schema.json`

TypeScript parsing:

```typescript
import { parseExtensionManifestV1, EXTENSION_PLATFORM_API_V1 } from '@semblance/extension-sdk';

const manifest = parseExtensionManifestV1(json);
// manifest.platformApi must equal EXTENSION_PLATFORM_API_V1 ('2026-07-18')
```

## Required fields

| Field | Purpose |
|-------|---------|
| `id` | Stable extension identifier (e.g. `com.example.inbox`) |
| `publisher` | Publisher display name |
| `version` | Semver release |
| `platformApi` | Must be `2026-07-18` for API v1 |
| `contentHash` | `sha256:…` of packaged artifact |
| `entitlement` | Paid SKU id or `null` for free |
| `dataCapabilities` | Declared read scopes (e.g. `email.read`) |
| `actionCapabilities` | Declared write/action scopes |
| `networkDestinations` | Host allowlist for Gateway actions |
| `tools` | LLM tool names exposed by the extension |
| `insightTypes` | Proactive insight type strings |
| `uiSlots` | UI injection points (see below) |
| `schedules` | Cron schedule ids |
| `modelRequirements` | Local model constraints |
| `runtimeRequirements` | Sandbox CPU/memory + `platformApi` |
| `migration` | Schema version + uninstall policy |
| `validFrom` / `validUntil` | Manifest validity window |
| `signatureKeyId` / `signature` | Ed25519 publisher signature |

## UI slots and schedules

Every slot or schedule your extension registers at runtime **must** appear in the manifest arrays. The runner rejects undeclared registrations.

Known v1 UI slots (non-exhaustive):

- `settings.digital_representative`
- `settings.capabilities`
- `chat.sidebar`
- `dashboard.widget`

## Migration / uninstall

```json
"migration": {
  "schemaVersion": 1,
  "uninstall": "retain_user_data"
}
```

`uninstall` must be one of: `delete`, `retain_user_data`, `ask`.

## Signed artifact manifest (Slice 6)

Digital Representative shipping also uses a compact signed artifact manifest (`protocolVersion: 1`) verified by `verifySignedExtensionArtifact`. Both formats coexist:

- **Capability manifest v1** — permission center + conformance (Slice 12+)
- **Artifact manifest** — tarball hash + publisher signature (Slice 6)

Bridge artifact permissions into capability declarations before install UX ships.

## Fixture

Cross-repo fixture: `packages/protocol/fixtures/cross-repo/extension-manifest-v1.json`
