# Step 22 — Health & Wellness Tracking

## Context

Step 21 (Form & Bureaucracy Automation) is COMPLETE. 3,313 tests passing, 0 failures. This is the FINAL feature step of Sprint 4 and the last step before the mandatory repo split gate. After Step 22 closes, the physical repo split (`semblance-core` + `semblance-dr`) executes before Sprint 5 begins. No exceptions.

This step delivers health data ingestion (HealthKit on iOS, manual entries everywhere), statistical pattern correlation with calendar and activity data, health insights via the proactive engine, and a wellness dashboard. All correlations are computed statistically — the LLM generates natural language descriptions of patterns, but NEVER invents the patterns themselves.

**This is a Digital Representative (premium) feature.** It ships in the premium repo and follows the same extension registration pattern as Steps 19–21. Zero hardcoding in the orchestrator or proactive engine.

---

## Critical Files to Consume

Read these files BEFORE writing any code. Understand their APIs — do not reimplement anything that already exists.

```
File: packages/core/extensions/types.ts
What Step 22 Uses: ExtensionTool, ToolHandler, ExtensionInsightTracker, SemblanceExtension

File: packages/core/representative/insight-tracker.ts
What Step 22 Uses: Pattern reference — HealthInsightTracker follows the same ExtensionInsightTracker interface

File: packages/core/representative/follow-up-tracker.ts
What Step 22 Uses: Pattern reference — SQLite table pattern with status tracking

File: packages/core/knowledge/knowledge-graph.ts
What Step 22 Uses: KnowledgeGraph — for calendar event queries in correlation analysis

File: packages/core/agent/ipc-client.ts
What Step 22 Uses: IPCClient — for calendar.fetch to get event data for correlation. NOT for health data (health stays local).

File: packages/core/premium/premium-gate.ts
What Step 22 Uses: PremiumGate.isFeatureAvailable(), PremiumFeature type (needs 2 new values)

File: packages/core/platform/types.ts
What Step 22 Uses: DatabaseHandle, PlatformAdapter — for HealthKit access on iOS via platform adapter

File: packages/core/llm/types.ts
What Step 22 Uses: LLMProvider.chat() — ONLY for generating natural language descriptions of statistically-computed patterns. Never for computing the patterns themselves.
```

---

## Scope Boundary — READ THIS

**IN SCOPE:**
- HealthKit data import on iOS (steps, sleep duration, heart rate, workouts)
- Manual health entries on all platforms (mood, energy, symptoms, medication, water intake)
- Statistical pattern correlation (health × calendar × activity)
- Natural language insight generation from statistical patterns
- Wellness dashboard with trends and correlation visualizations
- Health insights surfaced via extension insight tracker
- Medical advice disclaimers on all health-related UI

**OUT OF SCOPE — DO NOT BUILD:**
- Fitbit / Google Fit / wearable API integration (post-launch — requires Gateway adapters)
- Real-time streaming from wearables (batch import only)
- Medical diagnosis, prescription, or treatment recommendations
- Calorie counting or diet tracking (too specialized, liability risk)
- Integration with medical records (EHR/FHIR — post-launch vertical)
- Any transmission of health data over the network (zero network for health — no exceptions)

---

## Architecture

### Health Data Storage

All health data lives in a single SQLite table. No embedding, no knowledge graph storage for health — this is structured time-series data, not semantic content.

```typescript
// packages/core/health/types.ts

// ── Data Types ──

type HealthMetricType =
  | 'steps'           // Daily step count (number)
  | 'sleep_duration'  // Minutes of sleep (number)
  | 'heart_rate'      // BPM snapshot (number)
  | 'workout'         // Workout session (duration in minutes + type string)
  | 'mood'            // 1-5 scale (manual entry)
  | 'energy'          // 1-5 scale (manual entry)
  | 'symptom'         // Free text (manual entry)
  | 'medication'      // Medication name + dosage (manual entry)
  | 'water'           // Glasses/ml (manual entry);

interface HealthEntry {
  id: string;
  metricType: HealthMetricType;
  value: number;               // Primary numeric value
  label?: string;              // For symptom text, medication name, workout type
  recordedAt: string;          // ISO timestamp — when the metric was recorded
  source: 'healthkit' | 'manual';
  metadata?: Record<string, string>;  // Flexible key-value for source-specific data
}

// ── Correlation Types ──

interface CorrelationResult {
  metricA: HealthMetricType;
  metricB: string;             // Can be health metric OR calendar pattern (e.g., 'evening_meetings')
  correlation: number;         // Pearson r, -1 to 1
  sampleSize: number;          // Number of data points
  significance: 'strong' | 'moderate' | 'weak' | 'none';  // Based on |r| thresholds
  direction: 'positive' | 'negative';
  description?: string;        // LLM-generated natural language (AFTER statistical computation)
}

// ── Insight Types ──

interface HealthInsight {
  id: string;
  type: 'trend' | 'correlation' | 'anomaly' | 'streak';
  title: string;               // "Sleep dropping this week"
  description: string;         // "Your average sleep this week is 5.8 hours, down from 7.2 last week"
  severity: 'info' | 'attention' | 'warning';
  basedOn: CorrelationResult | TrendData;
  generatedAt: string;
}
```

### HealthKit Import (iOS Only)

HealthKit is an iOS-only framework. The import uses the PlatformAdapter pattern — iOS provides a real HealthKit adapter, all other platforms return "not available."

```typescript
// packages/core/health/healthkit-adapter.ts

interface HealthKitAdapter {
  isAvailable(): boolean;                                    // true on iOS, false everywhere else
  requestAuthorization(): Promise<boolean>;                  // iOS HealthKit permission prompt
  fetchSteps(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
  fetchSleep(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
  fetchHeartRate(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
  fetchWorkouts(startDate: Date, endDate: Date): Promise<HealthEntry[]>;
}

// Implementation note: On non-iOS platforms, create a NoOpHealthKitAdapter
// that returns isAvailable() = false and empty arrays for all fetch methods.
// The UI should show "HealthKit is available on iOS" on other platforms,
// with manual entry as the universal fallback.
```

**Critical:** HealthKit data NEVER leaves the device. There is no Gateway adapter for health. There is no IPC action for health data. The adapter reads from iOS HealthKit → stores in local SQLite → done. This is the most privacy-sensitive data category in the entire product.

### Manual Health Entries

Available on ALL platforms. This is the universal input method — HealthKit is a bonus on iOS.

```typescript
// packages/core/health/manual-entry.ts

interface ManualEntryManager {
  logMood(value: 1 | 2 | 3 | 4 | 5, note?: string): Promise<HealthEntry>;
  logEnergy(value: 1 | 2 | 3 | 4 | 5, note?: string): Promise<HealthEntry>;
  logSymptom(symptom: string, severity?: number): Promise<HealthEntry>;
  logMedication(name: string, dosage: string): Promise<HealthEntry>;
  logWater(amount: number, unit: 'glasses' | 'ml'): Promise<HealthEntry>;
  getEntriesForDate(date: Date): Promise<HealthEntry[]>;
  getEntriesByType(type: HealthMetricType, startDate: Date, endDate: Date): Promise<HealthEntry[]>;
}
```

The quick-entry UI should be fast — a user logs their mood in under 3 seconds. Emoji-based mood scale (😫😕😐🙂😊), energy bar (1-5), symptom text field, medication picker (remembers previous entries), water counter with + button.

### Pattern Correlation Engine — CRITICAL DESIGN

**THIS IS THE MOST IMPORTANT SECTION. READ IT TWICE.**

The pattern correlation engine computes correlations STATISTICALLY. It does NOT ask the LLM "what patterns do you see in this data?" That would produce hallucinated correlations. Instead:

1. **Compute** correlations using Pearson correlation coefficient on time-series data
2. **Filter** for statistical significance (minimum sample size, minimum |r| threshold)
3. **Then** pass the statistically-valid correlation to the LLM for natural language description only

```typescript
// packages/core/health/correlation-engine.ts

class CorrelationEngine {
  constructor(private db: DatabaseHandle) {}

  // Compute Pearson correlation between two numeric time series
  // aligned by date. Returns r value and sample size.
  private pearsonCorrelation(seriesA: number[], seriesB: number[]): { r: number; n: number };

  // Get daily aggregated health metric values
  private getDailyMetric(type: HealthMetricType, startDate: Date, endDate: Date): Promise<DailySeries>;

  // Get calendar-derived metrics (e.g., meeting count, evening meetings, total meeting hours)
  private getCalendarMetric(metric: CalendarMetric, startDate: Date, endDate: Date): Promise<DailySeries>;

  // Run all configured correlations and return significant results
  async computeCorrelations(windowDays?: number): Promise<CorrelationResult[]>;

  // Specific correlation checks:
  // - sleep_duration × evening_meeting_count
  // - sleep_duration × total_meeting_hours
  // - mood × exercise (did they work out that day: 0/1)
  // - energy × sleep_duration (previous night)
  // - mood × step_count
  // - heart_rate_resting × workout_count (weekly)
}

type CalendarMetric =
  | 'total_meetings'       // Count of calendar events per day
  | 'evening_meetings'     // Meetings after 5pm
  | 'meeting_hours'        // Total hours in meetings
  | 'back_to_back'         // Count of back-to-back meeting pairs
  | 'free_blocks';         // Hours with no meetings

// Significance thresholds:
// |r| >= 0.7: strong
// |r| >= 0.4: moderate
// |r| >= 0.2: weak
// |r| < 0.2: none (don't report)
// Minimum sample size: 7 days (1 week of data minimum)
```

**Calendar data access:** The correlation engine queries calendar events from the knowledge graph (which already has calendar data indexed from Sprint 2). It does NOT make IPC calls to fetch calendar data — it reads what's already locally stored. This keeps health completely network-free.

**LLM role — description ONLY:**

```typescript
// AFTER computing correlations statistically:
// Input to LLM: "Generate a one-sentence insight from this statistical finding:
//   Metric: sleep_duration vs evening_meetings
//   Correlation: -0.68 (strong negative)
//   Sample: 21 days
//   Pattern: When evening meetings > 2, average sleep is 5.4 hours vs 7.1 hours"
//
// LLM output: "Your sleep drops significantly during weeks with evening meetings —
//   you average 5.4 hours on those nights compared to 7.1 hours without."
//
// The LLM NEVER sees raw health data. It sees computed statistics only.
```

### Wellness Dashboard

The dashboard shows three views:

1. **Trends:** Line charts for tracked metrics over configurable time windows (7/30/90 days). Steps, sleep, mood, energy plotted over time.
2. **Correlations:** Cards showing statistically significant correlations with natural language descriptions. Color-coded by significance (strong/moderate).
3. **Today:** Quick view of today's entries with add buttons for manual logging.

**Medical disclaimer:** Persistent footer on the wellness dashboard and on every insight card: "Semblance observes patterns in your data. This is not medical advice. Consult a healthcare professional for medical concerns."

---

## Files to Create

### Source Files (10)

```
packages/core/health/types.ts
  — All shared types: HealthMetricType, HealthEntry, CorrelationResult,
    CalendarMetric, HealthInsight, TrendData, DailySeries

packages/core/health/health-store.ts
  — HealthStore class. SQLite table health_entries.
    Constructor: { db: DatabaseHandle }
    Methods: addEntry(entry), getEntries(type, startDate, endDate),
             getDailyAggregates(type, startDate, endDate),
             getEntriesForDate(date), deleteEntry(id), getLatestEntries(limit)
    Handles both HealthKit and manual entries uniformly.

packages/core/health/healthkit-adapter.ts
  — HealthKitAdapter interface + NoOpHealthKitAdapter (default).
    NoOp returns isAvailable()=false, empty arrays for all fetches.
    Real iOS implementation will be provided by mobile platform layer.

packages/core/health/manual-entry.ts
  — ManualEntryManager class. Wraps HealthStore for manual inputs.
    Constructor: { store: HealthStore }
    Methods: logMood(), logEnergy(), logSymptom(), logMedication(), logWater(),
             getEntriesForDate(), getRecentMedications() (for picker suggestions)

packages/core/health/correlation-engine.ts
  — CorrelationEngine class. Statistical computation only.
    Constructor: { db: DatabaseHandle, knowledgeGraph: KnowledgeGraph }
    Methods: computeCorrelations(windowDays?), pearsonCorrelation(a, b),
             getDailyMetric(type, start, end), getCalendarMetric(metric, start, end),
             generateInsightDescription(correlation, llm) — LLM describes, never computes

packages/core/health/health-insights.ts
  — HealthInsightGenerator class. Combines correlations + trends into insights.
    Constructor: { correlationEngine, store, llm, model }
    Methods: generateInsights() → HealthInsight[],
             detectTrends(metric, windowDays) → TrendData,
             detectAnomalies(metric) → HealthInsight[],
             detectStreaks(metric) → HealthInsight[]
    Trend detection: compare current window average to previous window.
    Anomaly detection: current value > 2 standard deviations from 30-day mean.
    Streak detection: consecutive days of logging or meeting a threshold.

packages/core/health/extension-tools.ts
  — createHealthTools(deps) returns ExtensionTool[]. 3 tools, all isLocal: true:
    a. log_health — logs a manual health entry (mood, energy, symptom, medication, water)
    b. health_summary — returns recent entries, trends, correlations for a time window
    c. health_correlations — returns computed correlations with descriptions

packages/core/health/insight-tracker.ts
  — HealthInsightTracker implements ExtensionInsightTracker.
    Generates insights: health-trend-change, health-correlation-found,
    health-anomaly-detected, health-streak.
    Returns empty when not premium.

packages/core/health/index.ts
  — Barrel exports + createHealthExtension(deps) → SemblanceExtension.
    Wires all classes together. Returns extension with id '@semblance/health',
    3 tools, 1 insight tracker.

packages/desktop/src/components/WellnessDashboard.tsx
  — Three-tab dashboard: Trends (line charts), Correlations (insight cards),
    Today (quick entry). Medical disclaimer footer. Free tier:
    "Activate your Digital Representative" prompt.
    Trend charts: simple SVG line charts (no heavy charting library needed — 
    this is a dashboard, not a data science tool).

packages/mobile/src/screens/WellnessScreen.tsx
  — Mobile-adapted wellness dashboard. Quick entry optimized for mobile:
    emoji mood picker, energy slider, water counter with tap-to-increment.
    HealthKit import button (shows only on iOS via isAvailable() check).
```

### Test Files (10)

```
tests/core/health/health-store.test.ts — 7 tests
  - Adds entry and retrieves by type
  - Gets daily aggregates (averages steps per day)
  - Gets entries for specific date
  - Handles empty date range (returns empty array)
  - Filters by source (healthkit vs manual)
  - Deletes entry by id
  - Handles multiple metric types in same query

tests/core/health/healthkit-adapter.test.ts — 4 tests
  - NoOpHealthKitAdapter.isAvailable() returns false
  - NoOpHealthKitAdapter.fetchSteps() returns empty array
  - NoOpHealthKitAdapter.fetchSleep() returns empty array
  - NoOpHealthKitAdapter.requestAuthorization() returns false

tests/core/health/manual-entry.test.ts — 6 tests
  - logMood stores entry with correct type and 1-5 value
  - logEnergy stores entry with correct type and 1-5 value
  - logSymptom stores entry with text label
  - logMedication stores name and dosage
  - logWater stores amount correctly
  - getRecentMedications returns deduplicated medication names

tests/core/health/correlation-engine.test.ts — 8 tests
  - pearsonCorrelation returns correct r for known data (verify against hand calculation)
  - pearsonCorrelation returns r=1.0 for perfectly correlated data
  - pearsonCorrelation returns r=-1.0 for perfectly inverse data
  - pearsonCorrelation returns r≈0 for uncorrelated data
  - Minimum sample size enforced (< 7 days → no result)
  - Significance thresholds classify correctly (strong/moderate/weak/none)
  - Calendar metric extraction queries knowledge graph for events
  - computeCorrelations filters out non-significant results

tests/core/health/health-insights.test.ts — 5 tests
  - detectTrends identifies downward sleep trend
  - detectAnomalies flags value > 2 std devs from mean
  - detectStreaks identifies consecutive logging days
  - generateInsights combines trends + correlations + anomalies
  - LLM called for description only (verify prompt contains computed stats, not raw data)

tests/core/health/extension-tools.test.ts — 4 tests
  - log_health tool stores entry via ManualEntryManager
  - health_summary tool returns recent data
  - health_correlations tool returns computed correlations
  - All tools have isLocal: true

tests/core/health/insight-tracker.test.ts — 3 tests
  - Generates health-trend-change insight when trend detected
  - Returns empty array when not premium
  - Returns empty array when insufficient data

tests/core/health/extension-init.test.ts — 3 tests
  - createHealthExtension returns valid SemblanceExtension
  - Extension has id '@semblance/health'
  - Extension registers 3 tools and 1 insight tracker

tests/core/health/privacy.test.ts — 5 tests
  - Zero network imports in packages/core/health/
  - Zero gateway imports in packages/core/health/
  - Zero IPC client imports in packages/core/health/ (health NEVER uses IPC)
  - HealthKit adapter never transmits data (interface-level verification)
  - LLM receives computed statistics only, never raw health entries

tests/desktop/wellness-dashboard.test.ts — 3 tests
  - Renders wellness dashboard with three tabs
  - Shows "Digital Representative" prompt for free tier (not "Premium")
  - Medical disclaimer text present

tests/mobile/wellness-screen.test.ts — 2 tests
  - Renders mobile wellness screen with quick entry UI
  - HealthKit import button respects isAvailable() (hidden when false)
```

### Modified Files

```
packages/core/premium/premium-gate.ts
  — Add 2 PremiumFeature values: 'health-tracking', 'health-insights'
  — Add FEATURE_TIER_MAP entries: both → 'digital-representative'

packages/core/tsconfig.json
  — Add "health/**/*.ts" to include array
```

---

## 8-Commit Plan

### Commit 1: Types + Health Store

**Create:**
- `packages/core/health/types.ts` — All shared types
- `packages/core/health/health-store.ts` — SQLite table + CRUD
- `tests/core/health/health-store.test.ts` — 7 tests

**Modify:**
- `packages/core/tsconfig.json` — Add `"health/**/*.ts"` to include

**Tests:** 7

### Commit 2: HealthKit Adapter

**Create:**
- `packages/core/health/healthkit-adapter.ts` — Interface + NoOpHealthKitAdapter
- `tests/core/health/healthkit-adapter.test.ts` — 4 tests

**Tests:** 4

### Commit 3: Manual Entry Manager

**Create:**
- `packages/core/health/manual-entry.ts` — All manual logging methods
- `tests/core/health/manual-entry.test.ts` — 6 tests

**Tests:** 6

### Commit 4: Correlation Engine

**Create:**
- `packages/core/health/correlation-engine.ts` — Pearson correlation + calendar metrics + significance filtering
- `tests/core/health/correlation-engine.test.ts` — 8 tests

**Tests:** 8

### Commit 5: Health Insights + PremiumGate Expansion

**Create:**
- `packages/core/health/health-insights.ts` — Trends, anomalies, streaks, LLM description
- `tests/core/health/health-insights.test.ts` — 5 tests

**Modify:**
- `packages/core/premium/premium-gate.ts` — Add 'health-tracking', 'health-insights'

**Tests:** 5

### Commit 6: Extension Tools + Insight Tracker

**Create:**
- `packages/core/health/extension-tools.ts` — 3 tools via registerTools()
- `packages/core/health/insight-tracker.ts` — HealthInsightTracker
- `tests/core/health/extension-tools.test.ts` — 4 tests
- `tests/core/health/insight-tracker.test.ts` — 3 tests

**Tests:** 7

### Commit 7: Extension Entry Point + UI

**Create:**
- `packages/core/health/index.ts` — Barrel + createHealthExtension()
- `packages/desktop/src/components/WellnessDashboard.tsx` — Three-tab dashboard + medical disclaimer
- `packages/mobile/src/screens/WellnessScreen.tsx` — Mobile wellness + quick entry
- `tests/core/health/extension-init.test.ts` — 3 tests
- `tests/desktop/wellness-dashboard.test.ts` — 3 tests
- `tests/mobile/wellness-screen.test.ts` — 2 tests

**Tests:** 8

### Commit 8: Privacy Tests

**Create:**
- `tests/core/health/privacy.test.ts` — 5 tests: zero network, zero gateway, zero IPC in health/, LLM receives only stats

**Tests:** 5

---

## Test Summary

| Commit | Tests |
|--------|-------|
| 1 | 7 (health store) |
| 2 | 4 (healthkit adapter) |
| 3 | 6 (manual entry) |
| 4 | 8 (correlation engine) |
| 5 | 5 (health insights) |
| 6 | 7 (extension tools + insight tracker) |
| 7 | 8 (extension init + UI) |
| 8 | 5 (privacy) |
| **Total** | **50 tests** (target was 50+) |

---

## Verification Checks

After all 8 commits, run these checks and provide RAW terminal output.

**Start with the slash command, then run step-specific checks:**

```bash
# Run the full verification battery first
# /step-verify

# Check 1: Test count (3,313 + 50 = 3,363+, 0 failures)
npx vitest run 2>&1 | tail -10

# Check 2: Extension registration — ZERO hardcoding
grep -n "HealthStore\|CorrelationEngine\|ManualEntryManager\|HealthInsightGenerator" packages/core/agent/orchestrator.ts
# Expected: ZERO matches

grep -n "HealthInsightTracker" packages/core/agent/proactive-engine.ts
# Expected: ZERO matches

# Check 3: Extension tools registered
grep -n "registerTools\|createHealthTools" packages/core/health/extension-tools.ts

# Check 4: Statistical correlation (NOT LLM-computed)
grep -n "pearsonCorrelation\|pearson\|Pearson" packages/core/health/correlation-engine.ts

# Check 5: LLM used for description only, never computation
grep -n "LLMProvider\|llm\." packages/core/health/correlation-engine.ts
# Verify: LLM calls should ONLY be in generateInsightDescription or similar description method
# LLM should NOT appear in pearsonCorrelation, getDailyMetric, getCalendarMetric, or computeCorrelations

# Check 6: Health SQLite table
grep -n "CREATE TABLE\|health_entries" packages/core/health/health-store.ts

# Check 7: Medical disclaimer
grep -rn "not medical advice\|medical advice\|healthcare professional\|consult.*doctor\|disclaimer" packages/desktop/src/components/WellnessDashboard.tsx packages/mobile/src/screens/WellnessScreen.tsx

# Check 8: Digital Representative naming (never "Premium" in UI)
grep -rn "Digital Representative" packages/desktop/src/components/WellnessDashboard.tsx packages/mobile/src/screens/WellnessScreen.tsx
grep -rn ">[^<]*[Pp]remium[^<]*<" packages/desktop/src/components/WellnessDashboard.tsx packages/mobile/src/screens/WellnessScreen.tsx
# Expected: ZERO user-facing "Premium" strings

# Check 9: Privacy audit — STRICTEST for health
grep -rn "^import.*from.*gateway\|from.*@semblance/gateway" packages/core/health/ --include="*.ts"
# Expected: ZERO gateway imports

grep -rn "import.*fetch\|import.*http\|import.*net\b\|import.*axios" packages/core/health/ --include="*.ts"
# Expected: ZERO network imports

grep -rn "import.*ipc\|IPCClient\|ipcClient\|sendAction" packages/core/health/ --include="*.ts"
# Expected: ZERO IPC imports — health data NEVER touches the network, not even via IPC

# Check 10: TypeScript clean
npx tsc --noEmit

# Check 11: HealthKit NoOp default
grep -n "isAvailable.*false\|NoOp\|noop" packages/core/health/healthkit-adapter.ts
```

---

## Exit Criteria

Step 22 is complete when ALL of the following are true:

1. ☐ HealthKit adapter interface defined with NoOp default (returns false/empty on non-iOS)
2. ☐ Health entries stored in SQLite with all metric types (steps, sleep, heart_rate, workout, mood, energy, symptom, medication, water)
3. ☐ Manual entry works for all 5 manual types (mood, energy, symptom, medication, water)
4. ☐ Pearson correlation computed statistically — hand-verifiable test with known data
5. ☐ Significance thresholds enforced (minimum 7 days, |r| >= 0.2 to report)
6. ☐ Calendar metrics derived from knowledge graph (not IPC calls)
7. ☐ LLM used for natural language description ONLY — never for pattern computation
8. ☐ Trends, anomalies, and streaks detected from time-series data
9. ☐ Wellness dashboard renders with Trends, Correlations, and Today tabs
10. ☐ Medical disclaimer present on dashboard and insight cards
11. ☐ Extension registered via registerTools() / registerTracker() — zero hardcoding
12. ☐ All user-facing strings say "Digital Representative" — zero "Premium"
13. ☐ PremiumGate blocks free tier from health features
14. ☐ Privacy audit STRICT: zero network, zero gateway, ZERO IPC in health/
15. ☐ TypeScript clean across all 4 packages
16. ☐ 50+ new tests. All existing tests pass. 0 failures.

---

## Known Risks

1. **Pearson correlation assumes linearity.** Some health correlations are non-linear (e.g., exercise has diminishing returns on sleep quality). For v1, Pearson is sufficient — it catches the major patterns. Spearman rank correlation could be added post-launch for non-linear relationships.

2. **Calendar data availability.** Correlations with calendar events require the user to have calendar integration active. If no calendar data exists, the calendar-based correlations should gracefully return empty results, not errors. The health-only correlations (e.g., sleep vs. mood) should still work.

3. **Insufficient data.** Pattern correlation requires at minimum 7 days of data. The UI should show a clear "logging for X more days to see patterns" message when data is sparse. Don't show empty correlation cards — show progress toward insights.

4. **LLM hallucination risk.** Even though the LLM only generates descriptions, it could embellish or misrepresent the statistical finding. The prompt must include the exact numbers and constrain the output to describing those numbers, not interpreting them medically. Example: the LLM should say "your sleep averages 5.4 hours on days with evening meetings" NOT "evening meetings are causing insomnia."

5. **Health data sensitivity.** This is the most sensitive data category in the product. The privacy test is stricter than any prior step — zero IPC, zero gateway, zero network. Health data exists in SQLite and nowhere else. No embedding, no knowledge graph storage. The correlation engine reads calendar data FROM the knowledge graph, but writes NOTHING to it.

---

## Post-Step 22: MANDATORY GATE

After Step 22 closes and passes verification:

**PHYSICAL REPO SPLIT EXECUTES.**

This is a locked decision. The repo split moves all DR/premium code to `semblance-dr` (or `semblance-premium`). The public `semblance-core` repo must pass all tests without any premium code present. The DR repo must work with core as a peer dependency.

The repo split is a separate session — not part of Step 22. Step 22's job is to deliver health & wellness. The repo split happens AFTER closure and BEFORE Sprint 5 Step 23 begins.
