# Step 23 — Alter Ego Verification + Morning Brief + Alter Ego Week

## Date: February 23, 2026
## Sprint: 5 — Becomes Permanent (Sovereignty + Trust)
## Builds On: ALL Sprint 4 steps (14–22), Daily Digest (Step 13), Style Profile (Step 11), Autonomy Framework (Sprint 2)
## Repo: semblance-core (this is a free-tier / core step — no DR code)
## Baseline: 3,112 tests in core, 0 failures, TypeScript clean

---

## Context

This is the first step of Sprint 5 and the first step after the repo split. All premium code now lives in `semblance-representative`. This step works entirely within `semblance-core`.

Step 23 has three deliverables that together validate the entire product's autonomy story:

1. **Morning Brief** — The daily digest (Step 13) elevated into a forward-looking, contextually rich daily briefing that uses ALL Sprint 4 data sources. This is the signature proactive experience.
2. **Alter Ego Verification** — End-to-end validation that Alter Ego mode works correctly across every capability domain with proper escalation, boundary respect, and style matching.
3. **Alter Ego Week** — A designed 7-day trust-building onboarding sequence that guides users from Partner to Alter Ego through demonstrated capability.

The Morning Brief and Alter Ego Week are free-tier features. They demonstrate the product's intelligence. The premium Digital Representative features (email drafting, cancellation, forms, health) are loaded via extension when present, but the core autonomy framework, Morning Brief, and onboarding work without DR installed.

---

## Deliverable A: Morning Brief

### What It Is

The Morning Brief is NOT the daily digest. The daily digest (Step 13) is backward-looking: "Here's what happened. Time saved: 25 min." The Morning Brief is forward-looking: "Here's what's coming and what you need to know."

**Example Morning Brief:**
> You have 3 meetings today. The 2pm with Sarah — she mentioned the Portland contract was stalled on legal in her email Tuesday. David has been waiting on the proposal for 6 days (his last follow-up was Thursday). Weather turns bad at 3pm — leave for your 4pm offsite by 3:15. You have a package arriving today (tracking from clipboard capture on Monday).

The Morning Brief pulls from every data source Sprint 4 wired:
- **Calendar** (Step 14+): Today's meetings with context
- **Email threads** (Sprint 2): Relevant conversation history for each meeting attendee
- **Contacts + Relationships** (Step 14): Who you're meeting, relationship context
- **Weather** (Step 16): Weather-aware scheduling recommendations
- **Location** (Step 16): Commute-aware timing suggestions
- **Reminders** (Step 10): Due reminders for today
- **Follow-ups** (Sprint 2): Stale follow-up threads that need attention
- **Clipboard captures** (Step 15): Relevant captures (tracking numbers, saved info)
- **Financial** (free tier): Subscription renewal reminders from RecurringDetector

### Implementation

**Morning Brief Generator:**
```typescript
// packages/core/agent/morning-brief.ts
export class MorningBriefGenerator {
  constructor(deps: {
    calendarProvider: CalendarProvider;
    emailProvider: EmailProvider;
    contactStore: ContactStore;
    relationshipGraph: RelationshipGraph;
    weatherProvider: WeatherProvider;
    locationProvider: LocationProvider;
    reminderStore: ReminderStore;
    followUpTracker: FollowUpTracker;
    clipboardStore: ClipboardStore;
    recurringDetector: RecurringDetector;
    llmProvider: LLMProvider;
    model: string;
    semanticSearch: SemanticSearch;
  });

  // Generates the full Morning Brief for today
  async generateBrief(options?: {
    date?: Date;          // Default: today
    timezone?: string;    // User's local timezone
  }): Promise<MorningBrief>;
}

interface MorningBrief {
  date: string;                      // ISO date
  generatedAt: string;               // ISO timestamp
  sections: BriefSection[];          // Ordered sections
  summary: string;                   // LLM-generated natural language summary
  estimatedReadTimeSeconds: number;
}

interface BriefSection {
  type: 'meetings' | 'follow_ups' | 'reminders' | 'weather' | 'financial' | 'insights';
  title: string;
  items: BriefItem[];
  priority: 'high' | 'medium' | 'low';
}

interface BriefItem {
  id: string;
  text: string;                      // Human-readable description
  context?: string;                  // Additional context from knowledge graph
  actionable: boolean;               // Can the user act on this?
  suggestedAction?: string;          // What Semblance suggests
  relatedEntityIds?: string[];       // Links to knowledge graph entities
  source: string;                    // Which data source this came from
}
```

**Data aggregation pattern:**
The Morning Brief does NOT make its own Gateway calls. It reads from locally-stored data that was fetched and indexed by prior steps. Each data provider has already synced:
- Calendar events are in SQLite (fetched by calendar adapter)
- Email threads are indexed in knowledge graph
- Weather is cached from last fetch (Step 16)
- Location is from device sensors (Step 16)
- Contacts/relationships are in local stores (Step 14)

The LLM's job is to **synthesize** these data sources into a coherent narrative, not to fetch anything. The prompt to the LLM includes structured data from all sources and asks for a natural-language summary that highlights what matters most today.

**Scheduling:**
```typescript
// packages/core/agent/morning-brief-scheduler.ts
export class MorningBriefScheduler {
  // Schedules brief generation at user's configured time
  // Default: 7:00 AM local time
  // Stores setting: morningBriefTime (string, "HH:mm")
  // Stores setting: morningBriefEnabled (boolean, default: true)

  schedule(): void;
  cancel(): void;
  getNextDeliveryTime(): Date;
}
```

**Desktop UI:**
- Morning Brief appears as a special card at the top of the Universal Inbox
- Distinguished from the daily digest by design: uses `--color-primary` (Warm Amber) header bar, briefcase icon
- Card title: "Morning Brief — [Day, Month Date]"
- Sections rendered as collapsible groups (meetings expanded by default, others collapsed)
- Each item shows source icon (calendar, email, weather, etc.)
- Dismiss button (marks as read for today)
- "Generate Now" button in Settings for manual trigger

**Mobile UI:**
- Same card design, responsive for mobile width
- System notification at configured time: "Your Morning Brief is ready" with preview of first 2 items
- Notification tap deep-links to inbox with Morning Brief expanded
- Notification uses `@notifee/react-native` (already integrated in Step 13)

**Settings:**
- "Morning Brief" section in Settings → Notifications
- Toggle: Enable/Disable (default: on)
- Time picker: Delivery time (default: 7:00 AM)
- Located adjacent to the Daily Digest toggle (they're separate features — digest is backward-looking, brief is forward-looking)

---

## Deliverable B: Alter Ego End-to-End Verification

### What It Is

Systematic validation that Alter Ego mode works correctly across every capability domain. This is not "test that the toggle works" — it's "test that Alter Ego actually behaves as specified in every domain."

### Verification Matrix

For each domain, verify all three autonomy tiers behave correctly:

| Domain | Guardian | Partner | Alter Ego |
|--------|----------|---------|-----------|
| **Email triage** | Show plan, wait | Do it, report in digest | Do it silently |
| **Email drafting** | Show draft, wait | Show draft, auto-send routine after 3 approvals | Draft and send, report in digest |
| **Calendar conflicts** | Show options, wait | Resolve by learned priority, notify | Resolve silently, log |
| **Subscription detection** | Surface finding | Surface + draft cancellation | Cancel and report (with undo) |
| **Meeting prep** | Surface documents | Surface docs + draft agenda | Full autonomous prep |
| **Follow-up reminders** | Suggest "you haven't replied" | Draft follow-up, wait for approval | Send follow-up after configurable delay |
| **Reminders** | Show upcoming, wait | Fire notifications autonomously | Act on reminder content autonomously |
| **Web search** | Show results, wait | Search proactively for meeting topics | Integrate findings into brief silently |

### Implementation

**Autonomy behavior tests:**
```typescript
// tests/core/autonomy/alter-ego-verification.test.ts
// For EACH row in the verification matrix:
// 1. Set autonomy tier for the domain
// 2. Trigger the action scenario
// 3. Assert the orchestrator's behavior matches the table
// 4. Assert the action log records the correct behavior
// 5. Assert escalation triggers for genuinely high-stakes actions even in Alter Ego

// Critical escalation tests:
// - Alter Ego mode receives an email about a legal contract → MUST escalate
// - Alter Ego mode detects a $2,000 charge → MUST escalate
// - Alter Ego mode encounters ambiguous situation → MUST fall back to asking
// - Alter Ego mode encounters a novel scenario it hasn't seen before → MUST escalate
```

**Style matching validation:**
```typescript
// tests/core/autonomy/style-match-verification.test.ts
// Verify that Alter Ego email drafts use the style profile (Step 11)
// Test: given a user's style profile and an incoming email, the drafted response
//       scores 80%+ on style match metrics (vocabulary overlap, sentence structure,
//       formality level, greeting/closing patterns)
// At least 5 different email scenarios tested
```

**Escalation boundary tests:**
```typescript
// tests/core/autonomy/escalation-boundaries.test.ts
// Test the escalation rules:
// 1. Large financial transaction (configurable threshold) → always escalate
// 2. Legal commitment language detected → always escalate
// 3. Irreversible action (account deletion, data wipe) → always escalate
// 4. Novel situation (first time seeing this action type) → escalate
// 5. Low confidence from LLM (below threshold) → escalate
// 6. User has explicitly restricted this domain → respect restriction
```

**Autonomy escalation prompt tests:**
```typescript
// tests/core/autonomy/escalation-prompts.test.ts
// Test the active escalation system:
// 1. After 10 consecutive approvals of same type in Guardian → suggest Partner
// 2. After 2 weeks of Partner with zero corrections → suggest Alter Ego
// 3. Escalation prompt is opt-in (never forced)
// 4. Escalation prompt is contextual (tied to demonstrated success)
// 5. Escalation prompt shows concrete behavior change ("Here's what would be different")
// 6. User can dismiss escalation prompt without penalty
// 7. Dismissed prompts don't reappear for configurable cooldown period
```

### What This Deliverable Does NOT Include

- It does NOT test Digital Representative features (premium email drafting, cancellation execution, form filling, health). Those are DR features and live in `semblance-representative`.
- It tests the core autonomy framework, style matching, escalation logic, and domain-specific behaviors that exist in the free tier.
- If DR extensions are loaded, the orchestrator routes to them. If DR is not loaded, the orchestrator uses core-only capabilities. Both paths must work.

---

## Deliverable C: Alter Ego Week

### What It Is

A designed 7-day onboarding experience that builds trust through demonstrated capability. Each day showcases one autonomous domain and shows the audit trail. By Day 7, the user has seen Semblance succeed across enough domains that escalation to Alter Ego feels earned, not pushy.

### The Sequence

| Day | Theme | Demonstration | Audit Trail Shown |
|-----|-------|--------------|-------------------|
| 1 | Email Intelligence | Semblance categorizes all email, highlights 3 most important | "I categorized 47 emails. Here are the 3 I think matter most." |
| 2 | Calendar Mastery | Semblance resolves a conflict or preps tomorrow's first meeting | "I noticed a conflict and resolved it. Here's what I did and why." |
| 3 | Financial Awareness | Semblance surfaces subscription findings from RecurringDetector | "I found 3 subscriptions you might have forgotten. Total: $47/month." |
| 4 | Your Voice | Semblance drafts a reply in user's voice using style profile | "I drafted this reply in your voice. Compare it to what you'd write." |
| 5 | Research Assistant | Semblance proactively researches tomorrow's meeting topics | "Your 10am is about the Jenkins project. Here's what I found in your files and the web." |
| 6 | Multi-Domain | Semblance handles email + calendar + reminders together | "I handled 12 actions across 3 domains today. Zero required your input." |
| 7 | The Offer | Full Alter Ego activation prompt | "You've seen what I can do. Ready to let me run? Here's what changes." |

### Implementation

**Alter Ego Week State Machine:**
```typescript
// packages/core/onboarding/alter-ego-week.ts
export class AlterEgoWeek {
  constructor(deps: {
    db: DatabaseHandle;
    orchestrator: Orchestrator;
    autonomyManager: AutonomyManager;
    proactiveEngine: ProactiveEngine;
  });

  // Start the 7-day sequence
  async start(): Promise<void>;

  // Get current day's demonstration config
  async getCurrentDay(): Promise<AlterEgoWeekDay | null>;

  // Mark today's demonstration as shown/completed
  async completeDay(day: number): Promise<void>;

  // Skip the entire sequence
  async skip(): Promise<void>;

  // Replay from Day 1
  async replay(): Promise<void>;

  // Check if sequence is active
  isActive(): boolean;

  // Get progress
  getProgress(): AlterEgoWeekProgress;
}

interface AlterEgoWeekDay {
  dayNumber: number;          // 1–7
  theme: string;              // "Email Intelligence", "Calendar Mastery", etc.
  domain: string;             // Domain being demonstrated
  demonstration: DemonstrationConfig;
  auditSummary: string;       // What to show the user about what happened
  isComplete: boolean;
}

interface AlterEgoWeekProgress {
  currentDay: number;         // 1–7
  completedDays: number[];
  isActive: boolean;
  startedAt: string;          // ISO timestamp
  skipped: boolean;
}

interface DemonstrationConfig {
  type: 'email_triage' | 'calendar_resolution' | 'financial_scan' | 'style_draft' | 'research' | 'multi_domain' | 'activation_offer';
  requiredData: string[];     // What data sources must be available
  fallbackMessage: string;    // If required data isn't available yet
}
```

**Day 7 Activation Prompt:**
```typescript
// packages/core/onboarding/alter-ego-activation.ts
export class AlterEgoActivation {
  // Generates the Day 7 activation prompt
  // Shows: what Alter Ego does differently per domain
  // Shows: success metrics from the past 7 days
  // Shows: what safeguards remain (escalation rules, undo, audit trail)
  // Options: Activate Alter Ego / Stay on Partner / Customize per domain

  async generateActivationPrompt(): Promise<ActivationPrompt>;
}

interface ActivationPrompt {
  weekSummary: {
    totalActions: number;
    successRate: number;       // % of actions that were correct/not undone
    domainsCovered: string[];
    timeSaved: number;         // Minutes
  };
  alterEgoDifferences: AlterEgoDifference[];  // Per-domain behavior changes
  safeguards: string[];        // Escalation rules, undo, audit trail
}

interface AlterEgoDifference {
  domain: string;
  currentBehavior: string;     // What Partner does now
  alterEgoBehavior: string;    // What Alter Ego would do
  example: string;             // Concrete example from past week
}
```

**Desktop UI — Alter Ego Week:**
- Progress indicator: 7 dots in the sidebar or settings panel, filled as days complete
- Daily card in Universal Inbox: shows today's demonstration theme + results
- Card design: `--color-accent-subtle` background, `--color-accent` (Semblance Blue) progress indicators
- Day 7 card is special: full-width activation prompt with clear options
- "Skip Alter Ego Week" link in settings (not prominent, but available)
- "Replay Alter Ego Week" button in Settings → Autonomy section

**Mobile UI — Alter Ego Week:**
- Same progress dots in profile/settings area
- Daily notification: "Day 3: Let me show you what I found in your finances"
- Card design matches desktop, responsive
- Day 7 notification: "Your Alter Ego Week is complete. Ready to see what's next?"

**Trigger conditions:**
- Alter Ego Week starts automatically 24 hours after onboarding completes (user has connected at least email + calendar)
- If insufficient data (e.g., no calendar events on Day 2), show a modified demonstration with the fallback message and schedule a retry
- Each day's demonstration triggers at the user's Morning Brief time
- Days advance at midnight local time, not on a fixed timer

---

## Scope Boundaries

**This step does NOT include:**
- Premium Digital Representative features (email sending, cancellation execution, form filling, health tracking) — those are in DR and loaded via extension
- New data connectors — all data sources were wired in Sprint 4
- New Gateway adapters — Morning Brief reads from local stores, not from the network
- Changes to the extension registration API — the `registerTools()`/`registerTracker()` interface is locked

**This step DOES include:**
- The Morning Brief generator and scheduler (new)
- The Alter Ego Week state machine and activation flow (new)
- Comprehensive autonomy verification tests across all free-tier domains
- Style match quality validation
- Escalation boundary enforcement tests
- Desktop and mobile UI for Morning Brief card and Alter Ego Week progress
- Settings for Morning Brief time and Alter Ego Week management

---

## Commit Strategy

8 commits. Each compiles, passes all tests, and leaves the codebase working.

| Commit | Deliverable | Description | Tests |
|--------|-------------|-------------|-------|
| 1 | A | Morning Brief data aggregation — MorningBriefGenerator with all data source integrations | 10+ |
| 2 | A | Morning Brief LLM synthesis — prompt construction, natural language summary generation | 5+ |
| 3 | A | Morning Brief scheduler + settings + desktop/mobile UI | 6+ |
| 4 | B | Alter Ego verification — autonomy behavior matrix tests across all domains | 10+ |
| 5 | B | Style match validation + escalation boundary tests | 8+ |
| 6 | B | Autonomy escalation prompt system — trigger logic, cooldown, UI | 5+ |
| 7 | C | Alter Ego Week state machine — 7-day sequence, progress tracking, skip/replay | 8+ |
| 8 | C | Day 7 activation prompt + Alter Ego Week UI (desktop + mobile) | 6+ |

**Minimum 58 new tests. Target: 65+.**

---

## Verification Checks

Run ALL of these. Report raw terminal output for each.

### Standard Battery
```bash
# Full verification
/step-verify

# Extension audit (must still pass — no DR code crept into core)
/extension-audit

# Privacy check
/privacy-check

# Stub scan
/stub-scan
```

### Step-Specific Checks

```bash
# 1. Morning Brief generates with real data sources
grep -rn "MorningBriefGenerator" packages/core/agent/ --include="*.ts"
grep -rn "generateBrief" packages/core/agent/ --include="*.ts"

# 2. Morning Brief uses all Sprint 4 data sources (verify imports)
grep -n "CalendarProvider\|EmailProvider\|ContactStore\|WeatherProvider\|LocationProvider\|ClipboardStore\|RecurringDetector\|RelationshipGraph" packages/core/agent/morning-brief.ts

# 3. Morning Brief scheduler exists with configurable time
grep -rn "MorningBriefScheduler\|morningBriefTime\|morningBriefEnabled" packages/core/ --include="*.ts"

# 4. Alter Ego verification tests cover all domains in matrix
grep -c "describe\|it(" tests/core/autonomy/alter-ego-verification.test.ts

# 5. Style match tests with 80%+ threshold
grep -n "styleMatch\|style.*score\|0\.8\|80" tests/core/autonomy/style-match-verification.test.ts

# 6. Escalation boundary tests exist
grep -c "escalat" tests/core/autonomy/escalation-boundaries.test.ts

# 7. Escalation prompt system with cooldown
grep -rn "cooldown\|COOLDOWN\|escalationPrompt\|EscalationPrompt" packages/core/ --include="*.ts"

# 8. Alter Ego Week state machine
grep -rn "AlterEgoWeek\|alter-ego-week" packages/core/onboarding/ --include="*.ts"

# 9. Day 7 activation prompt
grep -rn "ActivationPrompt\|AlterEgoActivation\|generateActivationPrompt" packages/core/ --include="*.ts"

# 10. Alter Ego Week skip/replay
grep -n "skip\|replay" packages/core/onboarding/alter-ego-week.ts

# 11. Desktop UI components exist
grep -rn "MorningBrief\|AlterEgoWeek\|ActivationPrompt" packages/desktop/src/components/ --include="*.tsx"

# 12. Mobile UI components exist
grep -rn "MorningBrief\|AlterEgoWeek\|ActivationPrompt" packages/mobile/src/ --include="*.tsx"

# 13. No premium imports in this step (extension audit spot check)
grep -rn "from.*representative\|from.*@semblance/dr" packages/core/ --include="*.ts"

# 14. Morning Brief does NOT make Gateway calls (reads local only)
grep -n "ipcClient\|gateway\|Gateway" packages/core/agent/morning-brief.ts

# 15. Test count
/test-count
```

---

## Exit Criteria

Step 23 is complete when ALL of the following are true:

1. ✅ Morning Brief generates with calendar context, email thread analysis, relationship context, weather, location, reminders, follow-ups, clipboard captures, and financial subscription data.
2. ✅ Morning Brief produces a natural-language LLM-synthesized summary, not just a data dump.
3. ✅ Morning Brief delivers at configurable time on desktop (inbox card) and mobile (notification + deep link).
4. ✅ Morning Brief reads from local stores ONLY — zero Gateway calls during brief generation.
5. ✅ Alter Ego mode operates correctly in every free-tier capability domain (email triage, calendar, meeting prep, follow-ups, reminders, web search, subscription detection).
6. ✅ Style match for email drafts scores 80%+ consistently across at least 5 test scenarios.
7. ✅ Escalation boundaries enforced: large financial, legal commitments, irreversible actions, novel situations, and low confidence ALL trigger escalation even in Alter Ego mode.
8. ✅ Autonomy escalation prompts trigger after configurable approval thresholds (10 consecutive in Guardian → suggest Partner, 2 weeks in Partner → suggest Alter Ego).
9. ✅ Escalation prompts are opt-in, contextual, concrete, and have configurable cooldown.
10. ✅ Alter Ego Week 7-day sequence fully implemented with daily demonstrations per the spec.
11. ✅ Each day's demonstration uses real user data from the appropriate domain.
12. ✅ Day 7 activation prompt shows week summary, per-domain behavior changes, and safeguards.
13. ✅ Alter Ego Week can be skipped or replayed.
14. ✅ Morning Brief and Alter Ego Week settings accessible in desktop and mobile Settings.
15. ✅ 50+ new tests. All existing tests pass. Privacy audit clean.
16. ✅ TypeScript compiles cleanly (`npx tsc --noEmit` at root).
17. ✅ Zero premium imports in core — extension audit clean.

---

## Autonomous Decision Authority

You may make these decisions without asking:

- **Data provider interface adjustments** — whatever adapter pattern makes each provider accessible to MorningBriefGenerator
- **LLM prompt engineering** — the prompt structure for brief synthesis
- **Test scenario selection** — which email/calendar/contact scenarios to use in verification tests
- **UI layout decisions within design system** — component arrangement that follows DESIGN_SYSTEM.md
- **Alter Ego Week timing adjustments** — if 24h after onboarding is too aggressive, adjust with rationale
- **Fallback messages** — when a day's data isn't available, craft appropriate fallback text

## Escalation Required

Stop and ask before:

- **Changing the autonomy tier behavior table** — the Guardian/Partner/Alter Ego behaviors per domain are locked
- **Modifying the extension registration API** — registerTools/registerTracker signatures are frozen
- **Adding Gateway calls to the Morning Brief** — it must read local only
- **Changing the Alter Ego Week day sequence** — the 7-day progression is designed and locked
- **Moving any files between semblance-core and semblance-representative** — the split is done
- **Modifying escalation thresholds** — 10 approvals for Guardian→Partner and 2 weeks for Partner→Alter Ego are specified

---

## Important Post-Split Reminders

- **This step runs in semblance-core only.** Do not create, modify, or reference any files in the `semblance-representative` repo.
- **The extension system is wired.** If `@semblance/dr` is installed, `loadExtensions()` will load it and register its tools/trackers. Core code must work correctly both WITH and WITHOUT DR loaded.
- **Morning Brief is free tier.** It ships in the open-source repo. It demonstrates intelligence without requiring premium features.
- **Alter Ego Week is free tier.** The trust-building experience works with core capabilities. Day 3 (financial awareness) uses RecurringDetector (free tier), not full financial intelligence (DR).
- **The "Digital Representative" naming rule still applies.** If any UI text references the premium tier, it must say "Digital Representative" — never "Premium."
