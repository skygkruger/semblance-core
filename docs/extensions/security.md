# Extension security model

Third-party extensions run **out-of-process / sandboxed** with **explicit permissions**. Security goals:

1. No ambient filesystem, network, or secret access
2. No raw Vault, Gateway, or OS handles in the SDK surface
3. No bypass of PremiumGate or Kernel entitlement authority
4. Tamper-evident signed manifests with publisher trust (Slice 12.2)

## Sandbox enforcement

The extension runner (`@semblance/extension-runner`):

- Extracts signed tarballs to a temp directory
- Executes extension code inside `createExtensionSandbox`
- Denies undeclared network (`fetch`, `http`, etc.) and filesystem writes outside allowed paths
- Proxies database access to a deny-by-default stub in signed mode

## Mediated clients only

`@semblance/extension-sdk` exports `*Client` interfaces — never `*Handle` types. The SDK includes `assertSdkSurfaceNoRawHandles()` and tests in `packages/extension-sdk/tests/no-raw-handles.test.ts` to guard regressions.

Forbidden export patterns include:

- `VaultHandle`, `GatewayHandle`, `OsHandle`
- `RawVault`, `RawGateway`, `DatabaseHandle`, …

## Permission declaration

Every data read, action, network destination, UI slot, and schedule must be listed in the capability manifest. The runner validates registrations against manifest arrays (see [manifest.md](./manifest.md)).

Undeclared access is rejected at runtime and will be adversarially tested in the Slice 12.4 conformance suite.

## Signing and verification

- Manifests are signed Ed25519 (`signatureKeyId` → publisher trust store)
- Artifact bytes are pinned with `contentHash` / `artifactHash`
- `verifySignedExtensionArtifact` rejects unsigned, expired, incompatible, or tampered packages

## Entitlement boundaries

Paid capabilities require a matching `entitlement` field in the manifest **and** active Kernel entitlement. Extensions cannot elevate privilege locally.

## Reporting issues

Security-sensitive regressions (sandbox escape, handle leak, entitlement bypass) are critical incidents. Follow Semblance security escalation in `CLAUDE.md`.
