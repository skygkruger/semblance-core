# Sprint 2 — Step 5B: Adapter Test Hardening

## Implementation Prompt for Claude Code

**Date:** February 20, 2026
**Prerequisite:** Step 5 (Gateway Service Adapters ✅ — 614 tests passing, privacy audit clean)
**Test Baseline:** 614 passing tests, privacy audit exit 0
**Scope:** Harden IMAP, SMTP, and CalDAV adapter test coverage before Step 6 puts AI in control of them

---

## Mission

Step 6 gives the AI autonomous control over email and calendar actions in Partner mode — archiving, sending, drafting, scheduling, conflict resolution. The adapter layer these actions flow through currently has 15 tests total (IMAP: 5, SMTP: 6, CalDAV: 4). That is not enough coverage for infrastructure that will autonomously act on a user's real accounts.

This step adds comprehensive edge case, failure mode, and resilience tests to all three adapters. No new features. No new UI. No architectural changes. Just tests that ensure the adapter layer is rock-solid before the AI starts driving it.

**When this step is complete,** every realistic failure mode — malformed data, protocol errors, connection failures, concurrency issues, and security edge cases — has a test that proves the adapter handles it gracefully. Nothing crashes, nothing corrupts, nothing sends when it shouldn't.

**Read before writing tests:**
1. `packages/gateway/services/email/imap-adapter.ts` — understand every code path
2. `packages/gateway/services/email/smtp-adapter.ts` — understand every code path
3. `packages/gateway/services/calendar/caldav-adapter.ts` — understand every code path
4. The existing adapter tests — understand what's already covered so you don't duplicate

---

## Why This Matters Now

In Step 6, the Orchestrator will call `email.fetch` to read a user's inbox, reason about each message, then call `email.send` or `email.draft` to respond autonomously. In Partner mode, routine emails are sent without approval. If the SMTP adapter has a rate limiter gap, the AI could send dozens of emails in a burst. If the IMAP adapter chokes on a malformed MIME message, the entire inbox fetch fails and the AI operates on incomplete data. If the CalDAV adapter silently overwrites a recurring event series when updating a single instance, the user loses their weekly meetings.

These are not hypothetical risks. They are the exact class of bugs that surface when a system moves from "human triggers each action" to "AI triggers actions autonomously at scale."

---

## Test Requirements by Adapter

### A. IMAP Adapter — Target: 25+ additional tests

The IMAP adapter is the most complex and handles the messiest real-world data. Test these categories:

#### A1. Message Parsing Edge Cases

| Test | What It Validates |
|------|-------------------|
| Message with no text body (HTML only) | `body.text` falls back to stripped HTML or empty string, does not throw |
| Message with no body at all (headers only) | Returns empty body, does not throw |
| Message with multiple text/plain parts (multipart/alternative) | Selects the correct part, doesn't concatenate randomly |
| Message with deeply nested MIME structure (multipart/mixed containing multipart/alternative) | Parses without stack overflow or timeout |
| Message with non-UTF-8 body (ISO-8859-1, Windows-1252, Shift_JIS) | Decodes correctly or replaces invalid chars, never throws |
| Message with broken/incomplete MIME headers | Skips malformed parts, returns what it can parse |
| Message with extremely long subject (>1000 chars) | Truncates or returns full, doesn't crash |
| Message with no Subject header | Returns empty string for subject |
| Message with no From header | Returns reasonable fallback, doesn't throw |
| Message with no Date header | Uses fetch timestamp as fallback |
| Message with malformed email addresses in From/To/Cc | Parses what it can, returns raw string for unparseable addresses |
| Message with attachments >10MB (metadata only) | Returns attachment metadata without fetching content, doesn't OOM |
| Message with zero-byte attachment | Handles gracefully |

#### A2. Threading

| Test | What It Validates |
|------|-------------------|
| Message with valid In-Reply-To header | Thread ID derived correctly |
| Message with valid References header (multiple IDs) | Thread ID derived from first reference |
| Message with both In-Reply-To and References | Consistent thread ID (one takes precedence) |
| Message with neither In-Reply-To nor References | Unique thread ID (standalone message) |
| Message with malformed In-Reply-To (not a valid Message-ID) | Falls back gracefully, doesn't crash |

#### A3. Connection and Protocol

| Test | What It Validates |
|------|-------------------|
| Auth failure (wrong password) | Returns clear error message, doesn't retry indefinitely |
| Connection timeout | Returns clear error within reasonable time (<10s), doesn't hang |
| Connection drop mid-fetch (server closes connection during message download) | Partial results returned or clear error, doesn't corrupt state |
| TLS handshake failure | Clear error mentioning TLS, not a raw OpenSSL error |
| Non-TLS connection rejected when `useTLS: true` | Adapter refuses to connect |
| Mailbox/folder not found | Clear error naming the missing folder |
| Fetch with `limit: 0` | Returns empty array, doesn't fetch everything |
| Fetch with `limit: 1` on mailbox with 50,000 messages | Returns 1 message promptly, doesn't scan entire mailbox |
| Fetch with `since` date in the future | Returns empty array |
| Concurrent fetch requests on same connection pool | Both complete, no corruption or deadlock |

#### A4. Connection Pool

| Test | What It Validates |
|------|-------------------|
| Pool reuses existing connection for sequential requests | Connection count doesn't grow unbounded |
| Pool creates new connection when existing one is busy | Second request doesn't block on first |
| Pool releases connection after idle timeout | Connection closed after 5 min idle |
| Pool handles connection that died between requests | Detects dead connection, creates new one, completes request |

### B. SMTP Adapter — Target: 20+ additional tests

SMTP is the highest-risk adapter because it performs irreversible actions (sent emails cannot be unsent).

#### B1. Security and Validation

| Test | What It Validates |
|------|-------------------|
| From address doesn't match credential | Rejected before sending, clear error |
| From address is empty | Rejected |
| To array is empty | Rejected |
| To contains invalid email format | Rejected before sending |
| Cc contains invalid email format | Rejected |
| Subject is empty | Allowed (some emails legitimately have no subject) |
| Body is empty | Allowed (send anyway) |
| Body is extremely large (>1MB) | Handled without OOM — either sent or rejected with size limit error |

#### B2. Rate Limiting

| Test | What It Validates |
|------|-------------------|
| 10 emails sent rapidly — all succeed (within limit) | All 10 sent |
| 11th email within same minute — rejected | Returns `rate_limited` status, does NOT send |
| After rate limit window expires, sending works again | 11th email succeeds after waiting |
| Rate limits are per-account (account A limit doesn't affect account B) | Two accounts can each send 10/min independently |
| Rate limit state survives adapter method calls (not reset per-call) | Counter is persistent within the window |

#### B3. Threading and Headers

| Test | What It Validates |
|------|-------------------|
| Reply with `replyToMessageId` — In-Reply-To header set correctly | Header present and formatted as `<messageId>` |
| Reply with `replyToMessageId` — References header includes original | References chain is correct |
| New email (no `replyToMessageId`) — no In-Reply-To or References | Headers absent |
| Generated Message-ID is globally unique and well-formed | Matches `<unique@domain>` pattern |
| Reply-To field not set (From is used for replies) | No spurious Reply-To header |

#### B4. Connection Failures

| Test | What It Validates |
|------|-------------------|
| Auth failure | Clear error, email NOT sent |
| Connection timeout | Clear error within reasonable time |
| Connection drop after EHLO but before DATA | Email NOT sent, clear error |
| TLS handshake failure | Clear error |
| Server returns 5xx error on send | Email NOT sent, error includes server message |
| Server returns 4xx error (temporary failure) | Clear error distinguishing temporary vs permanent failure |

#### B5. Draft Saving

| Test | What It Validates |
|------|-------------------|
| Draft saves to IMAP Drafts folder | Draft retrievable via IMAP fetch on Drafts |
| Draft with `replyToMessageId` includes threading headers | In-Reply-To set on draft |
| Draft save fails (IMAP connection issue) | Clear error, doesn't crash SMTP adapter |

### C. CalDAV Adapter — Target: 20+ additional tests

#### C1. iCalendar Parsing Edge Cases

| Test | What It Validates |
|------|-------------------|
| Event with no SUMMARY (title) | Returns empty string for title, doesn't throw |
| Event with no DTEND (only DTSTART + DURATION) | End time calculated from duration |
| Event with no DTEND and no DURATION | End time equals start time (zero-duration event) |
| Event with DTSTART as DATE (all-day event, no time component) | Parsed correctly, flagged as all-day |
| Event with timezone (VTIMEZONE component) | Times converted to UTC or preserved with timezone |
| Event with attendees in various PARTSTAT values | All valid statuses mapped correctly |
| Event with no attendees | Empty array, doesn't throw |
| Event with no organizer | Reasonable fallback |
| Event with RRULE (daily recurrence) | Recurrence string preserved, individual instances expanded within date range |
| Event with EXDATE (recurrence exception) | Exception dates excluded from instance expansion |
| Event with malformed iCalendar (missing END:VEVENT) | Skipped or partial parse, doesn't crash pipeline |
| Event with extremely long DESCRIPTION (>10,000 chars) | Handled without truncation issues |

#### C2. CRUD Operations

| Test | What It Validates |
|------|-------------------|
| Create event — valid iCalendar generated and PUT succeeds | Event retrievable after creation |
| Create event with attendees — ATTENDEE properties included | Attendees in generated iCalendar |
| Update event — fetches existing, modifies, PUTs back | Only specified fields changed, others preserved |
| Update event — event not found (404) | Clear error, doesn't create a new event |
| Update event — concurrent modification (server returns 412 Precondition Failed or 409 Conflict) | Clear error, doesn't silently overwrite |
| Fetch events with date range spanning zero events | Returns empty array |
| Fetch events with very wide date range (1 year) | Returns events without timeout |

#### C3. Calendar Discovery

| Test | What It Validates |
|------|-------------------|
| Discovery finds multiple calendars | All returned with correct display names |
| Discovery finds zero calendars | Returns empty array, doesn't error |
| Discovery with insufficient permissions | Clear error |

#### C4. Connection Failures

| Test | What It Validates |
|------|-------------------|
| Auth failure | Clear error message |
| Connection timeout | Clear error within reasonable time |
| Server returns malformed XML/iCalendar | Adapter doesn't crash, returns error or partial results |
| TLS failure | Clear error |
| Connection pool: idle connection reuse | Works without re-auth |
| Connection pool: dead connection recovery | Detects and replaces |

---

## Implementation Approach

### Mock Servers

The existing Step 5 tests already use mock servers. Extend them:

- **IMAP mock:** Add configurable responses for malformed messages, large mailboxes, connection drops. The mock should be able to serve messages with specific MIME structures, encoding issues, and missing headers on a per-test basis.
- **SMTP mock:** Add configurable failure modes — reject after EHLO, reject after DATA, return 4xx vs 5xx, slow response (for timeout testing).
- **CalDAV mock:** Add configurable responses for malformed iCalendar, 409/412 conflicts, empty calendars, permission errors.

If the existing mock infrastructure doesn't support these scenarios, extend it. Mock server utilities are test-only code (`devDependencies`) and do not affect the production bundle or privacy audit.

### Test Organization

Add tests to the existing test files:
- `tests/gateway/imap-adapter.test.ts` — expand from 5 to 30+ tests
- `tests/gateway/smtp-adapter.test.ts` — expand from 6 to 26+ tests  
- `tests/gateway/caldav-adapter.test.ts` — expand from 4 to 24+ tests

Group tests with `describe` blocks matching the categories above (Parsing Edge Cases, Connection Failures, Rate Limiting, etc.) for readability.

### What You Are NOT Doing

- No new features
- No new UI
- No architectural changes
- No changes to adapter implementation code UNLESS a test reveals a genuine bug (in which case: fix the bug, document it, keep the fix minimal)
- No changes to the privacy audit pipeline
- No changes to the sidecar bridge or Tauri commands

If a test reveals that the adapter doesn't handle an edge case (e.g., non-UTF-8 body throws an unhandled exception), fix the adapter and document the fix. That's the whole point of this step — find the gaps before the AI exploits them.

---

## Exit Criteria

**Step 5B is complete when ALL of the following are true:**

1. ☐ IMAP adapter has 30+ tests covering parsing edge cases, threading, connection failures, and connection pool behavior
2. ☐ SMTP adapter has 26+ tests covering validation, rate limiting, threading headers, connection failures, and draft saving
3. ☐ CalDAV adapter has 24+ tests covering iCalendar parsing, CRUD operations, calendar discovery, and connection failures
4. ☐ Every test category listed in this document has at least one test (no categories skipped)
5. ☐ All adapter bugs discovered during testing are fixed and documented
6. ☐ All 614 existing tests pass — zero regressions
7. ☐ All new tests pass
8. ☐ `pnpm run privacy-audit` exits 0 — no regressions

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Mock server implementation details
- Test assertion patterns and organization
- Minimal adapter bug fixes discovered during testing (document each one)
- Adding test-only `devDependencies` for mock servers

Escalate if:
- A discovered bug requires changing the adapter's public API
- A discovered bug requires changing the IPC protocol or payload schemas
- A discovered bug requires a new production dependency
- You find a security vulnerability in the adapter layer

Document all bug fixes discovered during testing:
```typescript
/**
 * BUG FIX: [Brief description]
 * Found by: Step 5B test hardening
 * Root cause: [What was wrong]
 * Fix: [What changed]
 */
```
