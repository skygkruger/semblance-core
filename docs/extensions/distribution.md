# Distributing signed extensions

Semblance distributes extensions as **signed artifacts**, not npm packages loaded at runtime from the public registry.

## Artifact layout

```
my-extension-1.0.0.tgz
├── package.json          # "type": "module", main entry
└── index.mjs             # exports createExtension()

extension.manifest.json   # signed manifest (artifact or capability v1)
```

## Signing workflow

1. Build tarball; compute `sha256:…` hash.
2. Author manifest with declared permissions (see [manifest.md](./manifest.md)).
3. Sign canonical JSON payload (signature fields excluded) with publisher Ed25519 key.
4. Publish manifest + tarball hash to your distribution channel.

Verification API:

```typescript
import { verifySignedExtensionArtifact, loadDrPublisherKeys } from '@semblance/extension-sdk';

const result = verifySignedExtensionArtifact({
  manifest,
  artifactBytes,
  coreVersion: '1.0.0',
  publisherKeys: loadDrPublisherKeys(),
});
```

## Loading in Semblance

Production path (Slice 12.3+):

- User installs via **Capabilities** screen with explicit permission review
- Kernel trust store validates publisher + revocation policy

Development / CI path:

```typescript
import { loadSignedDigitalRepresentative } from '@semblance/extension-runner';

await loadSignedDigitalRepresentative({
  manifestPath: '/path/to/extension.manifest.json',
  clients: { vault, gateway, kernel },
});
```

## Marketplace (Slice 12.5)

A minimal marketplace may publish signed artifact hashes, pricing declarations, and compatibility metadata **without storing user content** and **without implying Semblance endorsement** beyond stated review level. Marketplace ships only after conformance gates are green.

## Digital Representative

The proprietary `@semblance/dr` extension in `semblence-representative` uses the same `createExtension()` contract. Signed DR artifacts are verified with pinned keys in `release/keys/dr-publisher-keys.json`.

## Compatibility

Declare `platformApi: "2026-07-18"` and test against `EXTENSION_PLATFORM_API_V1`. Breaking API changes require a new platform API version and manifest schema revision — never silent drift.
