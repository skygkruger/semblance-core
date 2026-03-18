# Session: 2026-03-12 - main (Gmail OAuth + Demo Prep)

## Git State
- Branch: `main`
- Commit: `54fcd24` - fix: refresh orchestrator prompt config when user/AI names are set during onboarding
- Uncommitted: No

## Work Context
**Active WO:** None (urgent demo prep)
**Task:** Fix Gmail OAuth XOAUTH2 pipeline end-to-end for investor demo
**Progress:** Gmail OAuth fully working. 3 bugs fixed. Desktop binary built and delivered.

## Commits This Session
1. `4193595` - fix: Gmail OAuth XOAUTH2 pipeline — end-to-end email fetch working
2. `880f40f` - fix: guard retryResponse null access in orchestrator pending-action path
3. `54fcd24` - fix: refresh orchestrator prompt config when user/AI names are set during onboarding

## What Got Fixed

### 1. Gmail OAuth → IMAP XOAUTH2 (never worked before, now works)
- **deriveThreadId Buffer crash**: ImapFlow returns a `Buffer` when specific header names are requested, not a `Map`. Every message parse was failing with `headers.get is not a function`. Fixed to handle both types.
- **Token auto-refresh**: Added `refreshGoogleToken()` in EmailAdapter — calls Google token endpoint with stored refresh_token when access token expires.
- **Email lookup**: Gmail profile API (`gmail.googleapis.com/gmail/v1/users/me/profile`) used instead of userinfo endpoint (which requires `email` scope). Works with `mail.google.com` scope alone.
- **Scopes**: Added `openid email` to Gmail OAuth config for future re-authorizations.
- **Diagnostics**: Added `connector.debug` IPC handler for full token/config state inspection.
- **Test script**: Created `scripts/test-gmail-oauth.js` — end-to-end single-process test.
- **Verified**: 200 emails fetched via IMAP XOAUTH2 for sky@veridian.run, tokens persist across sidecar restarts.

### 2. CI Fix (orchestrator test failures)
- `retryResponse.message.content` crashed when mock LLM returned undefined in pending-action path. Added optional chaining guard.
- CI green: 477 files, 6215 tests, 0 failures.

### 3. Prompt Config Refresh (names not sticking after onboarding)
- `set_user_name`, `set_ai_name`, and `set_onboarding_complete` IPC handlers now call `_refreshPromptConfig()` to immediately update the orchestrator's system prompt.
- Previously, prompt config was only wired once at sidecar init (before onboarding ran), so fresh installs left the orchestrator using defaults ("Semblance", no user name).
- Also strengthened no-name prompt: "Do NOT guess or make up a name" (7B model was hallucinating "Emily").

## Key Files Modified
- `packages/gateway/services/email/imap-adapter.ts` — deriveThreadId Buffer handling
- `packages/gateway/services/email/email-adapter.ts` — token refresh, Gmail profile API, logging
- `packages/desktop/src-tauri/sidecar/bridge.ts` — connector.debug, prompt refresh, OAuth logging
- `packages/core/agent/orchestrator.ts` — retryResponse guard, stronger no-name prompt
- `scripts/test-gmail-oauth.js` — new end-to-end test

## What's Working
- Gmail OAuth flow (browser auth → token exchange → SQLite storage)
- IMAP XOAUTH2 email fetch (200 messages, zero errors)
- Token persistence across sidecar restarts
- Token auto-refresh for expired access tokens
- CI green (all 3 jobs)
- Desktop binary built and delivered

## What Needs Verification (Post-Demo)
- Whether prompt config refresh actually fixes the name issue on fresh install (user was about to test)
- Whether Gmail connector works from within the installed desktop app (not just sidecar test script)
- User always deletes `~/.semblance/` between installs — needs to re-authenticate Gmail each time

## Google Cloud Console State
- App published to Production (was in Testing with 0 test users)
- Client type: Desktop (correct for localhost OAuth)
- Client ID: 452734472795-uaf2eqh... (in sidecar .env)

## Next Steps (in order)
1. Get demo feedback from user
2. Verify all connectors work in installed app (not just Gmail)
3. Address any demo feedback
4. Continue Step 33 validation work

## Notes
- User has investor demo imminently — time-critical session
- User rule: do NOT build without checking in first
- User always deletes ~/.semblance/ folder between installs — this is why tokens/prefs are lost each time
- The "Emily" hallucination was a 7B model behavior, not a code bug — but the prompt fix should prevent it
- Latent bug: prompt config was never refreshed after onboarding since project inception — only surfaced today because user hadn't done a fresh install + onboarding since the system prompt was restructured

---
*Session saved: 2026-03-12T15:05:00-07:00*
