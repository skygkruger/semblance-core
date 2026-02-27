# Security Audit Findings — Pre-Launch Remediation

**Audit Date:** 2026-02-27
**Scope:** Full pre-launch security audit across 6 areas
**Total Findings:** 31
**Remediation Status:** All launch-blocking findings resolved

---

## Summary

| Severity | Count | Launch-Blocking | Status |
|----------|-------|-----------------|--------|
| CRITICAL | 3 | All 3 | PASS |
| HIGH | 8 | All 8 | PASS |
| MEDIUM | 12 | 7 of 12 | PASS |
| LOW | 8 | 0 | ACCEPTED |

---

## Findings Detail

### CRITICAL

| # | Finding | Area | Status | Remediation |
|---|---------|------|--------|-------------|
| 1 | Prompt injection via knowledge graph — retrieved content injected as `role: 'system'` messages with zero sanitization | Area 5 | **PASS** | Created `content-sanitizer.ts` with role prefix stripping, control token removal, instruction marker neutralization. Changed retrieved context to `role: 'user'` with explicit data boundary markers. Added canary instruction to system prompt. Web fetch/search results get full sanitization before re-injection. |
| 2 | No content sanitization infrastructure exists | Area 5 | **PASS** | New file `packages/core/agent/content-sanitizer.ts` with `sanitizeRetrievedContent()`, `wrapInDataBoundary()`, and `INJECTION_CANARY`. Applied to all tool result re-injection paths in orchestrator. |
| 3 | Credential encryption key stored as plain file — `~/.semblance/credential.key` readable by any local process | Area 3 | **PASS** | Created `KeyStorage` interface with `KeychainKeyStorage` (Tauri stronghold) and `FileKeyStorage` (headless fallback). `encryption.ts` uses async `initEncryption()`. Migration function reads legacy file, stores in keychain, securely deletes file. `premium-gate.ts` no longer stores `license_key` in SQLite — uses OS keychain via `LicenseKeyStorage`. |

### HIGH

| # | Finding | Area | Status | Remediation |
|---|---------|------|--------|-------------|
| 4 | No IPC replay protection — no timestamp TTL, no request ID dedup | Area 1 | **PASS** | Added 30-second timestamp freshness check and 10,000-entry rolling request ID dedup set to `validator.ts`. Stale and replayed requests rejected before execution. |
| 5 | `ActionRequest.payload` uses `z.record(z.unknown())` — wide-open envelope type | Area 1 | **PASS** | Added `.strict()` to all 65 payload schemas in `ActionPayloadMap`. Extra fields now rejected instead of silently stripped. |
| 6 | SMTP adapter ties `rejectUnauthorized` to `useTLS` — can disable TLS cert verification | Area 2 | **PASS** | Changed `rejectUnauthorized: credential.useTLS` to `rejectUnauthorized: true` in both SMTP connection paths. Certificates always verified regardless of TLS mode setting. |
| 7 | BoundaryEnforcer never wired into orchestrator — financial/legal/irreversibility checks bypassed | Area 1/5 | **PASS** | Imported and instantiated `BoundaryEnforcer` in orchestrator constructor. `checkBoundaries()` called before all action dispatch (both Gateway-routed and extension tools). Boundary escalation overrides autonomy tier to force approval. |
| 8 | Extension tools bypass ALL autonomy/audit checks | Area 1/5 | **PASS** | Extension tool dispatch block now checks autonomy tier, runs boundary checks, logs to audit trail, and queues for approval when escalation triggers. Extension tools no longer bypass oversight. |
| 9 | `entitlements.plist` grants `network.server` — sandbox-config.ts says denied | Area 6 | **PASS** | Removed `com.apple.security.network.server` from entitlements.plist. Added alignment tests parsing both files. |
| 10 | `entitlements.plist` grants microphone — sandbox-config.ts says denied | Area 6 | **PASS** | Removed `com.apple.security.device.microphone` and `com.apple.security.device.audio-input` from entitlements.plist. sandbox-config.ts synced with actual grants. |
| 11 | Privacy audit doesn't flag `fetch()` in desktop frontend | Area 6 | **PASS** | Added `fetch()` scanning for all desktop `.ts/.tsx` files to privacy audit script. Only `contexts/LicenseContext.tsx` is allowlisted (documented as user-initiated Stripe portal call). |

### MEDIUM

| # | Finding | Area | Status | Remediation |
|---|---------|------|--------|-------------|
| 12 | Zod schemas silently strip unknown fields | Area 1 | **PASS** | All `ActionPayloadMap` schemas now use `.strict()`. See finding #5. |
| 13 | Allowlist domain matching not case-normalized | Area 1 | **PASS** | Added `normalizeDomain()` method: lowercase + strip trailing dots. Applied in both `isAllowed()` and `addService()`. |
| 14 | Unix domain socket file has default permissions | Area 1 | **PASS** | Added `chmodSync(socketPath, 0o600)` after `listen()` on Unix. Per-user pipe name on Windows. |
| 15 | SSRF: redirects not validated per-hop | Area 1 | **PASS** | Changed from `redirect: 'follow'` to `redirect: 'manual'`. Each redirect target validated against SSRF rules (scheme + private IP check) before following. MAX_REDIRECTS = 5 enforced. |
| 16 | Token revocation sends token in URL query string | Area 2 | **PASS** | Moved token from `?token=${accessToken}` URL parameter to POST body via `URLSearchParams`. |
| 17 | No file size limits on parser input | Area 4 | **PASS** | Created `safe-read.ts` with `safeReadFileSync()` — enforces 100MB default limit with `statSync` size check before reading. |
| 18 | No CSV formula injection protection | Area 4 | **PASS** | Created `csv-sanitizer.ts` with `sanitizeCsvCell()` — strips leading `=`, `+`, `-`, `@`, `\t`, `\r` from cell values. Applied to all CSV parsers (YNAB, Mint, Strava, Goodreads, LinkedIn). |
| 19 | Directory walkers use `statSync` (follows symlinks) | Area 4 | **PASS** | Created `safeWalkDirectory()` using `lstatSync` to detect and skip symlinks. Prevents symlink-based path traversal. All directory-walking parsers updated. |
| 20 | SQL template literal interpolation in privacy modules | Area 4 | **PASS** | Added validated whitelists (`KNOWN_TABLES`, `KNOWN_GROUP_COLUMNS`) with `assertKnownTable()` / `assertKnownColumn()`. All table/column names validated before interpolation. Double-quoted identifiers in SQL. |
| 21 | License key stored in plaintext in SQLite | Area 3 | **PASS** | Removed `license_key` column from SQLite schema. Keys stored in OS keychain via `LicenseKeyStorage`. Migration removes column from legacy databases. `disconnect()` clears both keychain and SQLite. |
| 22 | Autonomy decides on action type only, not payload | Area 5 | **PASS** | `BoundaryEnforcer.checkBoundaries()` now receives full payload. Financial threshold, legal language, and irreversibility checks examine payload content, not just action type. |
| 23 | XML parsers don't reject DOCTYPE ENTITY (XXE risk) | Area 4 | **PASS** | Created `rejectXmlEntities()` in `safe-read.ts` — checks first 4KB for `<!DOCTYPE...<!ENTITY` pattern. Applied to Apple Health XML and Evernote export parsers. |

### LOW (Defense-in-Depth — Accepted Risks)

| # | Finding | Area | Status | Rationale |
|---|---------|------|--------|-----------|
| 24 | Generic `service.api_call` payload schema is broad | Area 1 | **ACCEPTED** | By design — this is the generic authorized API call type. The allowlist, rate limiter, and anomaly detector provide defense at the Gateway level rather than schema level. |
| 25 | Allowlist can be bypassed for `service.api_call` if domain matches | Area 1 | **ACCEPTED** | By design — once a user authorizes a domain, Semblance should be able to make API calls to it. The allowlist is the authorization mechanism, not a restriction on authorized services. |
| 26 | In-memory rate limiter state lost on Gateway restart | Area 1 | **ACCEPTED** | Acceptable risk. Rate limits are defense-in-depth against runaway automation. A Gateway restart (rare event) resetting the counters is a minor gap — the audit trail still records all actions for review. Persistent rate limiting adds complexity without proportional security benefit for a local-only application. |
| 27 | OAuth token refresh response not Zod-validated | Area 2 | **PASS** | Added `RefreshTokenResponseSchema` Zod validation for refresh token responses. Originally listed as LOW but fixed alongside finding #16. |
| 28 | PKCE `codeVerifier` persists as instance field after use | Area 2 | **PASS** | Added `this.codeVerifier = null` after use in `buildTokenExchangeBody()`. Prevents concurrent flow cross-contamination. Originally listed as LOW but fixed alongside finding #6. |
| 29 | Token exchange response uses `as` cast instead of Zod | Area 2 | **PASS** | Added `TokenResponseSchema` Zod validation replacing unsafe `as` cast. Fixed alongside finding #16. |
| 30 | Named pipe on Windows not per-user scoped | Area 1 | **PASS** | Added per-user pipe name suffix derived from `userInfo().uid` or `userInfo().username`. Fixed alongside finding #14. |
| 31 | No uninstall cleanup (leftover data on disk) | Area 6 | **ACCEPTED** | Tauri limitation — macOS/Linux uninstall behavior is OS-managed. Adding a cleanup script introduces its own security risks (accidental data deletion). Users who want cleanup can manually delete `~/.semblance/`. Documented in user-facing help. |

---

## Verified Working (No Remediation Needed)

The following areas were audited and found to be correctly implemented:

- OAuth callback binds to 127.0.0.1 only, auto-shutdown after 120s
- Strong CSRF state (32 random bytes), single-use validation
- PKCE uses S256, proper RFC 7636 implementation
- Tokens encrypted at rest with AES-256-GCM
- No sensitive values in any logs
- Constant-time signature comparison for HMAC
- TLS 1.3 enforced in config, no `NODE_TLS_REJECT_UNAUTHORIZED=0`
- Zero `eval`/`Function` in any parser code path
- All SQLite importers use parameterized queries
- Zero analytics/telemetry libraries anywhere in dependencies
- Audit trail is append-only, tamper-evident, chain-hashed
- Privacy audit CI pipeline functional

---

## New Files Created

| File | Purpose |
|------|---------|
| `packages/core/agent/content-sanitizer.ts` | Prompt injection defense — sanitizes retrieved content |
| `packages/core/importers/safe-read.ts` | File size limits, symlink detection, XXE rejection |
| `packages/core/importers/csv-sanitizer.ts` | CSV formula injection protection |
| `packages/gateway/credentials/key-storage.ts` | OS keychain abstraction (Tauri stronghold + file fallback) |
| `docs/SECURITY_AUDIT_FINDINGS.md` | This document |

## Key Modified Files

| File | Changes |
|------|---------|
| `packages/core/agent/orchestrator.ts` | Prompt injection defense, BoundaryEnforcer wiring, extension tool oversight |
| `packages/core/types/ipc.ts` | `.strict()` on all 65 payload schemas |
| `packages/gateway/ipc/validator.ts` | Replay protection (timestamp TTL + request ID dedup) |
| `packages/gateway/ipc/transport.ts` | Socket permissions (0o600) + per-user pipe name |
| `packages/gateway/credentials/encryption.ts` | Async KeyStorage initialization |
| `packages/core/premium/premium-gate.ts` | Removed license_key from SQLite, OS keychain storage |
| `packages/gateway/services/email/smtp-adapter.ts` | Always verify TLS certificates |
| `packages/gateway/services/base-oauth-adapter.ts` | Zod validation for token responses, POST body for revocation |
| `packages/gateway/services/base-pkce-adapter.ts` | Clear codeVerifier after use |
| `packages/gateway/security/allowlist.ts` | Case-insensitive domain normalization |
| `packages/gateway/services/web-fetch-adapter.ts` | Manual redirect following with per-hop SSRF validation |
| `packages/core/privacy/privacy-tracker.ts` | SQL whitelist validation |
| `packages/core/privacy/data-inventory-collector.ts` | SQL whitelist validation |
| `packages/desktop/src-tauri/entitlements.plist` | Removed network.server, microphone, audio-input |
| `packages/core/security/sandbox-config.ts` | Synced with actual entitlements |
| `scripts/privacy-audit/index.js` | Added fetch() scanning for desktop frontend |
| ~25 parser files in `packages/core/importers/` | Safe read, symlink detection, CSV sanitization, XXE rejection |
