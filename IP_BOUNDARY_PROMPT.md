# IP Boundary Separation — Public/Private Repository Split
## VERIDIAN SYNTHETICS — Claude Code Implementation Prompt

> **Priority:** HIGHEST — blocks open-source launch
> **Constraint:** ZERO regressions. ZERO test failures. ZERO functionality loss. ZERO stubs.
> **Verified by:** Orbital Director import graph trace (2026-03-18)

---

## PHASE 0: ROLLBACK SAFETY — DO THIS BEFORE ANYTHING ELSE

The last attempt at IP boundary work destroyed commits and lost 4 scripts. That will never happen again.

**Step 0A — Record the known-good state:**
```bash
cd C:\Users\skyle\desktop\world-shattering\semblance
git log --oneline -3
```
Paste this output. Current HEAD should be `2e98db9`.

**Step 0B — Create a safety tag and branch:**
```bash
git tag pre-ip-boundary-v2
git branch ip-boundary-backup
```

**Step 0C — Verify the safety net exists:**
```bash
git tag -l "pre-ip-boundary*"
git branch -l "ip-boundary*"
```
Both must show. If either fails, STOP.

**Step 0D — Record baseline metrics:**
```bash
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
npx tsc --noEmit 2>&1 | tail -5
node scripts/semblance-verify.js 2>&1 | tail -5
```
Write these numbers down. They are the rollback acceptance criteria.

### IF ANYTHING GOES WRONG AT ANY POINT:

```bash
# Nuclear rollback — restores everything to pre-boundary state
git checkout main
git reset --hard pre-ip-boundary-v2
git clean -fd
```

This single command recovers the entire codebase. The tag is immutable — it cannot be accidentally deleted by reset, revert, or force push. The backup branch is a second safety net.

### AFTER SUCCESSFUL COMPLETION:

Do NOT delete the tag or branch. They stay forever as an audit trail. If Sky wants to verify the separation didn't break anything weeks later, `git diff pre-ip-boundary-v2..HEAD` shows exactly what changed.

---

## READ FIRST

Read these files before writing any code:
1. `SEMBLANCE_BUILD_BIBLE.md` (gitignored in repo root — if not present, check `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\`)
2. `SEMBLANCE_STATE.md` at `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SEMBLANCE_STATE.md`
3. `packages/core/extensions/loader.ts` — understand the existing extension loading pattern
4. `packages/core/extensions/types.ts` — understand ExtensionInitContext

---

## THE PROBLEM

Proprietary implementation files are currently in the public `semblance-core` repo at `packages/core/`. These files contain monetizable IP — the financial intelligence, adversarial defense, style scoring, weekly digest, and Alter Ego Week engines. They must move to the private `semblence-representative` repo while keeping the product fully functional.

---

## VERIFIED IMPORT GRAPH (Orbital Director traced 2026-03-18)

Every import edge below has been confirmed by searching the actual codebase. There are no others.

### Files to move (19 total):

**FINANCE (5 files) — `packages/core/finance/`**
- `category-taxonomy.ts`
- `merchant-normalizer.ts`
- `recurring-detector.ts`
- `statement-parser.ts`
- `index.ts`

**DEFENSE (6 files) — `packages/core/defense/`**
- `dark-pattern-detector.ts`
- `dark-pattern-tracker.ts`
- `financial-advocate.ts`
- `financial-advocacy-tracker.ts`
- `optout-autopilot.ts`
- `types.ts`

**STYLE implementations (5 files) — `packages/core/style/` — NOT style-profile.ts**
- `style-injector.ts`
- `style-scorer.ts`
- `style-extractor.ts`
- `style-extraction-job.ts`
- `style-correction-processor.ts`

**KEEP PUBLIC:** `packages/core/style/style-profile.ts` — interfaces and types only

**DIGEST (2 files) — `packages/core/digest/`**
- `weekly-digest.ts`
- `index.ts`

**ALTER EGO WEEK (1 file) — `packages/core/agent/`**
- `alter-ego-week-engine.ts`

### Every importer in the public repo:

| File Moved | Imported By | Import Lines |
|------------|-------------|-------------|
| `finance/statement-parser.ts` | `bridge.ts` line 52 | `import { StatementParser }` |
| `finance/merchant-normalizer.ts` | `bridge.ts` line 53, `core/index.ts` line 21 | `import { MerchantNormalizer }` |
| `finance/recurring-detector.ts` | `bridge.ts` line 54, `core/index.ts` line 20 | `import { RecurringDetector }` |
| `defense/dark-pattern-detector.ts` | `bridge.ts` line 176 | `import { DarkPatternDetector }` |
| `style/style-injector.ts` | `orchestrator.ts` line 30 | `import { buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt }` |
| `style/style-scorer.ts` | `orchestrator.ts` line 31 | `import { scoreDraft, type StyleScore }` |
| `digest/weekly-digest.ts` | `bridge.ts` line 57 | `import { WeeklyDigestGenerator }` |
| `agent/alter-ego-week-engine.ts` | `bridge.ts` line 105 | `import { AlterEgoWeekEngine }` |

No other files in the codebase import from these modules.

---
## THE ARCHITECTURE — ADAPTER INTERFACES + EXTENSION REGISTRATION

The pattern already exists in the codebase: `packages/core/extensions/` provides a registration system. IP implementations register themselves at runtime when the Digital Representative extension loads. Without DR, the features degrade gracefully — they don't break, they just aren't available.

### Phase 1: Create Adapter Interfaces (in public repo)

Create thin interface files that define the contracts. These stay public. They contain zero implementation logic. For each, read the existing implementation file first, extract its public method signatures, and define them as interface methods. Export all data types that appear in those signatures.

#### 1A. `packages/core/finance/interfaces.ts` (NEW — replaces entire finance/ directory)
Must define: IStatementParser, IMerchantNormalizer, IRecurringDetector, plus ParsedTransaction, RecurringCharge, FinancialDashboardData types. Read the existing implementations to match signatures exactly.

#### 1B. `packages/core/defense/interfaces.ts` (NEW — replaces entire defense/ directory)
Must define: IDarkPatternDetector, plus DarkPatternFlag type. Read dark-pattern-detector.ts for exact method signatures.

#### 1C. `packages/core/style/style-adapter.ts` (NEW — decouples orchestrator from implementations)
Must export: StyleAdapter interface with methods buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt, scoreDraft. Plus DraftContext and StyleScore types. Read style-injector.ts and style-scorer.ts exports to match exactly.

#### 1D. `packages/core/digest/interfaces.ts` (NEW — replaces digest/ directory)
Must define: IWeeklyDigestGenerator, plus WeeklyDigestData and DigestSection types.

#### 1E. `packages/core/agent/alter-ego-week-types.ts` (NEW — replaces engine)
Must define: IAlterEgoWeekEngine, plus AlterEgoWeekState and AlterEgoWeekDayResult types.

**After creating all 5 interface files, verify:**
```bash
npx tsc --noEmit 2>&1 | tail -5
```
Must be clean. New files should not break anything — they're additive.

### Phase 2: Create the IP Adapter Registry (in public repo)

#### `packages/core/extensions/ip-adapter-registry.ts` (NEW)

A singleton registry class with:
- Registration methods for each IP group (registerFinance, registerDefense, registerStyleAdapter, registerDigest, registerAlterEgoWeek)
- Getter accessors returning adapter or null (statementParser, merchantNormalizer, recurringDetector, darkPatternDetector, styleAdapter, weeklyDigestGenerator, alterEgoWeekEngine)
- `isDRLoaded` boolean property

Export a singleton: `export const ipAdapters = new IPAdapterRegistry();`

**Verify after creation:** `npx tsc --noEmit` — must be clean.

### Phase 3: Rewire All Importers

**CRITICAL: This is where the last attempt failed. After every INDIVIDUAL file change, run:**
```bash
npx tsc --noEmit 2>&1 | tail -5
```
**If TypeScript breaks, fix it before moving to the next file. Do not batch changes.**

#### 3A. Rewire `orchestrator.ts` (lines 29-31)

**BEFORE:**
```typescript
import type { StyleProfileStore, StyleProfile } from '../style/style-profile.js';
import { buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt, type DraftContext } from '../style/style-injector.js';
import { scoreDraft, type StyleScore } from '../style/style-scorer.js';
```

**AFTER:**
```typescript
import type { StyleProfileStore, StyleProfile } from '../style/style-profile.js';
import type { StyleAdapter, StyleScore, DraftContext } from '../style/style-adapter.js';
import { ipAdapters } from '../extensions/ip-adapter-registry.js';
```

Then update every call site that uses buildStylePrompt(), buildInactiveStylePrompt(), buildRetryPrompt(), scoreDraft() to go through `ipAdapters.styleAdapter`. When null, skip style scoring — drafts generate without style matching. This IS correct free-tier behavior.

**Verify:** `npx tsc --noEmit` — clean before proceeding.

#### 3B. Rewire `bridge.ts` — Finance imports (lines 52-54)

Replace direct imports with:
```typescript
import { ipAdapters } from '../../../core/extensions/ip-adapter-registry.js';
```

Update all usages of statementParser, merchantNormalizer, recurringDetector to use `ipAdapters.statementParser` etc. When null, handlers return `{ error: 'Financial intelligence requires Digital Representative' }`.

Remove the `ensureFinanceComponents()` lazy-init function. Replace with a null check.

**Verify:** `npx tsc --noEmit` — clean before proceeding.

#### 3C. Rewire `bridge.ts` — Defense import (line 176)

Remove the DarkPatternDetector import. Update all darkPatternDetector usages to `ipAdapters.darkPatternDetector`. When null, return `{ error: 'Requires Digital Representative' }`.

**Verify:** `npx tsc --noEmit` — clean before proceeding.

#### 3D. Rewire `bridge.ts` — Digest import (line 57)

Remove the WeeklyDigestGenerator import and the `weeklyDigestGenerator` variable. Update `ensureDigestGenerator()` and all digest handlers to use `ipAdapters.weeklyDigestGenerator`. When null, return `{ error: 'Requires Digital Representative' }`.

**Verify:** `npx tsc --noEmit` — clean before proceeding.

#### 3E. Rewire `bridge.ts` — AlterEgoWeekEngine import (line 105)

Remove the AlterEgoWeekEngine import and the `alterEgoWeekEngine` variable. Update all 6 alter_ego_week_* handlers to use `ipAdapters.alterEgoWeekEngine`. When null, return `{ error: 'Requires Digital Representative' }`.

**Verify:** `npx tsc --noEmit` — clean before proceeding.

#### 3F. Rewire `packages/core/index.ts` (lines 20-21)

Replace direct construction of RecurringDetector/MerchantNormalizer with ipAdapters access. Pass null-safe values into the extension init context.

**Verify:** `npx tsc --noEmit` — clean before proceeding.

### Phase 4: CHECKPOINT — Verify Before Any Deletion

At this point NO implementation files have been deleted. Everything should still compile and all tests should pass because the implementations still exist — they're just no longer imported.

```bash
npx tsc --noEmit 2>&1 | tail -5
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
node scripts/semblance-verify.js 2>&1 | tail -5
```

**All three must match Phase 0 baseline exactly.** If not, STOP. Do NOT proceed to deletion. Report what failed.

**Create a checkpoint commit before deletion:**
```bash
git add -A
git commit -m "refactor: rewire all IP importers to adapter registry (pre-deletion checkpoint)

All importers now use ipAdapters registry. Implementation files still present.
This commit is a safe rollback point if deletion causes issues.
Tag: pre-ip-deletion-checkpoint"

git tag pre-ip-deletion-checkpoint
```

This gives us TWO rollback points: `pre-ip-boundary-v2` (before any changes) and `pre-ip-deletion-checkpoint` (after rewiring but before deletion).

### Phase 5: Delete implementation files from public repo

Only after Phase 4 passes clean. Delete ONE file at a time and verify:

```bash
# Finance — one at a time
git rm packages/core/finance/category-taxonomy.ts
npx tsc --noEmit 2>&1 | tail -3

git rm packages/core/finance/merchant-normalizer.ts
npx tsc --noEmit 2>&1 | tail -3

git rm packages/core/finance/recurring-detector.ts
npx tsc --noEmit 2>&1 | tail -3

git rm packages/core/finance/statement-parser.ts
npx tsc --noEmit 2>&1 | tail -3

git rm packages/core/finance/index.ts
npx tsc --noEmit 2>&1 | tail -3
```

If ANY `git rm` causes a TypeScript error, it means something still imports that file. STOP. Find the import. Fix it. Then resume.

Repeat for defense (6 files), style implementations (5 files), digest (2 files), alter-ego-week-engine (1 file).

**After ALL 19 deletions, full verification:**
```bash
npx tsc --noEmit 2>&1 | tail -5
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
```

### Phase 6: Handle tests that import deleted files

```bash
grep -rn "from.*core/finance/[^i]" tests/ --include="*.ts" | grep -v "interfaces"
grep -rn "from.*core/defense/[^i]" tests/ --include="*.ts" | grep -v "interfaces"
grep -rn "from.*style-injector\|style-scorer\|style-extractor\|style-extraction-job\|style-correction-processor" tests/ --include="*.ts"
grep -rn "from.*weekly-digest\|from.*alter-ego-week-engine" tests/ --include="*.ts"
```

For each test found:
1. If it tests pure implementation logic → copy to `C:\Users\skyle\desktop\world-shattering\semblence-representative\tests\ip-boundary\` then `git rm` from public
2. If it tests integration → convert to test through the interface, mock the adapter

**CRITICAL: Do NOT use `.skip`. Do NOT create empty test files. Do NOT add stub tests.**

Test count may decrease (moved tests). That is expected. But no test may be broken or skipped.

### Phase 7: Update CONTRIBUTING.md

Add this section after the existing content:

```markdown
## Open/Private Boundary

Semblance ships in two layers. This repository contains the sovereign architecture — 
the AI Core, Gateway, knowledge graph, privacy enforcement, and all free-tier features.

The Digital Representative module (`@semblance/dr`) is a proprietary commercial extension 
that provides advanced autonomous agency features. It registers its capabilities at runtime 
through the adapter registry in `packages/core/extensions/ip-adapter-registry.ts`.

Core contributions welcome. The DR module is not part of this repository.

### For contributors:
- Never import from `@semblance/dr` in this repository
- Use the interfaces in `finance/interfaces.ts`, `defense/interfaces.ts`, 
  `style/style-adapter.ts`, `digest/interfaces.ts`, `agent/alter-ego-week-types.ts`
- Features that depend on DR adapters should gracefully degrade when the adapter is null
- Run `grep -rn "@semblance/dr" packages/core/` to verify no DR imports leaked
```

### Phase 8: Final Verification

```bash
# Full test suite
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"

# TypeScript
npx tsc --noEmit 2>&1 | tail -5

# Privacy audit
node scripts/privacy-audit/index.js

# Verify no deleted file references remain
grep -rn "from.*finance/category-taxonomy\|from.*finance/merchant-normalizer\|from.*finance/recurring-detector\|from.*finance/statement-parser" packages/ --include="*.ts"
grep -rn "from.*defense/dark-pattern-detector\|from.*defense/dark-pattern-tracker\|from.*defense/financial-advocate" packages/ --include="*.ts"
grep -rn "from.*style/style-injector\|from.*style/style-scorer\|from.*style/style-extractor" packages/ --include="*.ts"
grep -rn "from.*digest/weekly-digest" packages/ --include="*.ts"
grep -rn "from.*agent/alter-ego-week-engine" packages/ --include="*.ts"

# ALL grep commands must return ZERO results

# Show what files remain in the separated directories
git ls-files | grep -E "finance/|defense/|digest/|style/"
# Expected: ONLY interfaces.ts files + style-profile.ts + style-adapter.ts
```

### Phase 9: Final Commit

```bash
git add -A
git commit -m "refactor: IP boundary separation complete — 19 proprietary files removed

- Created adapter interfaces: finance, defense, style, digest, alter-ego-week
- Created IPAdapterRegistry singleton for runtime registration  
- Rewired orchestrator.ts, bridge.ts, core/index.ts to use registry
- Removed 19 implementation files from public repo
- Moved implementation-specific tests to private repo
- Updated CONTRIBUTING.md with boundary documentation
- Zero functionality change when DR extension registers adapters
- Graceful degradation when DR not loaded (free tier)

Safety tags: pre-ip-boundary-v2, pre-ip-deletion-checkpoint
Rollback: git reset --hard pre-ip-boundary-v2"
```

---

## DELIVERABLES — PASTE THESE IN OUTPUT

After completion, paste ALL of the following:

1. `git log --oneline -5` — shows the commit chain
2. `git tag -l "pre-ip*"` — shows safety tags exist
3. `npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"` — final test count
4. `npx tsc --noEmit 2>&1 | tail -3` — TypeScript status  
5. `git ls-files | grep -E "finance/|defense/|digest/|style/"` — remaining files
6. `git diff --stat pre-ip-boundary-v2..HEAD` — complete change summary
7. List of any tests that were moved to private repo (file paths)
8. List of any tests that were converted to interface tests

---

## WHAT SUCCESS LOOKS LIKE

1. `packages/core/finance/` contains only `interfaces.ts`
2. `packages/core/defense/` contains only `interfaces.ts`
3. `packages/core/style/` contains `style-profile.ts` + `style-adapter.ts` — no implementations
4. `packages/core/digest/` contains only `interfaces.ts`
5. `alter-ego-week-engine.ts` gone, `alter-ego-week-types.ts` exists
6. `ip-adapter-registry.ts` exists in extensions/
7. TypeScript clean, all tests pass, privacy audit passes
8. Product works identically when DR registers real implementations
9. Product degrades gracefully without DR (free tier)
10. Safety tags exist for rollback

## STOP IMMEDIATELY IF:

- Test count drops without test files moving to private repo
- Any `.skip` added to any test
- Any stub file created (empty implementations, no-op functions)
- TypeScript errors after any individual change
- `grep` finds remaining imports of deleted files
- Verify score (38/40) drops
- You are unsure about any step — ask, don't guess

## ROLLBACK COMMANDS (for Sky if needed):

```bash
# Full rollback to before any IP boundary work:
git reset --hard pre-ip-boundary-v2
git clean -fd

# Partial rollback to after rewiring but before deletion:
git reset --hard pre-ip-deletion-checkpoint
git clean -fd
```
