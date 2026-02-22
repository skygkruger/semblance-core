# Step 10 Remediation — Fix Blocking Issues

## Implementation Prompt for Claude Code
**Date:** February 21, 2026
**Sprint:** 3 (Becomes Powerful)
**Baseline:** Step 10 code landed in commit 96007cd. Audit found 5 blocking issues. The implementation architecture is sound — this is wiring fixes, not a rework.
**Canonical references:** Read `CLAUDE.md` and `DESIGN_SYSTEM.md` from the project root before making any changes.

---

## Context

An independent audit of commit 96007cd found that Step 10's implementation is architecturally correct — privacy isolation holds, Gateway adapter pattern is followed, SSRF protection is thorough, Orchestrator integration is clean. However, there are critical wiring gaps that would cause runtime failures. The code is ~90% complete but cannot be marked done until these are resolved.

**Do NOT touch any code that the audit marked as PASS.** The IPC types, payloads, zod schemas, reminder store, all four adapters, web intelligence routing, reminder manager, quick capture, scheduler, all UI components, settings, and privacy isolation are all correct. Leave them alone.

**Fix ONLY what's broken.** This is a surgical remediation, not a refactor.

---

## Blocking Issues — Must Fix (5 Items)

### Fix 1: Run the Full Test Suite and Verify All Tests Pass
`test: verify all Step 10 tests pass with full suite run`

The vitest results on disk show the pre-Step-10 baseline (1,520 tests across 86 files). The 14 new test files from Step 10 were never executed post-commit.

**Action:**
1. Run the full test suite: `npm test` (or equivalent vitest command).
2. If any of the 232+ new tests fail, fix them.
3. If any of the original 1,520 tests regressed, fix the regression.
4. Record the actual test count in the commit message. Do not estimate — report the exact number from the test runner output.

**This must be the LAST commit** — run the suite after all other fixes are applied.

---

### Fix 2: IPC Method Name Mismatch
`fix: align IPC calls to use sendAction() instead of send()`

All Step 10 core modules call `ipcClient.send('web.search', payload)` but the `IPCClient` interface defines `sendAction()`. This means every web search, web fetch, reminder, and quick capture call will throw at runtime.

**Action:**
1. Check the `IPCClient` interface in the codebase. Determine the correct method name (it should be `sendAction()` based on the audit, but verify).
2. Update ALL Step 10 callers to use the correct method name. Files affected:
   - `packages/core/agent/web-intelligence.ts`
   - `packages/core/agent/reminder-manager.ts`
   - `packages/core/agent/quick-capture.ts`
3. Search for any other `.send(` calls in Step 10 code that should be `.sendAction(`.
4. Verify TypeScript compiles with zero errors in the affected files after the change.

**Do NOT rename the interface method.** The existing interface is used by Sprint 1 and Sprint 2 code that works correctly. Change the callers, not the interface.

---

### Fix 3: Register Adapters in Gateway Startup
`security: register Step 10 adapters in Gateway service registry`

The new adapters (`ReminderAdapter`, `WebSearchAdapter`, `WebFetchAdapter`, `SearXNGAdapter`) are only instantiated in test files. `packages/gateway/index.ts` (or wherever the Gateway startup registers adapters) does not register any of them. In production, `web.search` actions would hit a stub adapter and silently fail.

**Action:**
1. Open `packages/gateway/index.ts` (or equivalent Gateway startup file).
2. Find where existing adapters (IMAP, SMTP, CalDAV, model-adapter) are registered with the service registry.
3. Follow the EXACT same pattern to register:
   - `WebSearchAdapter` (or the `WebSearchAdapterFactory` that selects Brave vs. SearXNG based on config) for `web.search`
   - `WebFetchAdapter` for `web.fetch`
   - `ReminderAdapter` for `reminder.create`, `reminder.update`, `reminder.list`, `reminder.delete`
4. Verify the adapters receive their required dependencies (credential store for API key, settings for provider selection, reminder store for reminder adapter).
5. If the factory pattern is used for web search, register the factory's output — the factory should run at startup to select the correct adapter based on current settings, and re-run when settings change.

**Test:** After this fix, manually trace the code path from an incoming `web.search` ActionRequest through the Gateway to verify it reaches the Brave adapter (not a stub).

---

### Fix 4: Wire estimatedTimeSavedSeconds into Audit Trail
`fix: connect time-saved tracking to audit trail for Step 10 actions`

The `TIME_SAVED_DEFAULTS` map exists with correct values (`web.search: 30`, `web.fetch: 120`, `reminder.create: 60`) and `getDefaultTimeSaved()` is implemented, but it's dead code — never imported or called in the validator pipeline. This breaks the weekly digest's time-saved aggregation (a Sprint 2 requirement that must not regress).

**Action:**
1. Find where the Gateway validator calls `auditTrail.append()` (or equivalent) for action logging. This is in `packages/gateway/ipc/validator.ts` or the validation pipeline.
2. Import `getDefaultTimeSaved` from wherever `TIME_SAVED_DEFAULTS` is defined.
3. At the point where the audit trail entry is created, add `estimatedTimeSavedSeconds: getDefaultTimeSaved(action.action)` (or equivalent — match the field name used by existing audit entries from Sprint 2).
4. Verify that existing Sprint 2 actions (email.send, calendar.create, etc.) already pass `estimatedTimeSavedSeconds` — if they do, follow the same pattern exactly. If they use a different mechanism, use that mechanism instead.
5. Verify the weekly digest test still aggregates time-saved correctly with the new action types included.

**Test:** Write a test (or extend an existing audit trail test) that verifies a `web.search` audit entry includes a non-zero `estimatedTimeSavedSeconds` value.

---

### Fix 5: Add 2 Tests to Web Intelligence
`test: add missing web intelligence tests to meet Step 10 minimum`

The Step 10 spec requires minimum 15 tests for the knowledge-graph-first routing (Commit 8). `web-intelligence.test.ts` has 13 tests — 2 short.

**Action:**
1. Add 2 additional tests to `web-intelligence.test.ts`. Suggested coverage gaps to fill:
   - Test that a `local_then_web` classified query with HIGH local relevance scores (above threshold) returns local results without firing web search.
   - Test that a `local_then_web` classified query with LOW local relevance scores fires web search as fallback.
2. These two tests specifically validate the threshold behavior of the `local_then_web` routing path, which is the most nuanced classification category.

---

## Should Fix (3 Items)

These are not blockers but should be addressed in this remediation pass.

### Fix 6: Add Action-Specific Rate Limits
`fix: add rate limit configuration for Step 10 action types`

`DEFAULT_ACTION_LIMITS` in `rate-limiter.ts` has no entries for `web.search`, `web.fetch`, or `reminder.*`. They fall back to the global default (60/hour), which is accidentally reasonable for web actions but too restrictive for local-only reminder operations.

**Action:**
1. Add to `DEFAULT_ACTION_LIMITS`:
   - `web.search`: 60 per hour (matches Brave free tier: ~33/hour = 2000/month ÷ 720 hours)
   - `web.fetch`: 120 per hour (more generous — URL fetching is less API-constrained)
   - `reminder.create`: 300 per hour (local-only, no API cost)
   - `reminder.update`: 300 per hour (local-only)
   - `reminder.list`: 600 per hour (read-only, local)
   - `reminder.delete`: 300 per hour (local-only)

---

### Fix 7: Pre-Seed Brave Search Domain on Allowlist
`fix: add api.search.brave.com to default allowlist when search is configured`

`api.search.brave.com` may not be pre-authorized on the user's allowlist, causing first-search failures.

**Action:**
1. When the user saves a Brave Search API key in Settings, automatically add `api.search.brave.com` to the Gateway allowlist if not already present.
2. Similarly, when a SearXNG URL is configured, add that domain to the allowlist.
3. This should happen in the settings save handler, not at Gateway startup — the domain is only needed when the feature is configured.

---

### Fix 8: Document Commit Strategy Deviation
`docs: document single-commit deviation from Step 10 spec`

The spec required 13 separate commits. A single monolithic commit was made instead. This is not ideal but is not worth rebasing history over.

**Action:**
1. Add a note to the completion report (or a comment in the commit) acknowledging the deviation: "Step 10 delivered as a single commit instead of 13 sequential commits as specified. All functional requirements are met. Future steps should follow the specified commit strategy for bisectability."
2. For Step 11 and beyond: follow the commit strategy as specified. One logical change per commit.

---

## Commit Strategy for Remediation

Execute these as separate commits in this order:

1. `fix: align IPC calls to use sendAction() instead of send()` (Fix 2)
2. `security: register Step 10 adapters in Gateway service registry` (Fix 3)
3. `fix: connect time-saved tracking to audit trail for Step 10 actions` (Fix 4)
4. `test: add missing web intelligence tests to meet Step 10 minimum` (Fix 5)
5. `fix: add rate limit configuration for Step 10 action types` (Fix 6)
6. `fix: add api.search.brave.com to default allowlist when search is configured` (Fix 7)
7. `test: verify all tests pass — full suite run` (Fix 1 — runs LAST, after all fixes)

Each commit must compile with zero TypeScript errors. The final commit must include the full test suite output showing the exact passing count.

---

## Exit Criteria for Remediation

1. ALL Step 10 tests actually execute and pass (verified by test runner output, not estimated).
2. IPC method name is consistent — all Step 10 callers use the correct `IPCClient` method.
3. All 4 new adapters registered in Gateway startup and reachable for their respective ActionTypes.
4. `estimatedTimeSavedSeconds` present on audit trail entries for `web.search`, `web.fetch`, and `reminder.create`.
5. `web-intelligence.test.ts` has 15+ tests.
6. Action-specific rate limits configured for all new ActionTypes.
7. Brave Search domain pre-seeded on allowlist when API key is configured.
8. Zero TypeScript errors in Step 10 files.
9. All original 1,520 tests still pass (no regressions).
10. Total test count verified and reported accurately.

---

## Completion Report

When remediation is complete, provide:

1. **Each fix** — what was wrong, what you changed, which files were modified.
2. **Exact test count** — copy the final line of the test runner output showing total tests, passed, failed.
3. **Any surprises** — anything you found during remediation that wasn't in the audit.
4. **Confirmation** — explicit statement: "All 27 Step 10 exit criteria now pass. Total tests: [exact number]. Zero failures."

---

## Remember

The architecture is good. The code is good. The wiring is broken. Fix the wires, verify the tests, move on. Do not refactor, do not reorganize, do not touch passing code. Surgical fixes only.
