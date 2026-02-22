# Step 11 — Communication Style Learning

## Implementation Prompt for Claude Code
**Date:** February 21, 2026
**Sprint:** 3 (Becomes Powerful)
**Baseline:** Step 10 complete. 1,780 tests passing. Privacy audit clean.
**Canonical references:** Read `CLAUDE.md` and `DESIGN_SYSTEM.md` from the project root before making any implementation decisions.

---

## Context

Step 10 delivered web search (Brave + SearXNG), web fetch with content extraction, reminders with natural language parsing, and quick capture with auto-reminder extraction. 1,780 tests pass. Privacy audit clean.

Step 11 delivers communication style learning — the capability that makes Semblance's email drafts sound like the user wrote them, not like generic AI. This is the difference between "an AI that drafts emails" and "MY AI that writes like me."

**Scope boundary — READ THIS CAREFULLY:**

This step is ONLY:
1. Style extraction from sent emails
2. Style-matched email drafting
3. Style quality validation with match scoring
4. Correction feedback loop

This step is NOT:
- Digital Representative (email-based representative actions) — Sprint 4, Step 20
- Subscription cancellation emails — Sprint 4, Step 20
- Customer service draft templates — Sprint 4, Step 20
- Alter Ego autonomous email sending — already exists from Sprint 2, this step improves draft quality

The style profile built here is an **asset** that Sprint 4's Digital Representative will **consume**. Build the asset. Do not build the consumer.

---

## Architecture

### What Already Exists (Do Not Rebuild)

Study these files before writing any code. Your implementation must integrate with them, not replace them.

- **`packages/core/agent/orchestrator.ts`** — Has `draft_email` and `send_email` tools with autonomy tier controls. 11 tests in `orchestrator-email.test.ts`. Your style injection hooks into the draft generation flow here.
- **`packages/core/agent/email-categorizer.ts`** — Categorizes incoming email (8 categories, batch processing). 9 tests. You do NOT modify this.
- **`packages/core/knowledge/`** — Email indexer, calendar indexer, file indexer, semantic search. Sent emails are already indexed here from Sprint 2.
- **`packages/core/llm/`** — InferenceRouter (wired in Step 9). All LLM calls go through InferenceRouter. Your style extraction and draft generation use the same inference path.
- **`packages/core/agent/autonomy.ts`** — Guardian/Partner/Alter Ego tier logic. Your style-matched drafts respect the same autonomy flow — Guardian shows draft for approval, Partner auto-sends routine, Alter Ego sends autonomously. You do NOT change autonomy logic — you improve the draft quality that feeds into it.

### New Components

**`packages/core/style/style-extractor.ts`** — The analysis engine.
- Processes sent emails from the knowledge graph to extract style features.
- Produces a structured `StyleProfile` stored in SQLite.
- Runs as a background job: initial extraction on first email sync, incremental on new sent emails.

**`packages/core/style/style-profile.ts`** — The data model.
- `StyleProfile` interface definition.
- SQLite schema for profiles with versioning.
- Query and update operations.

**`packages/core/style/style-scorer.ts`** — The quality validator.
- Compares a generated draft against the style profile.
- Produces a numeric match score (0–100).
- Used to decide if a draft should be regenerated.

**`packages/core/style/style-injector.ts`** — The prompt engineering layer.
- Takes a style profile and produces the LLM prompt fragment that instructs the model to write in the user's voice.
- This is the most important file in the step. The quality of the prompt engineering determines whether drafts sound like the user or sound like an AI trying to sound like the user.

**`packages/desktop/src/components/StyleMatchIndicator.tsx`** — UI element.
- Shows the style match score on email drafts: "Matches your style: 87%"
- Visual indicator (color-coded: green 80+, yellow 60–79, red below 60).

**`packages/desktop/src/components/StyleProfileCard.tsx`** — Settings/info component.
- Shows style profile summary: detected greeting, sign-off, formality level, email count analyzed.
- Appears in Settings under a "Writing Style" section.
- Shows status: "Learning your style (12/20 emails analyzed)" or "Style profile active (analyzed 247 emails)".

---

## Data Model

### StyleProfile Interface

```typescript
interface StyleProfile {
  id: string;                           // nanoid
  version: number;                      // Increments on each update (never lose history)
  emailsAnalyzed: number;               // Count of sent emails processed
  isActive: boolean;                    // True when emailsAnalyzed >= 20
  lastUpdatedAt: string;                // ISO 8601

  // Greetings — what the user opens with
  greetings: {
    patterns: Array<{
      text: string;                     // "Hi", "Hey", "Hello", "Dear", etc.
      frequency: number;                // 0-1, proportion of usage
      contexts: string[];               // "colleague", "client", "friend", "unknown"
    }>;
    usesRecipientName: boolean;         // "Hi Sarah" vs "Hi"
    usesNameVariant: 'first' | 'full' | 'none' | 'mixed';
  };

  // Sign-offs — what the user closes with
  signoffs: {
    patterns: Array<{
      text: string;                     // "Best", "Thanks", "Cheers", "Regards", etc.
      frequency: number;
      contexts: string[];
    }>;
    includesName: boolean;              // Sign-off includes user's name
  };

  // Tone and formality
  tone: {
    formalityScore: number;             // 0-100. 0 = very casual, 100 = very formal
    directnessScore: number;            // 0-100. 0 = hedging ("maybe we could"), 100 = direct ("do this")
    warmthScore: number;               // 0-100. 0 = cold/transactional, 100 = warm/personal
  };

  // Structural patterns
  structure: {
    avgSentenceLength: number;          // Words per sentence
    avgParagraphLength: number;         // Sentences per paragraph
    avgEmailLength: number;             // Words per email
    usesListsOrBullets: boolean;        // Does the user tend to use lists?
    listFrequency: number;              // 0-1, proportion of emails with lists
  };

  // Vocabulary and habits
  vocabulary: {
    commonPhrases: string[];            // Frequently used phrases ("sounds good", "let me know", etc.)
    avoidedWords: string[];             // Words the user never uses (detected by absence in large sample)
    usesContractions: boolean;          // "I'm" vs "I am"
    contractionRate: number;            // 0-1
    usesEmoji: boolean;
    emojiFrequency: number;             // 0-1
    commonEmoji: string[];              // Most used emoji
    usesExclamation: boolean;
    exclamationRate: number;            // 0-1
  };

  // Per-context variation (if enough data)
  contextVariations: Array<{
    context: string;                    // "colleague", "client", "friend", "manager", "report"
    formalityDelta: number;             // Adjustment from base formality (-30 to +30)
    toneNotes: string;                  // LLM-generated description: "More casual with colleagues, uses first names"
  }>;
}
```

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS style_profiles (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  user_id TEXT NOT NULL DEFAULT 'default',
  profile_json TEXT NOT NULL,            -- JSON-serialized StyleProfile
  emails_analyzed INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,  -- 1 when emails_analyzed >= 20
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS style_profile_history (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES style_profiles(id)
);

CREATE TABLE IF NOT EXISTS style_corrections (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  original_draft TEXT NOT NULL,
  corrected_draft TEXT NOT NULL,
  correction_type TEXT,                  -- 'greeting', 'signoff', 'tone', 'vocabulary', 'structure', 'other'
  created_at TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,    -- 1 when correction has been incorporated into profile
  FOREIGN KEY (profile_id) REFERENCES style_profiles(id)
);
```

---

## Commit Strategy

Execute these commits in order. Each commit must compile, pass all existing tests, and pass any new tests. Do NOT proceed to the next commit if the current one fails.

### Commit 1: Data Model + SQLite Schema + Profile Store
`feat: add style profile data model, SQLite schema, and storage layer`

- Create `packages/core/style/style-profile.ts`:
  - `StyleProfile` interface as defined above.
  - SQLite schema creation (all three tables).
  - CRUD operations: `createProfile`, `getActiveProfile`, `updateProfile`, `getProfileHistory`.
  - Profile versioning: every `updateProfile` call increments `version` and copies the previous version to `style_profile_history`.
  - Correction tracking: `addCorrection`, `getUnappliedCorrections`, `markCorrectionApplied`.
  - `isProfileActive()`: returns true when `emailsAnalyzed >= 20`.
- Tests: Full CRUD, versioning round-trip (update creates history entry), correction storage, isActive threshold. Minimum 12 tests.

### Commit 2: Style Extractor — Analysis Engine
`feat: add style extraction pipeline for analyzing sent emails`

- Create `packages/core/style/style-extractor.ts`:
  - `extractStyleFromEmails(emails: SentEmail[]): StyleProfile` — the core analysis function.
  - **Heuristic extraction (no LLM needed):**
    - Greeting detection: first line pattern matching. Build frequency map.
    - Sign-off detection: last lines before any signature block. Build frequency map.
    - Sentence length: split by sentence-ending punctuation, count words. Average.
    - Paragraph length: split by double newlines. Average sentences per paragraph.
    - Email length: word count. Average.
    - Contraction detection: regex for common contractions vs. expanded forms. Calculate rate.
    - Emoji detection: Unicode emoji regex. Calculate frequency.
    - Exclamation detection: count `!` endings. Calculate frequency.
    - List/bullet detection: lines starting with `-`, `*`, `•`, or numbered patterns.
  - **LLM-assisted extraction (use InferenceRouter):**
    - Formality scoring: send a sample of 5–10 emails to the LLM with a prompt asking to rate formality 0–100. Average the ratings.
    - Directness scoring: same approach — LLM rates directness.
    - Warmth scoring: same approach.
    - Common phrases: LLM identifies recurring phrases across the email sample.
    - Context classification: LLM classifies each email's recipient context (colleague, client, friend, etc.) based on email content and headers.
    - Context variation: group scores by context, compute deltas from base.
  - **Incremental update:** `updateProfileWithNewEmails(existingProfile: StyleProfile, newEmails: SentEmail[]): StyleProfile` — merges new analysis into existing profile without reprocessing everything. Weighted merge: new data gets proportional weight based on count.
  - **Minimum threshold:** If fewer than 20 emails are provided, return a profile with `isActive: false`. The profile still gets populated with whatever data is available — it just isn't used for drafting yet.
- The extractor must handle edge cases:
  - Emails with no greeting (jump straight to content).
  - Emails with no sign-off.
  - Very short emails (1–2 words: "Thanks", "OK").
  - Forwarded emails (strip forwarded content, analyze only the user's added text).
  - Reply chains (extract only the user's most recent reply, not quoted content).
- Tests: Extraction from fixture emails (create at least 3 realistic email fixtures with different styles). Heuristic accuracy (greeting detection, sign-off detection, contraction rate, emoji rate). Incremental update merges correctly. Edge cases (no greeting, no sign-off, very short, reply chain). Minimum 15 tests.

### Commit 3: Style Injector — Prompt Engineering
`feat: add style-aware prompt injection for email drafting`

- Create `packages/core/style/style-injector.ts`:
  - `buildStylePrompt(profile: StyleProfile, context: DraftContext): string` — produces the LLM prompt fragment that makes the model write in the user's voice.
  - `DraftContext` includes: recipient email/name (if known), whether it's a reply or new composition, the subject, and any recipient context classification.
  - The prompt fragment should be structured as a clear instruction to the LLM, not a dump of raw data. Example structure:

    ```
    Write this email in the user's personal writing style.

    Their style characteristics:
    - They typically open emails with "Hi [first name]," (85% of emails) or "Hey [first name]," (12%) for colleagues. For clients, they use "Hello [first name],"
    - They sign off with "Best," followed by their name (70%) or "Thanks," (25%)
    - Their tone is moderately formal (62/100) and direct (78/100)
    - Average sentence length: 14 words. They write concise paragraphs (2-3 sentences).
    - They frequently use contractions (I'm, don't, we'll) — contraction rate: 0.82
    - They occasionally use exclamation marks (rate: 0.15) — don't overuse them
    - Common phrases they use: "sounds good", "let me know if you have any questions", "happy to help"
    - They never use emoji in professional emails
    - They tend to be warm but efficient — acknowledge the person, address the matter, close cleanly

    The email should read as if the user wrote it naturally, not as if an AI is mimicking them. Match the rhythm and vocabulary, not just the format.
    ```

  - The prompt must adapt based on recipient context. If the profile has context variations showing the user is more casual with colleagues, the prompt should reflect that when drafting to a colleague.
  - `buildInactiveStylePrompt(): string` — returns a neutral professional style prompt used when the profile has fewer than 20 emails. This should produce competent, generic professional emails — not obviously AI-sounding, but not personalized either.
- Tests: Prompt generation includes key profile elements. Prompt adapts for different recipient contexts. Inactive profile produces generic prompt. Prompt stays under a reasonable token budget (test that the prompt fragment is < 500 tokens for typical profiles). Minimum 8 tests.

### Commit 4: Style Scorer — Quality Validation
`feat: add style match scoring for generated email drafts`

- Create `packages/core/style/style-scorer.ts`:
  - `scoreDraft(draft: string, profile: StyleProfile): StyleScore` — compares a generated draft against the profile.
  - `StyleScore` interface:
    ```typescript
    interface StyleScore {
      overall: number;          // 0-100 composite score
      breakdown: {
        greeting: number;       // 0-100: does the greeting match patterns?
        signoff: number;        // 0-100: does the sign-off match patterns?
        sentenceLength: number; // 0-100: is avg sentence length within range?
        formality: number;      // 0-100: does formality feel right?
        vocabulary: number;     // 0-100: contractions, emoji, exclamation usage match?
      };
    }
    ```
  - **Scoring is heuristic, not LLM-based.** This must be fast (< 50ms) because it runs on every draft to decide whether to regenerate.
    - Greeting score: check if draft's opening matches one of the profile's greeting patterns. Exact match = 100, partial match (right format, wrong word) = 60, no match = 20.
    - Sign-off score: same approach as greeting.
    - Sentence length score: compute draft's avg sentence length, compare to profile's. Within ±20% = 100, ±40% = 70, beyond = 40.
    - Formality score: use simple proxies — contraction rate, exclamation rate, vocabulary complexity. Compare to profile. Close match = 100, divergent = lower.
    - Vocabulary score: check contraction usage rate, emoji presence/absence, exclamation rate against profile. Each sub-metric contributes equally.
  - Overall score: weighted average. Greeting and sign-off are highest weight (they're the most noticeable to the user). Suggested weights: greeting 25%, sign-off 25%, sentence length 15%, formality 20%, vocabulary 15%.
  - The scorer does NOT use the LLM. It's pure heuristic analysis for speed.
- Tests: Score a draft that matches the profile (expect 80+). Score a draft that doesn't match (expect < 60). Score individual breakdown dimensions. Verify scoring is deterministic (same input = same output). Edge cases (very short draft, draft with no greeting). Minimum 10 tests.

### Commit 5: Draft Pipeline Integration — Wire Into Orchestrator
`feat: wire style-matched drafting into orchestrator email draft pipeline`

- This is the wiring commit. Modify existing files to integrate style.
- **Modify `packages/core/agent/orchestrator.ts`:**
  - Before the `draft_email` tool generates a draft, load the active style profile from the profile store.
  - If the profile is active (20+ emails), call `buildStylePrompt()` and include the result in the LLM prompt for draft generation.
  - If the profile is inactive, call `buildInactiveStylePrompt()` instead.
  - After the draft is generated, call `scoreDraft()` to compute the style match.
  - If the score is below the threshold (default: 70, configurable), regenerate with a stronger style injection prompt (append: "The previous draft didn't match the user's style closely enough. Pay special attention to: [weakest dimensions from breakdown]"). Max 2 retries.
  - After retries (or if first attempt passes), include the style score in the draft response.
- **Modify draft presentation (in the Orchestrator's response handling or the chat UI):**
  - When a draft is presented to the user (Guardian mode approval, or Partner mode pre-send preview), include the style match score.
  - The UI should show: draft text + "Matches your style: 87%" (or whatever the score is).
- **Do NOT change autonomy logic.** Guardian still shows for approval. Partner still auto-sends routine. The style system only changes the QUALITY of the draft, not the FLOW.
- Tests: Draft with active profile includes style prompt (verify the LLM prompt contains style instructions). Draft with inactive profile uses generic prompt. Below-threshold draft triggers regeneration (mock the scorer to return a low score, verify retry happens). Max 2 retries enforced. Style score included in draft response. All existing Orchestrator email tests still pass (CRITICAL — do not break the 11 existing tests). Minimum 10 tests.

### Commit 6: Background Extraction Job + Incremental Updates
`feat: add background style extraction job with incremental email processing`

- Create `packages/core/style/style-extraction-job.ts`:
  - Background job that runs:
    1. **On first email sync completion:** Query the knowledge graph for all sent emails. Run full extraction. Create the initial profile.
    2. **On each new sent email sync:** Query for newly synced sent emails (since last extraction). Run incremental update on the existing profile.
  - The job must detect sent emails vs. received emails. Sent emails are those where the user's email address is in the `from` field. The user's email address is available from the IMAP account configuration.
  - The job registers with whatever scheduling mechanism exists (if the Proactive Engine has a job scheduler, use that; otherwise, use a simple interval with a "last processed" timestamp).
  - The initial extraction can be heavy (processing 20–500+ emails through LLM for tone scoring). It should:
    - Run in background, not block the UI.
    - Process in batches (e.g., 10 emails at a time) to avoid overwhelming the inference runtime.
    - Show progress somewhere accessible (the StyleProfileCard in Settings shows "Learning your style (45/247 emails analyzed)").
    - Use the fast inference tier if tiered inference is available, or batch carefully if single-model.
  - Profile persistence: after each batch, save the intermediate profile. If the app restarts mid-extraction, it resumes from where it left off (based on `emailsAnalyzed` count and a "last processed email ID" cursor).
- Tests: Job detects sent emails correctly (filters by from address). Initial extraction creates profile. Incremental update merges with existing profile. Batch processing processes emails in chunks. Resume after interruption (simulate by saving mid-batch, creating new job, verifying it continues). Minimum 8 tests.

### Commit 7: Correction Feedback Loop
`feat: add style correction tracking with profile learning`

- When a user edits a draft that Semblance generated (in Guardian mode, they modify the draft before approving; in Partner mode, they might edit after the fact):
  - Detect the edit: compare the original generated draft with the final sent version.
  - If they differ, store a correction: `addCorrection(originalDraft, correctedDraft)`.
  - Classify the correction type: did they change the greeting? Sign-off? Tone? Add/remove emoji? Use LLM to classify if the change is ambiguous.
  - Periodically (e.g., every 10 corrections, or weekly), apply corrections to the profile:
    - If 3+ corrections change the greeting to the same pattern → update the greeting frequency in the profile.
    - If corrections consistently add contractions → increase contraction rate.
    - If corrections consistently remove exclamation marks → decrease exclamation rate.
  - This creates a learning loop: the more the user corrects, the better the profile matches.
- **Integration point:** The correction detection hooks into wherever the "draft was edited before sending" event is captured. If the Orchestrator tracks the original draft and the Gateway receives the final sent version, compare them. If this event doesn't exist yet, create it — but keep it minimal: store the original draft ID on the ActionRequest, and when the email.send comes through, compare the sent body to the stored draft.
- Tests: Correction detected when draft is edited. Correction type classified correctly. Profile updates after sufficient corrections (3+ same-type). Profile does NOT update on single isolated corrections. Minimum 7 tests.

### Commit 8: UI Components + Settings
`feat: add style profile UI with match indicator and settings`

- Create `packages/desktop/src/components/StyleMatchIndicator.tsx`:
  - Small inline component shown on email draft cards/previews.
  - Shows: "Matches your style: 87%" with a color-coded bar or icon.
  - Colors follow DESIGN_SYSTEM.md: green for 80+, yellow for 60–79, red below 60.
  - Tooltip or expandable detail showing the breakdown (greeting, sign-off, formality, etc.).
  - When the profile is inactive: shows "Style learning in progress (12/20 emails)" instead of a score.
- Create `packages/desktop/src/components/StyleProfileCard.tsx`:
  - Settings component showing the style profile summary.
  - Displays: greeting patterns (top 3), sign-off patterns (top 3), formality level (with human-readable label: "Moderately formal"), contraction usage ("Uses contractions frequently"), emoji usage ("Rarely uses emoji"), total emails analyzed.
  - Status display: "Learning your style (12/20 emails analyzed)" when inactive, "Style profile active" when active.
  - Optional: "Re-analyze" button that triggers a fresh full extraction (useful if the user's style has changed significantly).
  - Optional: "Reset style profile" that clears the profile and starts fresh (with confirmation dialog).
- Add the StyleProfileCard to the Settings screen under a "Writing Style" section.
- Integrate StyleMatchIndicator into whatever component displays email draft previews (the approval card in Guardian mode, the draft preview in Partner mode).
- All UI follows DESIGN_SYSTEM.md.
- Tests: StyleMatchIndicator renders correct score and color. Inactive state shows learning message. StyleProfileCard renders profile summary. Settings integration. Minimum 6 tests.

### Commit 9: Privacy Audit + Integration Tests
`security: add privacy audit and integration tests for Step 11`

- Privacy verification:
  - Style profiles are stored in local SQLite only. Never transmitted through Gateway.
  - Style extraction runs entirely in packages/core/ using the InferenceRouter. No new network calls.
  - Correction data is stored locally only.
  - No new imports of networking libraries in packages/core/.
  - The guard test from Step 10 (no HTTP imports in core) still passes.
- Integration tests:
  - End-to-end: provide 25 fixture sent emails → run extraction → verify profile is created and active → generate a draft → verify style prompt was injected → verify style score is computed and returned.
  - End-to-end: provide 15 fixture sent emails → profile is inactive → generate a draft → verify generic prompt was used → verify "learning in progress" message in UI.
  - Correction loop: generate draft → simulate user edit → verify correction stored → simulate 3 more corrections of same type → verify profile updated.
  - Regression: all existing Orchestrator email tests pass. All existing email categorizer tests pass. The style system is additive — it must not break anything.
  - A/B comparison test: generate a draft WITHOUT style injection, then generate one WITH style injection using a strongly-characterized profile. Verify the two drafts differ (they won't be identical because they're LLM outputs, but the styled version should demonstrably include elements from the profile — e.g., the correct greeting pattern).
- Tests: Minimum 10 integration tests. All existing 1,780 tests pass.

---

## Exit Criteria

Every criterion must be verified. Do not claim completion unless ALL pass.

1. Style extraction pipeline processes sent emails and produces a structured JSON profile with all fields populated.
2. Profile includes greeting patterns, sign-off patterns, formality score, directness score, warmth score, avg sentence length, contraction rate, emoji usage, exclamation rate, and common phrases.
3. Profile stored in SQLite with versioning — updates create history entries, previous versions preserved.
4. Minimum 20-email threshold enforced — profile `isActive` is false below 20 emails. Drafting uses generic prompt when inactive.
5. When profile is active, style prompt injected into all email draft LLM prompts via the Orchestrator.
6. A/B test: styled draft demonstrably differs from unstyled draft (the LLM prompt includes profile-specific instructions that change the output).
7. Style match score computed via heuristic scorer (< 50ms, no LLM call). Score includes overall and per-dimension breakdown.
8. Score surfaced in draft UI via StyleMatchIndicator component. Color-coded. Inactive state shows learning progress.
9. Below-threshold drafts (< 70 score) trigger regeneration with targeted feedback. Max 2 retries, then present best attempt.
10. User corrections detected, stored, classified, and applied to profile after 3+ consistent corrections of the same type.
11. Background extraction job runs on initial email sync and incrementally on new sent emails. Processes in batches. Resumes after interruption.
12. StyleProfileCard in Settings shows profile summary, analysis status, and optionally re-analyze/reset actions.
13. All existing Orchestrator email tests (11 tests) still pass — zero regressions.
14. Privacy audit clean — style data stored locally only, no new network access from core, guard test passes.
15. 50+ new tests. All existing 1,780 tests pass. Total verified by test runner output.

---

## Approved Dependencies

No new dependencies required. This step uses:
- Existing SQLite setup (already in project)
- Existing InferenceRouter for LLM calls (Step 9)
- Existing email infrastructure from Sprint 2

Do NOT add NLP libraries (compromise, natural, etc.). The heuristic analysis uses regex and string operations. The LLM-assisted analysis uses InferenceRouter. No additional packages needed.

---

## What This Step Does NOT Include

- **Digital Representative** — No autonomous email handling beyond what Sprint 2 already does. Step 20.
- **Subscription cancellation** — No cancellation email drafting. Step 20.
- **Customer service templates** — No playbook system. Step 20.
- **Per-recipient style profiles** — One profile per user, not per recipient. Context variations within the single profile handle recipient-specific adjustments.
- **Voice/audio style matching** — Text email only. Voice interaction is Step 17.
- **Mobile UI** — StyleMatchIndicator and StyleProfileCard are desktop only. Mobile gets them in Step 12.

---

## Escalation Rules

Escalate to Orbital Directors if:
- The LLM produces inconsistent formality/tone scores across runs for the same emails, making the profile unreliable. This would require prompt engineering changes at the Orbital Director level.
- The style injection prompt makes the 7B model produce worse drafts than without it (the model follows the style instructions too literally and produces unnatural text). This is the medium-risk scenario flagged in the sprint plan.
- The correction detection requires changes to the IPC protocol or the Gateway audit trail schema. These are security-critical paths.
- You need to modify `autonomy.ts` or change the autonomy tier logic for any reason.

Do NOT escalate for:
- Prompt engineering iterations within the style injector — try multiple approaches and pick the best one.
- Scoring weight adjustments — use the suggested weights and adjust based on test results.
- UI layout decisions within DESIGN_SYSTEM.md guidelines.

---

## Completion Report

When you believe all exit criteria are met, provide:

1. **Exit criteria checklist** — each criterion with PASS/FAIL and evidence.
2. **Test count** — exact number from test runner output. Before and after.
3. **New files created** — list with one-line descriptions.
4. **Modified files** — list with what changed and why.
5. **Regression check** — explicit confirmation that all 11 existing Orchestrator email tests pass.
6. **A/B comparison** — show one unstyled draft and one styled draft from the same input, demonstrating the style system works.
7. **Privacy audit result** — PASS/FAIL.
8. **Deferred items** — anything intentionally deferred.
9. **Risks** — anything uncertain or needing Orbital Director review.

---

## Remember

This is the step where Semblance stops sounding like an AI and starts sounding like the user. A user who gets an email draft that opens with their usual "Hey [name]," instead of "Dear [name]," and closes with their habitual "Cheers," instead of "Best regards," will feel something no cloud AI can deliver — recognition. The AI knows how they communicate.

That feeling is what converts users. Build it well.
