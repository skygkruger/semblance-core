# Final Cleanup Pass — localStorage Migration + Semblance Network + Verify Script Fix
## VERIDIAN SYNTHETICS — Claude Code Implementation Prompt

> **Baseline:** 6,327 tests passing (482 files), 0 failures, TypeScript clean, 38/40 verify
> **Constraint:** ZERO regressions. Test count goes UP or stays same. Never down.

---

## READ FIRST

1. `SEMBLANCE_BUILD_BIBLE.md`
2. `SEMBLANCE_STATE.md` at `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SEMBLANCE_STATE.md`

Record baseline:
```bash
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
npx tsc --noEmit 2>&1 | tail -5
node scripts/semblance-verify.js 2>&1 | tail -10
```

---

## TASK 1: Fix semblance-verify.js Method Name Mismatches

The verify script sends IPC method names that don't match bridge.ts case labels. This produces false results and has been broken since the script was written. Fix it NOW.

**Process:**
1. Read `scripts/semblance-verify.js` — find every IPC method name it sends
2. Read `packages/desktop/src-tauri/sidecar/bridge.ts` — find the corresponding `case` label for each
3. Fix every mismatch in the verify script

**Known mismatches (from STATE.md Issue 6 + audit findings):**
- `get_pref` / `set_pref` → bridge uses `get_onboarding_complete` / `set_onboarding_complete` / `get_user_name` / `saveAiNamePref`
- `search_files` → bridge uses `start_indexing` + knowledge graph tools (orchestrator-routed)
- `create_reminder` → orchestrator tool, not direct IPC. The verify should test `reminder_create` or equivalent bridge case label
- `web_search` → orchestrator tool. Verify should test `search_web` or equivalent bridge case label
- `get_morning_brief` → bridge uses `brief_get_morning`
- Network monitor methods → bridge uses `network:get_connections`, `network:get_stats`, etc.
- Audit trail methods → bridge uses `audit_verify_chain`, `audit_generate_receipt`, `audit_get_chain_status`
- Sovereignty report → bridge uses `report_generate_sovereignty`

**Do NOT guess method names. Read the actual bridge.ts case statement to find the exact strings.**

After fixing, run:
```bash
node scripts/semblance-verify.js 2>&1
```

Report the new score. It should be significantly higher than 38/40. If items still fail, report WHY — is it a method name issue or a genuine runtime dependency (needs Ollama, needs OAuth token, needs indexed data)?

---

## TASK 2: Migrate localStorage to Tauri plugin-store

Five screens + two components use localStorage for UI preferences. This is fragile (cleared on app data reset) and violates the spirit of sovereign local storage. Migrate all to Tauri's plugin-store (key-value persistence in the app data directory).

**Files to migrate:**

1. `packages/desktop/src/screens/BiometricSetupScreen.tsx` — biometric preference toggles
2. `packages/desktop/src/screens/CloudStorageSettingsScreen.tsx` — folder selection, sync state
3. `packages/desktop/src/screens/VoiceSettingsScreen.tsx` — voice settings
4. `packages/desktop/src/screens/AdversarialDashboardScreen.tsx` — opt-out state
5. `packages/desktop/src/screens/SettingsScreen.tsx` — clear/reset operations (localStorage.clear, localStorage.removeItem for session keys)
6. `packages/desktop/src/hooks/useTheme.ts` — theme preference
7. `packages/desktop/src/components/CanvasPanel.tsx` — panel open/closed state

**Migration pattern:**

Check if Tauri plugin-store is already a dependency. If not, check if `@tauri-apps/plugin-store` or equivalent exists in package.json. If neither exists, use IPC to the sidecar — add a simple `pref_get` / `pref_set` bridge handler pair that reads/writes to the existing SQLite preferences table (which already exists for onboarding prefs).

The simplest approach is likely the IPC route since the prefs SQLite table already exists:

```typescript
// BEFORE (fragile)
const theme = localStorage.getItem('semblance.theme') || 'system';
localStorage.setItem('semblance.theme', mode);

// AFTER (sovereign)
const result = await invoke('ipc_send', { message: JSON.stringify({ id: nanoid(), method: 'pref_get', params: { key: 'theme' } }) });
await invoke('ipc_send', { message: JSON.stringify({ id: nanoid(), method: 'pref_set', params: { key: 'theme', value: mode } }) });
```

If `pref_get` / `pref_set` handlers already exist in bridge.ts, use them. If not, add them — they should read/write the existing prefs table in SQLite.

**For SettingsScreen.tsx specifically:** The `localStorage.clear()` calls in reset/clear-data flows should instead call an IPC handler like `reset_all_prefs` that truncates the prefs table and clears session state server-side.

**After migration, verify:**
```bash
grep -rn "localStorage" packages/desktop/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v ".stories."
```

**Target: ZERO results.** Every localStorage reference must be gone from production code.

---

## TASK 3: Semblance Network Screen

BUILD BIBLE Section 6.6 specifies Semblance Network — peer-to-peer contextual sharing between Semblance instances. This is DISTINCT from TunnelPairing (which pairs your own devices). Semblance Network is about sharing context with OTHER Semblance users.

The TunnelPairingScreen currently exists at `/tunnel-pairing`. The route `/semblance-network` exists in the sidebar but needs a dedicated screen.

**Build `SemblanceNetworkScreen` covering:**

1. **Connection list** — show current peer connections (from a bridge handler querying paired_devices table filtered by type='peer' vs type='own_device')
2. **Connect flow** — mDNS discovery for local network + connection codes for remote. Use existing `PairingCoordinator` but with a peer type flag.
3. **Sharing controls** — granular consent: calendar availability, communication style, project context, topic expertise. Financial data, health data, raw documents, credentials are NEVER shareable (hardcoded exclusion).
4. **Revocation** — instant disconnect + delete shared context from other party.
5. **Activity log** — recent sharing events from Network Monitor.

**The screen should:**
- Live at `/semblance-network` route (already exists in sidebar)
- Fetch peer connections via IPC (add `network_peers_list`, `network_peer_connect`, `network_peer_disconnect`, `network_peer_sharing_config` bridge handlers if they don't exist)
- Show empty state: "No peer connections yet. Connect with other Semblance users on your local network or via connection codes."
- Gate behind Digital Representative tier (PremiumGate check)

**Do NOT over-engineer.** The screen needs to be functional and wired to real data, not a showcase. Match the design patterns of existing screens (use Design Bible tokens, BEM CSS, no raw hex).

---

## VERIFICATION

After all three tasks:

```bash
# Tests
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"

# TypeScript
npx tsc --noEmit 2>&1 | tail -5

# Verify script (should be higher than 38/40 now)
node scripts/semblance-verify.js 2>&1 | tail -10

# localStorage sweep (must be ZERO)
grep -rn "localStorage" packages/desktop/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v ".stories."

# Privacy audit
node scripts/privacy-audit/index.js 2>&1 | tail -3
```

**Deliverables:**
1. New verify score (must be > 38/40)
2. localStorage grep results (must be 0)
3. Test count
4. List of bridge handlers added
5. SemblanceNetworkScreen file path

Commit with:
```
fix: localStorage migration + Semblance Network screen + verify script alignment

- Migrated all localStorage usage to IPC-backed SQLite preferences
- Built SemblanceNetworkScreen for peer-to-peer context sharing (BUILD BIBLE 6.6)
- Fixed semblance-verify.js method name mismatches against bridge.ts
- Zero localStorage remaining in production desktop code
```
