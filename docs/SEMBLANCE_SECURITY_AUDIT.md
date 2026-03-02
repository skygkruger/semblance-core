# Semblance Security Audit — March 2026 (Pre-Ship)

**Audit Date:** 2026-03-02
**Prior Audit:** 2026-02-27 (31 findings, all resolved — see `SECURITY_AUDIT_FINDINGS.md`)
**Scope:** Full pre-ship security audit across 6 areas
**Methodology:** Automated grep + manual code review per area
**Auditor:** Claude Opus 4.6 (6 parallel security-auditor subagents)

---

## Executive Summary

| Area | Checks | PASS | FAIL | Concerns |
|------|--------|------|------|----------|
| 1. IPC Boundary | 6 | 6 | 0 | 4 MEDIUM |
| 2. OAuth Callback | 6 | 4 | 2 | — |
| 3. Token Storage | 4 | 4 | 0 | 2 MEDIUM, 3 LOW |
| 4. Parser Hardening | 6 | 6 | 0 | 2 MEDIUM, 2 LOW |
| 5. Prompt Injection | 3 | 3 | 0 | 3 MEDIUM, 3 LOW |
| 6. Privacy Verification | 4 | 4 | 0 | 1 LOW |
| **Total** | **29** | **27** | **2** | **11 MEDIUM, 9 LOW** |

**Launch-blocking findings: 2** (both in Area 2 — OAuth)

---

## Area 1 — IPC Boundary

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1.1 | Zod `.strict()` on all 64 payload schemas | **PASS** | `packages/core/types/ipc.ts` — 64/64 payload schemas in `ActionPayloadMap` use `.strict()`. All 64 match the `ActionType` enum. |
| 1.2 | Replay protection (30s TTL + 10k dedup) | **PASS** | `packages/gateway/ipc/validator.ts` — `TTL_MS = 30_000`, `MAX_SEEN_IDS = 10_000`, rejects future-dated requests, handles NaN timestamps. Periodic purge every 60s with `unref()`. |
| 1.3 | Socket permissions (0o600) | **PASS** | `packages/gateway/ipc/transport.ts:111-115` — `chmodSync(socketPath, 0o600)` on Unix. Per-user named pipe on Windows with UID suffix. Single-connection enforcement. 10MB message size guard. |
| 1.4 | HMAC-SHA256 constant-time comparison | **PASS** | `packages/core/types/signing.ts:48-63` — XOR-accumulator pattern, pipe-delimited signing payload with SHA-256 payload hash. |
| 1.5 | Rate limiter (sliding window) | **PASS** | `packages/gateway/security/rate-limiter.ts` — Sliding window with per-action limits (email.send=20/hr, calendar.create=30/hr, etc.), global 500/hr, check-then-record separation. |
| 1.6 | Allowlist domain normalization | **PASS** | `packages/gateway/security/allowlist.ts:74-76` — Lowercase + trailing dot strip. Applied on both lookup and insertion. Wildcards rejected. Default-deny. Exact match only (no subdomain inheritance). |

### Concerns (Area 1)

| ID | Severity | Finding | File:Line | Recommendation |
|----|----------|---------|-----------|----------------|
| C1.1 | MEDIUM | `ActionRequest` envelope schema lacks `.strict()` — extra fields survive validation | `packages/core/types/ipc.ts:591` | Add `.strict()` to envelope |
| C1.2 | MEDIUM | Hand-rolled constant-time comparison — JIT may optimize away timing guarantees | `packages/core/types/signing.ts:57-63` | Replace with `crypto.timingSafeEqual()` |
| C1.3 | MEDIUM | `chmodSync` failure silently caught — socket remains world-accessible on failure | `packages/gateway/ipc/transport.ts:114` | Log warning or treat as fatal |
| C1.4 | MEDIUM | No percent-decode or IDN/Punycode normalization on allowlist domains | `packages/gateway/security/allowlist.ts:74-76` | Add `decodeURIComponent()` defense |

---

## Area 2 — OAuth Callback

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 2.1 | CSRF state (32 random bytes, crypto.randomBytes) | **PASS** | `packages/gateway/services/oauth-callback-server.ts:36` — `randomBytes(32).toString('hex')`. Validated on callback (line 103-108). Single-use (server stops after one callback). |
| 2.2 | Localhost-only binding + 120s auto-shutdown | **PASS** | Same file, line 45: `listen(port, '127.0.0.1')`. Line 22: `AUTO_SHUTDOWN_MS = 120_000`. Server stops on success, error, state mismatch, and missing code. |
| 2.3 | TLS verification (rejectUnauthorized: true) | **FAIL** | SMTP: PASS — `smtp-adapter.ts:68` hardcoded `rejectUnauthorized: true`. **IMAP: FAIL** — `imap-adapter.ts:100-109` does NOT set `tls: { rejectUnauthorized: true }` in ImapFlow constructor. Relies on library default. |
| 2.4 | No tokens in URL params (POST body only) | **FAIL** | Base adapter: PASS — `base-oauth-adapter.ts:163-169` sends token in POST body with security comment. **Google Drive: FAIL** — `google-drive-adapter.ts:166` sends `?token=${accessToken}` in URL query string. |
| 2.5 | PKCE S256 (SHA-256 challenge, crypto.randomBytes verifier) | **PASS** | `base-pkce-adapter.ts:59` uses S256. Lines 36-43: SHA-256 hash with base64url encoding per RFC 7636. Verifier is 64 `randomBytes`. |
| 2.6 | codeVerifier cleared after use | **PASS** | `base-pkce-adapter.ts:78` — `this.codeVerifier = null` immediately after use. Not logged. Not persisted. |

### FAIL Details (Area 2)

**F2.1 — IMAP adapter missing explicit TLS enforcement**
- **File:** `packages/gateway/services/email/imap-adapter.ts:100-109` (and duplicate at line 255-264)
- **Impact:** MEDIUM — relies on ImapFlow library default instead of explicit enforcement
- **Fix:** Add `tls: { rejectUnauthorized: true }` to ImapFlow constructor options

**F2.2 — Google Drive adapter leaks token in URL**
- **File:** `packages/gateway/services/google-drive-adapter.ts:166`
- **Impact:** HIGH — access token appears in server logs, proxy logs, and Referer headers
- **Fix:** Move token to POST body: `body: new URLSearchParams({ token: accessToken })`
- **Note:** This adapter does not extend `BaseOAuthAdapter` — the Feb 27 fix to base-oauth-adapter.ts did not propagate. Also lacks Zod validation on token response (line 109 uses unsafe `as` cast).

---

## Area 3 — Token Storage

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 3.1 | Encryption key in OS keychain, values in encrypted SQLite | **PASS** | `packages/gateway/credentials/key-storage.ts:49-94` — `KeychainKeyStorage` uses Tauri stronghold. `encryption.ts` uses AES-256-GCM. `oauth-token-manager.ts:43-44` encrypts both access and refresh tokens. |
| 3.2 | License key NOT in SQLite (only metadata) | **PASS** | `packages/core/premium/premium-gate.ts:120-128` — `license` table has `id, tier, activated_at, expires_at, founding_seat`. Line 118 comment: "license_key column removed — keys stored in OS keychain only." Migration at lines 148-173 drops legacy column. |
| 3.3 | Disconnect clears keychain + SQLite entries | **PASS** | OAuth: `oauth-token-manager.ts:125-127` deletes from `oauth_tokens`. IMAP/SMTP: `store.ts:196` deletes from `service_credentials`. License: `premium-gate.ts:361-368` calls `keyStorage.deleteLicenseKey()` then deletes from SQLite. |
| 3.4 | No tokens in log statements | **PASS** | Grep across entire gateway package: zero matches for `console.(log|error|warn|debug|info)` combined with `token|password|secret|key|credential`. All 7 gateway console statements are structural messages only. |

### Concerns (Area 3)

| ID | Severity | Finding | File:Line | Note |
|----|----------|---------|-----------|------|
| C3.1 | MEDIUM | `FileKeyStorage` fallback — chmod(0o600) is no-op on Windows | `key-storage.ts:102-148` | Acceptable for headless/CI only |
| C3.2 | MEDIUM | OAuth disconnect does not rotate/clear shared encryption key | `store.ts` / `key-storage.ts` | Key is shared across all credentials — individual delete is correct; rotation is enhancement |
| C3.3 | LOW | License key held in React state (`AppState.tsx:100`) | Desktop renderer | Needed for Stripe portal flow; could be scoped to sidecar |
| C3.4 | LOW | Encryption key cached in module scope (`encryption.ts:19`) | Gateway process memory | Standard practice; memory dump would expose key |
| C3.5 | LOW | `FileKeyStorage.delete()` secure-delete is best-effort on modern FS/SSD | `key-storage.ts:138-147` | Acknowledged in code comment |

---

## Area 4 — Parser Hardening

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 4.1 | XML entity rejection (`rejectXmlEntities()`) | **PASS** | `packages/core/importers/safe-read.ts:93-99` — Regex `/<!DOCTYPE[^>]*<!ENTITY/i` on first 4096 bytes. Custom `XmlEntityError` class at lines 34-39. |
| 4.2 | File size limit (100MB via `safeReadFileSync()`) | **PASS** | Same file, line 15: `DEFAULT_MAX_BYTES = 100 * 1024 * 1024`. Lines 49-66: `lstatSync` (symlink check) before `statSync` (size check) before `readFileSync`. |
| 4.3 | CSV sanitization (`sanitizeCsvCell()`) | **PASS** | `packages/core/importers/csv-sanitizer.ts:17` — Strips formula prefixes `['=', '+', '-', '@', '\t', '\r']` via while loop. Bulk `sanitizeCsvRows()` at line 34. |
| 4.4 | Symlink protection (`lstatSync` in `safeWalkDirectory`) | **PASS** | `safe-read.ts:140` — `lstatSync(fullPath)` with `isSymbolicLink()` check, silent skip on symlinks. Security comment at line 139. |
| 4.5 | No `eval()` / `new Function()` in source | **PASS** | Grep across all packages: zero matches in `.ts`/.tsx` source. Only hits in `.tmp/storybook-phase4/` build artifacts (expected). |
| 4.6 | Parameterized SQL queries | **PASS** | All query builders use `conditions.push('column = ?')` + `params.push(value)` pattern. Dynamic UPDATE builders use hardcoded field names with `?` for values. `data-inventory-collector.ts` uses `assertKnownTable()` / `assertKnownColumn()` whitelists. |

### Concerns (Area 4)

| ID | Severity | Finding | File(s) | Recommendation |
|----|----------|---------|---------|----------------|
| C4.1 | MEDIUM | 6+ individual parsers use raw `statSync` instead of `lstatSync` for directory traversal, bypassing symlink protection until actual file read | `facebook-export-parser.ts`, `instagram-export-parser.ts`, `apple-notes-parser.ts`, `slack-export-parser.ts`, `exif-parser.ts` | Refactor to use `safeWalkDirectory` or add `lstatSync` checks |
| C4.2 | MEDIUM | `sortBy`/`sortOrder` in contact-store.ts interpolated into SQL, relies on TypeScript type constraint only (no runtime whitelist) | `contact-store.ts:307-313` | Add runtime `assertKnownColumn()` check |
| C4.3 | LOW | XML entity regex could be bypassed with creative formatting (split across lines, beyond 4KB) | `safe-read.ts:93-99` | Consider rejecting standalone `<!DOCTYPE` |
| C4.4 | LOW | LIKE wildcard chars (`%`, `_`) not escaped in search queries | `contact-store.ts:325`, `email-indexer.ts` | Could return unexpectedly broad results |

---

## Area 5 — Prompt Injection

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 5.1 | `content-sanitizer.ts` exists and wired | **PASS** | `packages/core/agent/content-sanitizer.ts` (102 lines) — 4 defense layers: control char stripping, 13 LLM control token patterns, role prefix stripping, instruction marker neutralization. 2,000-char limit per chunk. |
| 5.2 | `wrapInDataBoundary()` applied to all tool result re-injection | **PASS** | `orchestrator.ts:497-517` — tool results wrapped with `wrapInDataBoundary()`. Web fetch/search get full `sanitizeRetrievedContent()`. Knowledge graph results (lines 710-733) wrapped with labels `'document context'` and `'knowledge base'`. All injected as `role: 'user'`, not `role: 'system'`. |
| 5.3 | `BoundaryEnforcer` instantiated in orchestrator | **PASS** | `orchestrator.ts:454` — `this.boundaryEnforcer = new BoundaryEnforcer(config.db)`. Called at lines 774 and 964 for both extension and Gateway tools. Overrides autonomy tier when triggered (lines 970-973). |

### Concerns (Area 5)

| ID | Severity | Finding | File:Line | Recommendation |
|----|----------|---------|-----------|----------------|
| C5.1 | MEDIUM | Email categorizer injects `fromName`, `subject`, `snippet` without sanitization | `email-categorizer.ts:220-231` | Add `sanitizeRetrievedContent()` call |
| C5.2 | MEDIUM | Style extractor injects email bodies (up to 500 chars each) without sanitization | `style-extractor.ts:360-384` | Add sanitization for `to`/`subject` fields |
| C5.3 | MEDIUM | Relationship analyzer injects email subjects without sanitization | `relationship-analyzer.ts:276-277` | Add `sanitizeRetrievedContent()` to `emailSamples` |
| C5.4 | LOW | Clipboard pattern recognizer passes raw clipboard text to LLM | `clipboard/pattern-recognizer.ts:103` | User-sourced data; output constrained to JSON pattern types |
| C5.5 | LOW | Finance modules pass CSV/statement data unsanitized | `statement-parser.ts:406`, `merchant-normalizer.ts:196` | User-imported files; output constrained |
| C5.6 | LOW | Non-web tool results (email fetch, calendar fetch) not individually sanitized before re-injection | `orchestrator.ts:500-504` | Only `fetch_url` and `search_web` get full sanitization |

---

## Area 6 — Privacy Verification

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 6.1 | Privacy audit script exists and has comprehensive coverage | **PASS** | `scripts/privacy-audit/index.js` (374 lines) — Scans core + desktop for 11 banned JS patterns + 4 Rust patterns. Validates Tauri CSP. Scans for banned analytics dependencies. Runs in 3 CI workflows (ci.yml, privacy-audit.yml, release.yml). |
| 6.2 | Zero banned network imports in `packages/core/` | **PASS** | Grep for `fetch(`, `XMLHttpRequest`, `WebSocket`, `node:http`, `node:https`, `node:dgram`, `node:dns`, `node:tls`, `axios`, `got`, `node-fetch`, `undici`, `superagent`, `socket.io`, `ws`: zero matches. `node:net` only in 2 approved IPC files. `ollama` only in `packages/core/llm/` with localhost-only runtime check. |
| 6.3 | Zero analytics SDKs in any package.json | **PASS** | Grep across all `package.json` files for segment, mixpanel, amplitude, posthog, sentry, bugsnag, datadog: zero matches. Storybook telemetry explicitly disabled (`disableTelemetry: true`). |
| 6.4 | CSP in tauri.conf.json blocks external origins | **PASS** | `packages/desktop/src-tauri/tauri.conf.json:26` — `default-src 'self'; script-src 'self'; connect-src 'self' tauri: ipc:; frame-src 'none'; object-src 'none'`. No external HTTP/HTTPS origins. Updater endpoint is GitHub Releases only. |

### Concerns (Area 6)

| ID | Severity | Finding | File | Note |
|----|----------|---------|------|------|
| C6.1 | LOW | `style-src 'unsafe-inline'` in CSP | `tauri.conf.json:26` | Required for React/Tailwind inline styles. No data exfil risk given connect-src restrictions. Acceptable for local-only desktop app. |

---

## Remediation Plan

### Launch-Blocking (Must Fix)

| Priority | Finding | Fix |
|----------|---------|-----|
| **1** | F2.2 — Google Drive adapter token in URL | Move to POST body, add Zod validation for token response |
| **2** | F2.1 — IMAP adapter missing explicit TLS enforcement | Add `tls: { rejectUnauthorized: true }` to both ImapFlow constructor sites |

### Should Fix (Recommended before ship)

| Priority | Finding | Fix |
|----------|---------|-----|
| **3** | C1.2 — Hand-rolled constant-time comparison | Replace with `crypto.timingSafeEqual()` |
| **4** | C1.1 — ActionRequest envelope lacks `.strict()` | Add `.strict()` |
| **5** | C1.3 — Silent chmod failure on socket | Log warning |
| **6** | C5.1 — Email categorizer missing sanitization | Add `sanitizeRetrievedContent()` |
| **7** | C5.2 — Style extractor missing sanitization | Add `sanitizeRetrievedContent()` |
| **8** | C5.3 — Relationship analyzer missing sanitization | Add `sanitizeRetrievedContent()` |
| **9** | C4.1 — Parsers using raw `statSync` | Add `lstatSync` checks |
| **10** | C4.2 — SQL identifier interpolation without runtime whitelist | Add `assertKnownColumn()` |

### Accept (Low risk, address post-launch)

All LOW-severity concerns (C3.3, C3.4, C3.5, C4.3, C4.4, C5.4, C5.5, C5.6, C6.1, C1.4)

---

*Generated by Claude Opus 4.6 security audit pipeline. Cross-reference with `docs/SECURITY_AUDIT_FINDINGS.md` for Feb 27 baseline.*
