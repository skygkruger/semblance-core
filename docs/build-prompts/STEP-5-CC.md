# Sprint 2 — Step 5: Gateway Service Adapters + Time-Saved Data Model

## Implementation Prompt for Claude Code

**Date:** February 20, 2026
**Prerequisite:** Sprint 1 complete (Steps 1–4B ✅ — 501 tests passing, privacy audit clean)
**Test Baseline:** 501 passing tests, privacy audit exit 0
**Sprint 2 Step Sequence:** Step 5 (this) → Step 6 (Universal Inbox + AI Actions) → Step 7 (Subscription Detection + Escalation + Digest) → Step 8 (Network Monitor + Task Routing + Polish)

---

## Mission

Build the infrastructure that makes Sprint 2 possible. When this step is complete, the Gateway can connect to a user's real email server (IMAP read + SMTP send) and real calendar server (CalDAV read + write), the audit trail schema includes `estimatedTimeSavedSeconds` on every entry, and the desktop app has a credential management UI where users securely configure their email and calendar accounts. No AI-driven actions yet — that's Step 6. This step builds the pipes.

**Why this must come first:** Every Sprint 2 feature — email triage, calendar management, proactive context, subscription detection — depends on the Gateway having real service adapters that can fetch and send data. The time-saved tracking must be in the data model from the first Sprint 2 commit (locked-in decision, February 19). Building these together ensures nothing downstream is blocked.

**Read before writing any code:**
1. `CLAUDE.md` (root) — Gateway rules, IPC protocol schema, action types, validation flow, approved dependencies
2. `packages/gateway/` source — understand the existing stub adapter pattern, service registry, IPC handler, audit trail schema, validation pipeline
3. `packages/core/agent/` source — understand how CoreIPCClient sends action requests, what payloads it constructs
4. `packages/desktop/src-tauri/sidecar/bridge.ts` — understand how the sidecar routes commands between frontend ↔ Core ↔ Gateway
5. `docs/DESIGN_SYSTEM.md` — for the credential management UI components

---

## What Already Exists

### Gateway Adapter Infrastructure (Step 2)

The Gateway already has:
- **Service adapter registry** — a pattern for registering adapters by service type. Currently holds stubs.
- **Stub adapters** — placeholder implementations for email, calendar, etc. that return mock data or throw "not implemented."
- **IPC handler** — receives typed `ActionRequest` from Core, routes to the appropriate adapter based on `action` field, returns `ActionResponse`.
- **Validation pipeline** — schema validation (Zod), allowlist check, rate limit, anomaly detection. All functional.
- **Audit trail** — append-only SQLite with WAL mode, chain hashing, HMAC-SHA256 signing. All functional.
- **Action types already defined in CLAUDE.md:** `email.fetch`, `email.send`, `email.draft`, `calendar.fetch`, `calendar.create`, `calendar.update`, `finance.fetch_transactions`, `health.fetch`, `service.api_call`.

### What the Stubs Need to Become

The stubs are replaced with real implementations that make actual network calls to user-configured services. The Gateway's existing validation pipeline, signing, audit trail, and rate limiting apply to these real adapters automatically — the adapter just needs to implement the fetch/send/create/update logic.

---

## Deliverables

### A. Audit Trail Schema Migration — `estimatedTimeSavedSeconds`

**This is a locked-in decision from February 19. It ships in the first Sprint 2 commit.**

Migrate the Gateway's audit trail SQLite schema to add `estimatedTimeSavedSeconds` as a required field on all audit trail entries.

```sql
-- Migration: add_time_saved_tracking
ALTER TABLE audit_trail ADD COLUMN estimated_time_saved_seconds INTEGER NOT NULL DEFAULT 0;
```

**Rules:**
- Default is `0` (for actions where time-saved is not applicable or not yet estimated)
- Every new audit trail entry written from this point forward must include this field
- Existing entries (from Sprint 1) get the default `0` — no retroactive estimation
- The `AuditTrailEntry` TypeScript interface must be updated to include `estimatedTimeSavedSeconds: number`
- The Zod schema for audit trail entries must validate this field
- The `get_action_log` Tauri command (and the sidecar bridge handler) must include this field in responses to the frontend
- The `ActionCard` component in the Activity screen should display time-saved when > 0 (e.g., "~30s saved") — but do NOT rebuild the component, just ensure the data flows through. The UI enhancement ships in Step 7 with the weekly digest.

**Time-saved estimation guidance (for future steps — document this in code comments):**
- Email archive/categorize: 15 seconds per email
- Email draft: 120 seconds per draft
- Email send (routine): 60 seconds
- Calendar conflict resolution: 180 seconds
- Meeting prep document surfacing: 300 seconds
- Subscription flag: 600 seconds (research + decision time)
- These are configurable defaults, not hardcoded. Store as a config table or constant map that can be tuned later.

### B. Credential Storage

**Location:** `packages/gateway/credentials/`

User email and calendar credentials must be stored securely on the local device. This is the most security-sensitive new code in Sprint 2.

#### B1. Credential Store

```typescript
interface ServiceCredential {
  id: string;                    // nanoid
  serviceType: 'email' | 'calendar';
  protocol: 'imap' | 'smtp' | 'caldav';
  host: string;                  // e.g., "imap.gmail.com"
  port: number;                  // e.g., 993
  username: string;              // e.g., "user@gmail.com"
  encryptedPassword: string;     // encrypted at rest
  useTLS: boolean;
  displayName: string;           // user-facing label, e.g., "Work Email"
  createdAt: string;             // ISO 8601
  lastVerifiedAt: string | null; // last successful connection test
}
```

**Encryption at rest:**
- Passwords must NEVER be stored in plaintext in SQLite
- Use a device-derived encryption key. Options (in order of preference):
  1. **OS keychain integration** — Tauri provides `tauri-plugin-stronghold` or direct keychain access via Rust. Store the encryption key in macOS Keychain / Windows Credential Manager / Linux Secret Service. The SQLite column stores the encrypted blob.
  2. **Fallback** — if OS keychain integration is too complex for this step, use a local encryption key derived from a machine-specific identifier (stored at `~/.semblance/credential.key` with `0600` permissions, same pattern as the signing key). Document this as a known improvement for Sprint 4 (OS-level sandboxing step).
- Document the chosen approach as an autonomous decision

**Credential Store API:**
```typescript
interface CredentialStore {
  add(credential: Omit<ServiceCredential, 'id' | 'createdAt' | 'lastVerifiedAt'>): Promise<ServiceCredential>;
  get(id: string): Promise<ServiceCredential | null>;
  getByType(serviceType: 'email' | 'calendar'): Promise<ServiceCredential[]>;
  update(id: string, updates: Partial<ServiceCredential>): Promise<ServiceCredential>;
  remove(id: string): Promise<void>;
  testConnection(id: string): Promise<{ success: boolean; error?: string }>;
}
```

**Storage location:** SQLite table in the Gateway's database (NOT in the Core's database — credentials are a Gateway concern, not a Core concern). The Core never sees raw credentials. It sends action requests; the Gateway uses credentials to execute them.

#### B2. Allowlist Auto-Configuration

When a user adds email or calendar credentials, the Gateway's domain allowlist must be updated automatically to include the relevant hosts. For example, adding an IMAP account for `imap.gmail.com:993` should:

1. Add `imap.gmail.com` to the domain allowlist
2. Add `smtp.gmail.com` to the allowlist (SMTP host may differ — derive from provider or ask user)
3. Log the allowlist change to the audit trail

The user should NOT need to manually configure the allowlist for standard email/calendar operations. The allowlist update is an audited action, not a silent background change.

### C. Email Adapter (IMAP + SMTP)

**Location:** `packages/gateway/services/email/`

Replace the email stub adapter with real IMAP and SMTP implementations.

#### C1. IMAP Adapter (Read)

**Handles action types:** `email.fetch`

```typescript
interface EmailFetchPayload {
  folder?: string;        // default: 'INBOX'
  limit?: number;         // default: 50
  since?: string;         // ISO 8601 date — fetch messages since this date
  search?: string;        // IMAP search criteria (UNSEEN, FROM, SUBJECT, etc.)
  messageIds?: string[];  // fetch specific messages by UID
}

interface EmailMessage {
  id: string;             // IMAP UID
  messageId: string;      // RFC 2822 Message-ID
  threadId?: string;      // derived from In-Reply-To / References headers
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  date: string;           // ISO 8601
  body: {
    text: string;         // plain text body (preferred for AI processing)
    html?: string;        // HTML body (for display)
  };
  flags: string[];        // IMAP flags: \Seen, \Flagged, \Answered, etc.
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    // Attachment content is NOT fetched by default — only metadata
    // Full content fetch is a separate action to avoid large data transfers
  }>;
}

interface EmailAddress {
  name: string;
  address: string;
}
```

**Implementation requirements:**
- Use a well-maintained IMAP library. **Recommended:** `imapflow` (modern, Promise-based, actively maintained, handles IDLE, supports IMAP extensions). This is a new dependency — document justification per CLAUDE.md rules: it's the standard Node.js IMAP library, actively maintained, handles TLS natively, and the Gateway is the only package that makes network calls.
- Connect using credentials from the CredentialStore
- TLS required by default. Reject non-TLS connections unless the user explicitly configures `useTLS: false` (with a warning in the UI).
- Fetch message headers + body in a single operation (avoid chatty IMAP round-trips)
- Parse email threading from `In-Reply-To` and `References` headers
- Handle connection pooling — don't open a new IMAP connection per request. Maintain a connection pool per configured account with idle timeout.
- Handle IMAP errors gracefully: auth failure → clear error to user, connection timeout → retry with backoff, mailbox not found → clear error
- All fetched email data flows back through the IPC channel to Core. The Gateway does NOT store email content — it fetches on demand. (Email indexing into the knowledge graph is a Core concern, handled in Step 6.)

#### C2. SMTP Adapter (Send)

**Handles action types:** `email.send`, `email.draft`

```typescript
// EmailSendPayload already defined in CLAUDE.md:
interface EmailSendPayload {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;  // for threading
}

// Additional: draft saves to IMAP Drafts folder, doesn't send
interface EmailDraftPayload extends EmailSendPayload {
  saveToDrafts: true;
}
```

**Implementation requirements:**
- Use `nodemailer` for SMTP sending. Pre-approved reasoning: industry standard, well-maintained, handles TLS, DKIM, connection pooling. Gateway-only dependency. Document justification.
- For drafts: save to the IMAP server's Drafts folder via the IMAP adapter (APPEND command)
- Set proper email headers: `From`, `To`, `Cc`, `Subject`, `Date`, `Message-ID`, `In-Reply-To` (for replies), `References` (for threading)
- The `From` address must match the configured SMTP credential. The Gateway must NOT allow sending from arbitrary addresses.
- Rate limit sending: maximum 10 emails per minute per account (configurable). This protects users from AI-driven email storms if something goes wrong.
- Every sent email is logged to the audit trail with the full payload (recipient, subject, body length — NOT the full body, to keep audit trail size reasonable)

#### C3. Email Connection Test

When a user adds email credentials, the adapter must verify the connection works:
1. IMAP: connect, authenticate, list folders, disconnect
2. SMTP: connect, authenticate (EHLO), disconnect
3. Return success/failure with clear error messages ("Authentication failed — check your password", "Connection refused — check the server address and port", "TLS handshake failed — the server may not support TLS on this port")

### D. Calendar Adapter (CalDAV)

**Location:** `packages/gateway/services/calendar/`

Replace the calendar stub adapter with a real CalDAV implementation.

#### D1. CalDAV Adapter

**Handles action types:** `calendar.fetch`, `calendar.create`, `calendar.update`

```typescript
interface CalendarFetchPayload {
  startDate: string;       // ISO 8601
  endDate: string;         // ISO 8601
  calendarId?: string;     // specific calendar, or all calendars if omitted
}

interface CalendarEvent {
  id: string;              // CalDAV UID
  calendarId: string;
  title: string;
  description?: string;
  startTime: string;       // ISO 8601
  endTime: string;         // ISO 8601
  location?: string;
  attendees: Array<{
    name: string;
    email: string;
    status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
  }>;
  organizer: {
    name: string;
    email: string;
  };
  recurrence?: string;     // RRULE string
  status: 'confirmed' | 'tentative' | 'cancelled';
  reminders: Array<{
    minutesBefore: number;
  }>;
  lastModified: string;    // ISO 8601
}

interface CalendarCreatePayload {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees?: Array<{ name: string; email: string }>;
  calendarId?: string;     // which calendar to add to
}

interface CalendarUpdatePayload {
  eventId: string;
  updates: Partial<CalendarCreatePayload>;
}
```

**Implementation requirements:**
- Use a CalDAV client library. **Recommended:** `tsdav` (TypeScript-native CalDAV/CardDAV client, well-maintained, supports Google Calendar, Apple Calendar, Fastmail, Nextcloud, etc.). New dependency — document justification.
- Connect using credentials from the CredentialStore
- Discovery: on first connection, discover available calendars via CalDAV PROPFIND. Let the user choose which calendars to sync.
- Fetch events as iCalendar (`.ics`) objects, parse to the `CalendarEvent` interface
- Create events by constructing valid iCalendar objects and PUTting to the CalDAV server
- Update events by fetching the existing iCalendar object, modifying the relevant properties, and PUTting back (CalDAV requires full object replacement)
- Handle recurring events: fetch individual instances within the date range, not just the RRULE master. Recurring event modification (this instance vs. all instances) is Sprint 3 scope — for now, flag recurring events in the response so the Core knows they're recurring.
- Handle CalDAV errors gracefully: auth failure, calendar not found, event conflict (HTTP 409), permission denied
- Connection pooling with idle timeout (same pattern as IMAP)

#### D2. Calendar Connection Test

Similar to email: connect, authenticate, discover calendars, return calendar list or clear error.

### E. IPC Protocol Extensions

The existing `ActionType` union in CLAUDE.md already covers the action types needed. But the payloads need to be fully specified with Zod schemas so the Gateway's validation pipeline can validate them.

**For each new adapter, add:**
1. Zod schema for the request payload (e.g., `EmailFetchPayloadSchema`)
2. Zod schema for the response data (e.g., `EmailMessageSchema`)
3. Register the schemas in the validation pipeline so malformed payloads are rejected before they reach the adapter
4. Update the shared types in `packages/core/types/` so the Core constructs correctly-typed payloads

**Shared types rule:** The payload interfaces and Zod schemas must be defined in a shared location (likely `packages/core/types/` since they're already there for the existing IPC types). Both Core and Gateway import from this shared location. Do not duplicate type definitions.

### F. Credential Management UI

**Location:** `packages/desktop/src/screens/` and `packages/semblance-ui/components/`

Add a credential management flow to the desktop app so users can configure their email and calendar accounts.

#### F1. Account Setup Screen

Accessible from:
- The onboarding flow (Step 4 — the "Data Connection" screen currently shows email/calendar cards as "Coming Soon" — replace those with functional connection flows)
- Settings screen → new "Connected Accounts" section

**Flow:**

1. **Service Selection** — "Connect Email" or "Connect Calendar" cards (same design language as existing onboarding data source cards, with privacy indicators)
2. **Provider Selection (Optional)** — quick-config buttons for common providers (Gmail, Outlook, iCloud, Fastmail, Proton Mail) that pre-fill host/port/TLS settings. "Other" option for manual configuration.
3. **Credential Entry** — form fields: display name, email address, password (or app-specific password), server (pre-filled or manual), port (pre-filled or manual), TLS toggle (default on). For email: separate IMAP and SMTP sections (pre-fill SMTP from IMAP provider when possible).
4. **Connection Test** — "Test Connection" button. Shows spinner → success (green check + "Connected") or failure (red + clear error message). Must succeed before "Save" is enabled.
5. **Calendar Discovery** — for CalDAV: after successful connection test, show discovered calendars with checkboxes. User selects which to sync.
6. **Confirmation** — "Connected! [name] can now access your [email/calendar]." Show what was added to the allowlist.

**Provider presets (store as a config map, not hardcoded per-provider logic):**

| Provider | IMAP Host | IMAP Port | SMTP Host | SMTP Port | CalDAV URL | Notes |
|----------|-----------|-----------|-----------|-----------|------------|-------|
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 587 | https://www.googleapis.com/caldav/v2/ | Requires App Password (note in UI) |
| Outlook | outlook.office365.com | 993 | smtp.office365.com | 587 | https://outlook.office365.com/caldav/ | |
| iCloud | imap.mail.me.com | 993 | smtp.mail.me.com | 587 | https://caldav.icloud.com/ | Requires App Password |
| Fastmail | imap.fastmail.com | 993 | smtp.fastmail.com | 587 | https://caldav.fastmail.com/dav/ | App Password recommended |
| Proton Mail | 127.0.0.1 | 1143 | 127.0.0.1 | 1025 | N/A | Requires Proton Bridge running locally |

**UI notes:**
- For Gmail and iCloud, show a note: "Gmail/iCloud requires an App Password, not your regular password. [How to create one →]" with a link to the provider's app password page (opened in system browser via Tauri shell API, not in the webview).
- Password field uses `type="password"` with a show/hide toggle
- All credential data stays local — the privacy badge and a note on the form should reinforce this
- Form validation: email format, non-empty password, valid port range, hostname format

#### F2. Connected Accounts Management

In Settings → "Connected Accounts" section:

- List of configured accounts with: display name, protocol, host, last verified timestamp, status indicator (green = working, amber = error)
- "Test Connection" button per account (re-verify credentials work)
- "Remove" button per account (confirmation dialog, removes credentials + removes from allowlist + audit trail entry)
- "Add Account" button → launches the setup flow

#### F3. Onboarding Update

The onboarding Step 4 (Data Connection) screen currently shows email and calendar cards as "Coming Soon." Update them:

- **Files card** — unchanged, already functional
- **Email card** — now clickable, launches the email setup flow inline within onboarding (or as a modal/slide-over). After successful connection: card shows green check + account name.
- **Calendar card** — same pattern as email
- "Skip for now" option on both — users can connect later from Settings
- If the user connects email + calendar during onboarding, the Knowledge Moment screen (Step 6 of onboarding) will be able to show the full cross-source compound knowledge demonstration. For this step, just ensure the connections are saved. The enhanced Knowledge Moment logic ships in Step 7.

### G. Sidecar Bridge Extensions

The sidecar bridge (`packages/desktop/src-tauri/sidecar/bridge.ts`) needs new command handlers for credential management and adapter operations.

**New sidecar commands:**

```typescript
// Credential management
'credentials:add'       → CredentialStore.add()
'credentials:list'      → CredentialStore.getByType()
'credentials:remove'    → CredentialStore.remove()
'credentials:test'      → CredentialStore.testConnection() → adapter.testConnection()

// Calendar discovery (after CalDAV connection test succeeds)
'calendar:discover'     → CalDAVAdapter.discoverCalendars()

// Account status
'accounts:status'       → check connection status for all configured accounts
```

**New Tauri commands in `lib.rs`:**

```rust
#[tauri::command]
async fn add_credential(...) -> Result<ServiceCredential, String>

#[tauri::command]
async fn list_credentials(service_type: String) -> Result<Vec<ServiceCredential>, String>

#[tauri::command]
async fn remove_credential(id: String) -> Result<(), String>

#[tauri::command]
async fn test_credential(id: String) -> Result<ConnectionTestResult, String>

#[tauri::command]
async fn discover_calendars(credential_id: String) -> Result<Vec<CalendarInfo>, String>

#[tauri::command]
async fn get_accounts_status() -> Result<Vec<AccountStatus>, String>
```

---

## Testing Requirements

### New Tests

| Test Suite | Location | What It Validates |
|------------|----------|-------------------|
| **Audit trail migration** | `tests/gateway/audit-migration.test.ts` | `estimatedTimeSavedSeconds` column exists. New entries include the field. Existing entries have default 0. Zod schema validates the field. |
| **Credential store** | `tests/gateway/credential-store.test.ts` | Add/get/update/remove round-trips. Passwords are encrypted at rest (read raw SQLite, verify column is not plaintext). getByType filters correctly. |
| **IMAP adapter** | `tests/gateway/imap-adapter.test.ts` | Connection with valid credentials (mock IMAP server). Fetch messages returns parsed EmailMessage objects. Search filters work. TLS enforcement. Auth failure returns clear error. Connection pooling. |
| **SMTP adapter** | `tests/gateway/smtp-adapter.test.ts` | Send email with valid credentials (mock SMTP server). From address matches credential. Rate limiting enforced. Draft saves to IMAP Drafts. Reply threading headers set correctly. |
| **CalDAV adapter** | `tests/gateway/caldav-adapter.test.ts` | Connection with valid credentials (mock CalDAV server). Fetch events in date range. Create event. Update event. Calendar discovery. Recurring event instances fetched. |
| **Validation pipeline** | `tests/gateway/validation-email-calendar.test.ts` | Email/calendar payload Zod schemas reject malformed input. Valid payloads pass. ActionRequest with email/calendar types routes to correct adapter. |
| **Allowlist auto-config** | `tests/gateway/allowlist-autoconfig.test.ts` | Adding email credentials adds IMAP + SMTP hosts to allowlist. Removing credentials removes from allowlist. Allowlist changes are audit-logged. |
| **Privacy audit** | `tests/privacy/gateway-adapters.test.ts` | IMAP/SMTP/CalDAV libraries are only imported in `packages/gateway/services/`. No networking code leaked into Core or Desktop frontend. |
| **Credential UI** | `packages/semblance-ui/CredentialForm/*.test.tsx` | Form validates email format, port range, non-empty password. Provider presets fill fields correctly. Password field is masked. Connection test button state management. |

**Mock servers:** For IMAP, SMTP, and CalDAV adapter tests, use mock servers that simulate the protocol. Options:
- IMAP: `imapflow` includes test utilities, or use a lightweight mock (e.g., `smtp-server` package for SMTP mock). Document dependency justification if new test dependencies are needed.
- CalDAV: mock HTTP server returning valid iCalendar responses
- These are `devDependencies` only — they do not ship in the production bundle

### Existing Tests — Zero Regressions

All 501 existing tests must continue to pass. The audit trail migration must not break existing audit trail tests.

### Privacy Audit

`pnpm run privacy-audit` must exit 0. The new IMAP/SMTP/CalDAV libraries are Gateway-only. The audit must verify:
- No networking imports in `packages/core/`
- No networking imports in `packages/desktop/src/` (frontend)
- New networking libraries are scoped to `packages/gateway/services/` only
- `imapflow`, `nodemailer`, `tsdav` (or whatever libraries are chosen) appear only in Gateway's dependency tree

---

## Exit Criteria

**Step 5 is complete when ALL of the following are true:**

1. ☐ Audit trail schema includes `estimatedTimeSavedSeconds` on all new entries
2. ☐ Time-saved estimation defaults are defined as a configurable map (not hardcoded per-callsite)
3. ☐ Credential store encrypts passwords at rest — raw SQLite inspection confirms no plaintext passwords
4. ☐ IMAP adapter connects to a real email server, fetches messages, parses them into typed `EmailMessage` objects
5. ☐ SMTP adapter sends a real email through a configured SMTP server with proper headers
6. ☐ CalDAV adapter connects to a real calendar server, fetches events, creates events
7. ☐ Connection test works for all three protocols with clear success/failure messages
8. ☐ Adding credentials auto-updates the Gateway allowlist and logs the change
9. ☐ Credential management UI in Settings: add, test, view, remove accounts
10. ☐ Onboarding data connection cards for email and calendar are functional (not "Coming Soon")
11. ☐ Provider presets pre-fill connection details for Gmail, Outlook, iCloud, Fastmail, Proton
12. ☐ All new Zod schemas validate email/calendar payloads in the Gateway validation pipeline
13. ☐ All 501 existing tests pass — zero regressions
14. ☐ All new tests pass (adapter tests, credential tests, validation tests, UI tests)
15. ☐ `pnpm run privacy-audit` exits 0 — new networking libraries scoped to Gateway only

---

## Boundary Reminders

- **Credentials are a Gateway concern.** The Core never sees passwords or connection details. It sends typed action requests (`email.fetch`, `calendar.create`); the Gateway uses stored credentials to execute them.
- **No email/calendar data stored in Gateway.** The Gateway fetches on demand and passes data back through IPC. It does not cache, index, or persist email or calendar content. That's Core's job (Step 6).
- **No AI processing in this step.** The adapters fetch and send raw data. AI-driven email triage, auto-categorization, draft generation, and calendar intelligence all ship in Step 6. This step builds the data pipes.
- **The frontend credential form has no business logic** beyond form validation and connection testing. It does not reason about email content or calendar events.
- **Allowlist changes are audited actions.** Never modify the allowlist silently.

---

## Escalation Triggers

Stop and escalate to Orbital Directors if:

- You need OAuth 2.0 for Gmail/Outlook (this is a significant architectural addition — App Passwords are the Sprint 2 approach, OAuth may come in Sprint 3 or 4)
- You need to modify the IPC protocol schema beyond adding new payload types
- You need to add a dependency not on the pre-approved list beyond the recommended IMAP/SMTP/CalDAV libraries
- The credential encryption approach requires changes to the Tauri configuration or Rust backend beyond what's already there
- You discover that `imapflow`, `nodemailer`, or `tsdav` have network-related side effects at import time that could affect the privacy audit
- The audit trail migration breaks the chain hashing integrity

---

## Autonomous Decision Authority

You may proceed without escalating for:

- Choice of IMAP/SMTP/CalDAV libraries (as long as they're well-maintained and Gateway-scoped)
- Credential encryption implementation details (OS keychain vs. local key file — document the choice)
- IMAP connection pool sizing and timeout values
- SMTP rate limit thresholds
- Mock server approach for adapter tests
- Provider preset data (hosts, ports, URLs)
- Zod schema details for email/calendar payloads
- SQLite table design for credential storage
- UI layout decisions within the design system's specs

Document significant decisions:
```typescript
/**
 * AUTONOMOUS DECISION: [Brief description]
 * Reasoning: [Why this was the right call]
 * Escalation check: [Why this doesn't require Orbital Director input]
 */
```

---

## Implementation Order (Recommended)

1. **Audit trail migration** — add `estimatedTimeSavedSeconds` column, update types and Zod schemas, verify existing tests still pass. This is the smallest change and validates that the migration path works.
2. **Credential store** — SQLite table, encryption, CRUD operations, tests. Everything else depends on stored credentials.
3. **IMAP adapter** — replace the email.fetch stub. Test against mock IMAP server. This is the most complex adapter.
4. **SMTP adapter** — replace the email.send and email.draft stubs. Test against mock SMTP server. Depends on IMAP adapter for draft saving.
5. **CalDAV adapter** — replace the calendar stubs. Test against mock CalDAV server.
6. **Allowlist auto-config** — wire credential add/remove to allowlist updates. Test.
7. **Validation pipeline** — add Zod schemas for all new payload types. Test rejection of malformed payloads.
8. **Sidecar bridge extensions** — new command handlers for credential CRUD and connection testing.
9. **Tauri commands** — new Rust invoke handlers.
10. **Credential management UI** — account setup flow, provider presets, settings integration.
11. **Onboarding update** — replace "Coming Soon" cards with functional email/calendar connection flows.
12. **Privacy audit verification** — confirm all networking scoped to Gateway.
13. **Integration test pass** — end-to-end: add credential → test connection → fetch emails → send email → fetch calendar → create event, all via the Tauri command chain.

---

## What This Step Does NOT Include

These are explicitly deferred. Do not implement them.

| Feature | Ships In | What To Do Now |
|---------|----------|----------------|
| AI email triage / categorization | Step 6 | Adapter fetches raw emails. No AI processing. |
| AI calendar intelligence | Step 6 | Adapter fetches raw events. No AI processing. |
| Email indexing into knowledge graph | Step 6 | Adapter returns data to Core via IPC. Core doesn't index it yet. |
| Universal Inbox UI | Step 6 | No new inbox screen. |
| Proactive Context Engine | Step 6 | No background monitoring. |
| Subscription detection | Step 7 | CSV/OFX import is Step 7 scope. |
| Autonomy escalation prompts | Step 7 | Autonomy framework exists but doesn't proactively prompt. |
| Network Monitor (real-time) | Step 8 | Existing Privacy Dashboard is sufficient for now. |
| OAuth 2.0 | Sprint 3+ | App Passwords are the Sprint 2 approach. |
| IMAP IDLE (push notifications) | Step 6 | Polling is sufficient for Step 5. Push comes with the proactive engine. |
| Email attachment content fetching | Step 6 | Metadata only in Step 5. |

---

## Quality Bar

The adapters must handle real-world email and calendar servers — not just happy-path test cases. Specifically:

- **Gmail** with an App Password must work end-to-end (fetch inbox, send email, fetch calendar, create event)
- **Connection failures** must produce clear, actionable error messages — not stack traces or generic "connection failed"
- **Large mailboxes** must not crash or hang — if a user has 50,000 emails, the fetch with `limit: 50` must return 50 messages promptly, not attempt to download the entire mailbox
- **Malformed emails** (missing headers, non-UTF-8 bodies, broken MIME) must be handled gracefully — parse what you can, skip what you can't, never crash the pipeline
- **Credential entry** must feel safe — password fields masked, privacy badge visible, clear "stays on your device" messaging, no data transmitted until the user explicitly clicks "Test Connection"
