# STEP 2: Gateway Isolation — The Hard Boundary

## Context

This is the most security-critical step in the entire Semblance build. Everything you build here is the foundation that every future feature depends on. The Gateway is the sole point of external contact for the entire system. If this is wrong, nothing else matters.

Read CLAUDE.md first. Pay particular attention to Rules 1–3 and the IPC Protocol section. Every line of code in this step is security-critical — treat it accordingly.

This step builds four things:
1. **Shared types** — The IPC protocol type definitions used by both Core and Gateway
2. **The Gateway process** — IPC listener, validation pipeline, allowlist, rate limiting, anomaly detection
3. **Action signing and audit trail** — Cryptographic signing of every action, append-only tamper-evident log
4. **Gateway tests** — Comprehensive tests proving the boundary works

## What To Build

### 1. Shared Types (`packages/core/types/`)

These types are shared between Core and Gateway. They define the IPC protocol contract. Both sides must agree on these types exactly.

**`packages/core/types/ipc.ts`** — The IPC Protocol Types

Implement the EXACT schemas from CLAUDE.md:

```typescript
import { z } from 'zod';

// Action types — discriminated union of all supported actions
export const ActionType = z.enum([
  'email.fetch',
  'email.send',
  'email.draft',
  'calendar.fetch',
  'calendar.create',
  'calendar.update',
  'finance.fetch_transactions',
  'health.fetch',
  'service.api_call',
]);
export type ActionType = z.infer<typeof ActionType>;

// Action Request — what Core sends to Gateway
export const ActionRequest = z.object({
  id: z.string(),                          // nanoid
  timestamp: z.string().datetime(),         // ISO 8601
  action: ActionType,
  payload: z.record(z.unknown()),           // Action-specific payload, validated per-action
  source: z.literal('core'),                // Always 'core' — Gateway never initiates
  signature: z.string(),                    // HMAC-SHA256
});
export type ActionRequest = z.infer<typeof ActionRequest>;

// Action Response — what Gateway returns to Core
export const ActionResponse = z.object({
  requestId: z.string(),                   // Matches the request id
  timestamp: z.string().datetime(),
  status: z.enum(['success', 'error', 'requires_approval', 'rate_limited']),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
  auditRef: z.string(),                    // Reference to audit trail entry
});
export type ActionResponse = z.infer<typeof ActionResponse>;
```

Also create typed payload schemas for each ActionType. At minimum for Step 2, implement:

```typescript
// Email payloads (the first service we'll integrate in Sprint 2)
export const EmailSendPayload = z.object({
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  subject: z.string(),
  body: z.string(),
  replyToMessageId: z.string().optional(),
});

export const EmailFetchPayload = z.object({
  folder: z.string().default('INBOX'),
  limit: z.number().int().positive().default(50),
  since: z.string().datetime().optional(),
});

// Calendar payloads
export const CalendarFetchPayload = z.object({
  calendarId: z.string().default('primary'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export const CalendarCreatePayload = z.object({
  calendarId: z.string().default('primary'),
  title: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  description: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
});

// Generic API call payload (for authorized services)
export const ServiceApiCallPayload = z.object({
  service: z.string(),          // Must match an allowlisted service
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

// Map ActionType to its payload schema
export const ActionPayloadMap = {
  'email.send': EmailSendPayload,
  'email.draft': EmailSendPayload,     // Same structure as send
  'email.fetch': EmailFetchPayload,
  'calendar.fetch': CalendarFetchPayload,
  'calendar.create': CalendarCreatePayload,
  'calendar.update': CalendarCreatePayload, // Same structure for now
  'finance.fetch_transactions': z.object({ accountId: z.string().optional(), limit: z.number().optional() }),
  'health.fetch': z.object({ dataType: z.string(), startDate: z.string().datetime().optional() }),
  'service.api_call': ServiceApiCallPayload,
} as const;
```

**`packages/core/types/audit.ts`** — Audit Trail Types

```typescript
export const AuditEntry = z.object({
  id: z.string(),                          // nanoid
  requestId: z.string(),                   // Links to ActionRequest.id
  timestamp: z.string().datetime(),
  action: ActionType,
  direction: z.enum(['request', 'response']),
  status: z.enum(['pending', 'success', 'error', 'rejected', 'rate_limited']),
  payloadHash: z.string(),                 // SHA-256 hash of the payload (not the payload itself)
  signature: z.string(),                   // Signature from the original request
  metadata: z.record(z.unknown()).optional(), // Additional context (error details, rejection reason, etc.)
});
export type AuditEntry = z.infer<typeof AuditEntry>;
```

**`packages/core/types/index.ts`** — Re-export everything.

**CRITICAL: These type files must NOT import any networking libraries. They are pure type definitions + Zod schemas. They live in `packages/core/types/` because Core needs them to construct requests, and Gateway imports ONLY from this types directory — never from Core's knowledge graph, LLM, or agent code.**

### 2. Action Signing (`packages/gateway/security/signing.ts`)

Implement the cryptographic action signing mechanism:

- **Key generation:** On first run, generate an HMAC secret key using Node.js `crypto.randomBytes(32)`. Store it in the local SQLite database (NOT in a file, NOT in an env var). This key never leaves the device.
- **Signing:** HMAC-SHA256 of `${request.id}|${request.timestamp}|${request.action}|${sha256(JSON.stringify(request.payload))}`. The signature is attached to the ActionRequest before it enters the Gateway.
- **Verification:** The Gateway verifies the signature matches before processing any request. Invalid signatures are rejected and logged.

Note on architecture: In the full system, the Core signs requests and the Gateway verifies them. For Step 2, implement both the signing and verification functions in the Gateway's security module so they're ready to be called from either side. The Core will import the signing function in Step 3 when it needs to construct requests.

Wait — **correction on the above.** The signing function must ultimately live somewhere Core can access it WITHOUT importing from Gateway. The clean solution: put the signing utility in `packages/core/types/` alongside the schemas (it's a pure crypto function with no network dependencies), and have Gateway import it from there for verification. This maintains the boundary rule: Gateway can import from `core/types/` but never from `core/knowledge/`, `core/llm/`, or `core/agent/`.

Revised plan:
- **`packages/core/types/signing.ts`** — Pure signing and verification functions using Node.js `crypto`. No network imports. Just HMAC-SHA256 computation.
- **`packages/gateway/security/signing.ts`** — Imports from `@semblance/core/types/signing` and adds key management (generation, storage, retrieval from SQLite).

### 3. Audit Trail (`packages/gateway/audit/`)

Implement the append-only, tamper-evident audit trail:

**`packages/gateway/audit/trail.ts`**

- **Storage:** SQLite database (`audit.db`) using `better-sqlite3`. Single table `audit_log`.
- **Schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('request', 'response')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error', 'rejected', 'rate_limited')),
    payload_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    metadata TEXT,                -- JSON string
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
  ```
- **Write-ahead logging:** Enable WAL mode for the SQLite database (`PRAGMA journal_mode=WAL`). This is the append-only mechanism.
- **Insert only:** The audit trail class must expose ONLY insert and query methods. No update. No delete. No truncate. If someone tries to call a method to modify or delete audit entries, it should not exist. The API surface enforces append-only behavior.
- **Tamper evidence:** Each audit entry includes the SHA-256 hash of the previous entry's id + payload_hash + signature (chain hashing). The first entry uses a known genesis hash. This creates a hash chain — if any entry is modified, all subsequent hashes break.
- **Query methods:** `getByRequestId(id)`, `getByTimeRange(start, end)`, `getByAction(action)`, `getRecent(limit)`, `verifyChainIntegrity()`.

**`packages/gateway/audit/index.ts`** — Export the AuditTrail class.

### 4. Allowlist (`packages/gateway/security/allowlist.ts`)

Implement the service allowlist:

- **Storage:** SQLite table `allowed_services` in the Gateway's config database.
  ```sql
  CREATE TABLE IF NOT EXISTS allowed_services (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    domain TEXT NOT NULL,            -- e.g., 'imap.gmail.com'
    port INTEGER,
    protocol TEXT NOT NULL,          -- 'imap', 'caldav', 'https', etc.
    added_at TEXT NOT NULL,
    added_by TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'setup_wizard'
    is_active INTEGER NOT NULL DEFAULT 1
  );
  ```
- **Check method:** `isAllowed(domain: string, port?: number): boolean`
- **Management methods:** `addService(...)`, `removeService(id)`, `listServices()`, `deactivateService(id)`
- **Default state:** Empty allowlist. Nothing is allowed until the user explicitly authorizes a service. This is the secure default.
- **No wildcard domains.** No `*.google.com`. Each specific subdomain must be explicitly listed.

### 5. Rate Limiter (`packages/gateway/security/rate-limiter.ts`)

Implement request rate limiting:

- **Per-action rate limits:** Configurable max requests per time window per action type. Sensible defaults:
  - `email.send`: 20 per hour (prevent spam)
  - `email.fetch`: 60 per hour
  - `calendar.create`: 30 per hour
  - `service.api_call`: 100 per hour
  - Default for unlisted actions: 60 per hour
- **Global rate limit:** 500 total requests per hour across all action types.
- **Implementation:** Sliding window counter. Store counts in memory (Map). Reset on window expiration.
- **Response:** When rate limited, return an ActionResponse with status `'rate_limited'` and an error containing the retry-after time.

### 6. Anomaly Detector (`packages/gateway/security/anomaly-detector.ts`)

Implement basic anomaly detection:

- **Burst detection:** Flag if more than 10 requests arrive within 5 seconds. This suggests a runaway loop, not normal agent behavior.
- **New domain detection:** Flag (but don't block) the first request to a newly added allowlisted domain. Log it prominently.
- **Large payload detection:** Flag requests where the payload exceeds 1MB.
- **Response:** Anomaly detection triggers a `'requires_approval'` response status and logs a detailed anomaly entry to the audit trail. The UI will surface these for user review (in Sprint 2).

### 7. Gateway Validation Pipeline (`packages/gateway/ipc/validator.ts`)

The validation pipeline that every request passes through, in order:

```
Request received via IPC
  → 1. Schema validation (Zod parse against ActionRequest + action-specific payload)
  → 2. Signature verification (HMAC-SHA256 check)
  → 3. Allowlist check (is the target domain authorized?)
  → 4. Rate limit check (within limits?)
  → 5. Anomaly check (anything unusual?)
  → 6. LOG TO AUDIT TRAIL (status: 'pending') ← BEFORE execution
  → 7. Execute action (via service adapter — stub for now)
  → 8. LOG TO AUDIT TRAIL (status: 'success' or 'error') ← AFTER execution
  → 9. Return ActionResponse to Core via IPC
```

If ANY step 1–5 fails:
- Log the rejection to the audit trail with the failure reason
- Return an ActionResponse with status `'error'` (for schema/signature/allowlist failures) or `'rate_limited'` or `'requires_approval'`
- Do NOT execute the action

Implement this as a composable pipeline — each step is a function that either passes the request through or returns a rejection. This makes it testable and extensible.

### 8. IPC Transport (`packages/gateway/ipc/transport.ts`)

Implement the local IPC transport:

- **Unix domain socket** on macOS/Linux, **named pipe** on Windows
- Socket path: platform-specific default in the user's app data directory (e.g., `~/.semblance/gateway.sock`)
- The Gateway listens. The Core connects as a client.
- **Message framing:** Length-prefixed JSON messages. 4-byte big-endian length header followed by UTF-8 JSON payload. This prevents message boundary issues.
- **Single connection:** One Core process connects to one Gateway process. Reject additional connections.
- **Graceful shutdown:** Clean socket cleanup on process exit (remove socket file, close connections).

### 9. Gateway Entry Point (`packages/gateway/index.ts`)

The main Gateway module that wires everything together:

- Initialize SQLite databases (audit trail + config/allowlist)
- Load or generate HMAC signing key
- Start the IPC listener
- Wire the validation pipeline
- Log startup to audit trail

Expose a clean API:
```typescript
interface Gateway {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAuditTrail(): AuditTrail;
  getAllowlist(): Allowlist;
  getRateLimiter(): RateLimiter;
}
```

### 10. Service Adapter Stubs (`packages/gateway/services/`)

Create stub adapters for each action type. These will be implemented for real in Sprint 2, but the interface must be defined now:

```typescript
// packages/gateway/services/types.ts
interface ServiceAdapter {
  execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }>;
}
```

Create a stub adapter (`packages/gateway/services/stub-adapter.ts`) that:
- Returns `{ success: true, data: { stub: true, message: 'Service adapter not yet implemented' } }` for all actions
- Logs a warning that the real adapter is not yet connected

Register it in a service registry (`packages/gateway/services/registry.ts`) so when real adapters arrive in Sprint 2, they plug in cleanly.

### 11. Tests (`tests/gateway/`)

**This is not optional. These tests are the proof that the boundary works.**

**Schema validation tests:**
- Valid ActionRequest passes validation
- Missing fields are rejected
- Invalid ActionType is rejected
- Malformed payload for each action type is rejected
- Invalid timestamp format is rejected
- Empty signature is rejected

**Signature tests:**
- Valid signature passes verification
- Tampered payload fails verification
- Tampered timestamp fails verification
- Tampered action type fails verification
- Wrong key fails verification

**Allowlist tests:**
- Request to allowlisted domain passes
- Request to non-allowlisted domain is rejected
- Wildcard domains are not accepted (if someone tries to add `*.google.com`, it's rejected)
- Deactivated service is treated as not-allowed

**Rate limiter tests:**
- Requests within limit pass
- Request exceeding per-action limit is rate-limited
- Request exceeding global limit is rate-limited
- Limits reset after window expires

**Anomaly detection tests:**
- Burst of >10 requests in 5 seconds triggers anomaly
- First request to new domain is flagged
- Large payload is flagged
- Normal request patterns pass cleanly

**Audit trail tests:**
- Entry is written BEFORE action execution
- Entry cannot be modified after creation
- Entry cannot be deleted
- Chain hash integrity can be verified across multiple entries
- Tampering with any entry breaks the chain verification
- Query methods return correct results

**Validation pipeline tests (integration):**
- A fully valid request passes through all steps and returns success
- Schema failure short-circuits (no execution, no allowlist check)
- Signature failure short-circuits
- Allowlist failure short-circuits
- Rate limit failure short-circuits
- Every rejection is logged to the audit trail with the correct rejection reason
- The audit trail shows both the request entry (pending) and the response entry (success/error)

**Privacy audit still passes:**
- Run `npm run privacy-audit` and confirm it still exits 0
- The Gateway code lives in `packages/gateway/` (allowed to use networking)
- The shared types in `packages/core/types/` must pass the privacy audit (no network imports)

## What NOT To Build

- No real service adapters (just stubs)
- No actual email/calendar/finance integration
- No UI for the Gateway or audit trail (Sprint 2)
- No Core-to-Gateway connection wiring (Step 3 — when Core exists)
- No OS-level sandboxing configuration (Sprint 4 — launch prep)

## Exit Criteria

Step 2 is complete when ALL of the following are true:

1. ✅ All IPC protocol types are defined with Zod schemas in `packages/core/types/`
2. ✅ Action signing (HMAC-SHA256) works: sign a request, verify it passes, tamper with it, verify it fails
3. ✅ Audit trail is append-only: entries can be inserted and queried, not updated or deleted
4. ✅ Audit trail chain hashing works: tamper with an entry, chain verification detects it
5. ✅ Allowlist rejects requests to unauthorized domains
6. ✅ Rate limiter enforces per-action and global limits
7. ✅ Anomaly detector flags burst requests and large payloads
8. ✅ Validation pipeline executes steps in order and short-circuits on failure
9. ✅ Every rejection is logged to the audit trail with the rejection reason
10. ✅ IPC transport accepts connections and handles length-prefixed JSON messages
11. ✅ All test suites pass (schema, signing, allowlist, rate limiter, anomaly, audit trail, pipeline)
12. ✅ `npm run privacy-audit` still exits 0
13. ✅ TypeScript compiles with zero errors across all packages
14. ✅ Commits use `security:` prefix per CLAUDE.md conventions

## Commit Strategy

This step is large enough to warrant multiple commits. Recommended:

1. `security: add IPC protocol types and Zod schemas`
2. `security: implement action signing (HMAC-SHA256)`
3. `security: implement append-only audit trail with chain hashing`
4. `security: implement allowlist, rate limiter, anomaly detector`
5. `security: implement validation pipeline`
6. `security: implement IPC transport (Unix domain socket / named pipe)`
7. `security: add Gateway entry point and service adapter stubs`
8. `test: add comprehensive Gateway test suite`

## After Completion

Report back with:
- Confirmation of each exit criteria (pass/fail)
- Test count and pass/fail summary
- Any decisions you made that weren't explicitly specified (so Orbital Directors can verify)
- Any issues encountered and how you resolved them
- Confirmation that the privacy audit still passes

Do NOT proceed to Step 3. Wait for Orbital Director review.
