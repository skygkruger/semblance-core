# Sprint 2 — Step 7: Subscription Detection + Autonomy Escalation + Knowledge Moment + Weekly Digest

## Implementation Prompt for Claude Code

**Date:** February 21, 2026
**Prerequisite:** Steps 1–6 complete (872 tests passing, privacy audit clean)
**Test Baseline:** 872 passing tests, privacy audit exit 0
**Sprint 2 Step Sequence:** Step 5 ✅ → Step 5B ✅ → Step 6 ✅ → **Step 7 (this)** → Step 8 (Network Monitor + Task Routing + Polish)

---

## Read First

Before writing any code, read these files in order:

1. `CLAUDE.md` — Architecture rules, IPC protocol, boundary rules, autonomy framework
2. `docs/DESIGN_SYSTEM.md` — Visual reference for all UI work
3. `packages/core/agent/orchestrator.ts` — Orchestrator with email/calendar tools (Step 6)
4. `packages/core/agent/proactive-engine.ts` — Proactive context engine (Step 6)
5. `packages/core/knowledge/email-indexer.ts` — Email indexing pipeline (Step 6)
6. `packages/core/knowledge/calendar-indexer.ts` — Calendar indexing pipeline (Step 6)
7. `packages/core/agent/email-categorizer.ts` — Email categorization (Step 6)
8. `packages/desktop/src/screens/InboxScreen.tsx` — Universal Inbox UI (Step 6)
9. `packages/desktop/src/components/PendingActionBanner.tsx` — Approval UI (Step 6)
10. `packages/desktop/src/screens/OnboardingScreen.tsx` — Current onboarding flow (Step 4)
11. The `ApprovalPattern` table in SQLite — Step 6 is accumulating approval data; Step 7 uses it

---

## Housekeeping First

Before any new feature work, clean up the stale `dist/` artifacts that are generating 86 TS6305 warnings on every `tsc --noEmit` run. These are noise that masks real type errors.

```bash
# Delete stale dist directories
find packages/ -name "dist" -type d -exec rm -rf {} +
# Verify zero warnings remain
npx tsc --noEmit 2>&1 | grep "error TS" | head -5
# Should output nothing
```

If the build breaks after removing dist, that means something is importing from dist instead of source — fix those imports. This should take 5 minutes and pays for itself in every subsequent verification step.

---

## Mission

This step delivers the four features that make Semblance spreadable. When this step is complete:

1. **Subscription Detection** — Users import a CSV or OFX bank statement. Semblance scans for recurring charges, identifies forgotten subscriptions, and calculates the annual cost of each. In Partner mode, it drafts cancellation actions. In Alter Ego mode, it initiates cancellation (with undo window). This is the viral moment: "My AI found $340/year in subscriptions I forgot about."

2. **Autonomy Escalation** — Semblance proactively suggests upgrading autonomy when it detects patterns of consistent approval. After 10 consecutive approvals of the same action type in Guardian mode: prompt to auto-handle. After consistent Partner mode success: prompt to upgrade to Alter Ego with a concrete preview of what changes. The escalation is opt-in, contextual, and tied to demonstrated success — never pushy.

3. **Full Knowledge Moment** — When the user connects email + calendar during onboarding, Semblance delivers the compound knowledge demonstration: cross-referencing an upcoming meeting with email history, relevant documents, and an unanswered message — then offers to take action. This is the product thesis made tangible in the first five minutes.

4. **Weekly Digest** — A structured summary of everything Semblance did, time saved, and autonomy recommendations. This is the retention hook — the weekly proof that Semblance is worth having.

---

## Architecture Constraints — Absolute

Same as every step. These are from CLAUDE.md. Non-negotiable.

- **AI Core has ZERO network access.** Financial data (CSV/OFX) enters through user file selection (local filesystem) — it never touches the Gateway or any network path.
- **All external calls flow through the Gateway.**
- **Every action is signed, logged, and auditable.**
- **Autonomy tiers are enforced.** Subscription actions follow the same tier logic as email/calendar actions.
- **Privacy audit must pass.** Exit 0 or the step fails.

**Critical note for subscription detection:** Bank statement files (CSV/OFX) are loaded from the local filesystem by the AI Core directly. This is NOT a Gateway operation — there is no network involved. The user selects a file → Core reads it → Core analyzes it. The Gateway is only involved if Semblance needs to take an action based on the findings (e.g., sending a cancellation email via SMTP).

---

## A. Subscription Detection

**Location:** `packages/core/finance/` (new directory)

### A1. File Import

```typescript
// packages/core/finance/statement-parser.ts

interface StatementParser {
  /** Parse a CSV bank/credit card statement into transactions */
  parseCSV(filePath: string, options?: CSVParseOptions): Promise<Transaction[]>;
  
  /** Parse an OFX/QFX bank statement into transactions */
  parseOFX(filePath: string): Promise<Transaction[]>;
  
  /** Auto-detect format and parse */
  parseStatement(filePath: string): Promise<Transaction[]>;
}

interface CSVParseOptions {
  dateColumn?: string;          // auto-detect if not specified
  amountColumn?: string;        // auto-detect if not specified
  descriptionColumn?: string;   // auto-detect if not specified
  dateFormat?: string;          // auto-detect common formats
  hasHeader?: boolean;          // default true
  delimiter?: string;           // default ','
}

interface Transaction {
  id: string;                   // nanoid
  date: string;                 // ISO 8601
  amount: number;               // negative = charge, positive = credit
  description: string;          // raw merchant description
  normalizedMerchant: string;   // cleaned merchant name
  category: string;             // auto-assigned category
  isRecurring: boolean;         // detected by pattern matcher
  recurrenceGroup: string | null;  // groups related recurring charges
}
```

**CSV auto-detection:** Bank CSVs have no standard format. The parser must handle:
- Different column orders and names ("Date", "Transaction Date", "Posted Date")
- Different date formats ("MM/DD/YYYY", "YYYY-MM-DD", "DD/MM/YYYY", "Jan 15, 2026")
- Different amount representations (negative for charges, or separate debit/credit columns)
- Different delimiters (comma, tab, semicolon)
- Headers that may or may not be present
- Extra metadata rows at the top or bottom of the file

Strategy: Use the LLM for column mapping when auto-detection confidence is low. Send the first 5 rows to the LLM with a prompt: "Identify which column is date, amount, and description. Return column indices." This is a local LLM call — no network involved.

**OFX parsing:** OFX (Open Financial Exchange) is a standardized XML-like format. Use a lightweight parser — the format is well-documented. Key tags: `<STMTTRN>`, `<DTPOSTED>`, `<TRNAMT>`, `<NAME>`, `<MEMO>`.

### A2. Merchant Normalization

Raw transaction descriptions are messy: "NETFLIX.COM 800-123-4567 CA", "SPOTIFY USA", "SQ *COFFEE SHOP PORTLAND". The normalizer extracts clean merchant names.

```typescript
// packages/core/finance/merchant-normalizer.ts

interface MerchantNormalizer {
  /** Normalize a raw transaction description to a clean merchant name */
  normalize(description: string): string;
  
  /** Group transactions by normalized merchant */
  groupByMerchant(transactions: Transaction[]): Map<string, Transaction[]>;
}
```

Implementation approach:
1. **Rule-based first pass:** Strip common noise (phone numbers, location codes, "SQ *", "POS PURCHASE", card-last-4-digits, etc.)
2. **Known merchant dictionary:** Maintain a local lookup of common merchant patterns → clean names (e.g., "NETFLIX" → "Netflix", "AMZN" → "Amazon", "SPOTIFY" → "Spotify")
3. **LLM fallback:** For unrecognized merchants, send a batch to the local LLM: "What company is this charge from? Return just the company name." This handles edge cases the rule engine misses.
4. **User correction:** If the user corrects a merchant name, store the correction and apply it to future imports.

### A3. Recurring Charge Detection

```typescript
// packages/core/finance/recurring-detector.ts

interface RecurringDetector {
  /** Detect recurring charges from a set of transactions */
  detect(transactions: Transaction[]): RecurringCharge[];
}

interface RecurringCharge {
  id: string;
  merchantName: string;           // normalized
  amount: number;                 // typical charge amount
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  confidence: number;             // 0-1, how confident we are this is recurring
  lastChargeDate: string;
  chargeCount: number;            // how many times this charge appeared
  estimatedAnnualCost: number;    // projected yearly cost
  transactions: Transaction[];    // the matching transactions
  status: 'active' | 'forgotten' | 'cancelled';
}
```

Detection algorithm:
1. Group transactions by normalized merchant name
2. For each merchant group with 2+ charges:
   a. Calculate intervals between charges
   b. Detect periodicity (monthly = ~28-32 day intervals, weekly = ~6-8, quarterly = ~85-95, annual = ~350-380)
   c. Calculate consistency (are amounts within 10% of each other?)
   d. Assign confidence based on periodicity regularity + amount consistency + charge count
3. Flag as "forgotten" if:
   - The charge is recurring with high confidence
   - The user has no email correspondence with the merchant in the past 90 days (search indexed emails)
   - The charge amount is > $5/month (filter out trivial charges)
4. Calculate `estimatedAnnualCost` = typical charge amount × frequency multiplier

### A4. Subscription Dashboard UI

**Location:** `packages/desktop/src/screens/SubscriptionsScreen.tsx` (new file) OR integrated into Universal Inbox as a section.

**Design decision:** Integrate subscription findings into the Universal Inbox as a proactive insight card rather than a separate screen. When subscription analysis completes, the results appear as a high-priority insight card in the Priority section:

```
┌─── 💰 Subscription Analysis ───────────────────────────┐
│                                                          │
│  Found 12 recurring charges · $247/month · $2,964/year  │
│                                                          │
│  ⚠️  3 potentially forgotten:                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🔴 Headspace          $14.99/mo   $180/yr       │   │
│  │    Last used: unknown · No emails in 6 months    │   │
│  │    [Cancel] [Keep] [Remind me later]             │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 🟡 Adobe Creative     $54.99/mo   $660/yr       │   │
│  │    Last email: 4 months ago · Low usage signals  │   │
│  │    [Cancel] [Keep] [Remind me later]             │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 🟡 LinkedIn Premium   $29.99/mo   $360/yr       │   │
│  │    Last email: 2 months ago                      │   │
│  │    [Cancel] [Keep] [Remind me later]             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Total potential savings: $1,200/year                    │
│                                                          │
│  [View all 12 subscriptions →]                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**"Cancel" action by autonomy tier:**
- **Guardian:** Shows draft cancellation email for review. User must approve.
- **Partner:** Drafts cancellation email and shows preview. User confirms or edits.
- **Alter Ego:** Sends cancellation email automatically. Shows in Actions Taken with 30-second undo window.

**"View all subscriptions" expands to a full list** showing:
- All detected recurring charges (not just forgotten ones)
- Monthly and annual totals
- Status indicators (active / potentially forgotten / user-confirmed-keep)
- Trend: total subscription spend over time (if multiple statement imports)

### A5. Statement Import UX

**Location:** Add to Settings screen OR accessible from Universal Inbox

```
┌─── Import Bank Statement ──────────────────────────────┐
│                                                          │
│  📄 Drop a CSV or OFX file here, or click to browse    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                    │   │
│  │            [Browse files]                         │   │
│  │                                                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  🔒 Your financial data stays on this device.           │
│     It is never sent anywhere. Ever.                    │
│                                                          │
│  Supported: CSV, OFX, QFX                               │
│  Most banks let you export statements in CSV format.    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

After file selection:
1. Show parsing progress: "Analyzing 342 transactions..."
2. If column auto-detection confidence is low, show a column mapping UI: "Which column is the date? Amount? Description?" with dropdown selectors pre-filled with best guesses
3. Show merchant normalization preview: "I identified 47 unique merchants. Here are the ones I'm less sure about:" with editable merchant names
4. Run recurring detection → show results in the subscription insight card

**File access:** Use Tauri's native file dialog (`dialog.open()`) to let the user select a file from their filesystem. The file path is passed to the Core's statement parser via the sidecar bridge. NO network involved. The file never leaves the device.

### A6. Data Storage

Store transaction and subscription data in Core's SQLite:

```typescript
// SQLite tables
interface StoredTransaction {
  id: string;
  importId: string;              // links to the import session
  date: string;
  amount: number;
  rawDescription: string;
  normalizedMerchant: string;
  category: string;
  isRecurring: boolean;
  recurrenceGroupId: string | null;
  importedAt: string;
}

interface StoredRecurringCharge {
  id: string;
  merchantName: string;
  typicalAmount: number;
  frequency: string;
  confidence: number;
  lastChargeDate: string;
  chargeCount: number;
  estimatedAnnualCost: number;
  status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
  lastEmailContactDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StatementImport {
  id: string;
  fileName: string;
  fileFormat: 'csv' | 'ofx' | 'qfx';
  transactionCount: number;
  dateRange: { start: string; end: string };
  importedAt: string;
}
```

**Important:** Transaction data is Tier 1 (free) for subscription detection only. Full financial intelligence (categorization, anomaly detection, budgeting) is Tier 2/Sprint 3. The schema should be designed to support the full financial suite later, but only the subscription detection features are implemented now.

---

## B. Autonomy Escalation

**Location:** `packages/core/agent/autonomy-escalation.ts` (new file), UI components in `packages/desktop/src/components/`

### B1. Escalation Engine

The escalation engine monitors the `ApprovalPattern` table (created in Step 6) and generates escalation prompts when thresholds are met.

```typescript
// packages/core/agent/autonomy-escalation.ts

interface EscalationEngine {
  /** Check all approval patterns and generate escalation prompts if thresholds are met */
  checkForEscalations(): Promise<EscalationPrompt[]>;
  
  /** Record user response to an escalation prompt */
  recordResponse(promptId: string, accepted: boolean): Promise<void>;
}

interface EscalationPrompt {
  id: string;
  type: 'guardian_to_partner' | 'partner_to_alterego';
  domain: string;                   // 'email', 'calendar', 'finance'
  actionType: string;               // specific action type, e.g., 'archive_email'
  consecutiveApprovals: number;     // how many in a row
  message: string;                  // the user-facing prompt text
  previewActions: PreviewAction[];  // what would change if they accept
  createdAt: string;
  expiresAt: string;                // prompts expire after 7 days
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
}

interface PreviewAction {
  description: string;              // "Archive newsletters automatically"
  currentBehavior: string;          // "Currently: shows preview, waits for approval"
  newBehavior: string;              // "New: archives automatically, shows in digest"
  estimatedTimeSaved: string;       // "~2 minutes/day"
}
```

### B2. Escalation Thresholds

```typescript
const ESCALATION_THRESHOLDS = {
  // Guardian → Partner: after N consecutive approvals of the same action type
  guardian_to_partner: {
    threshold: 10,
    cooldown: 7 * 24 * 60 * 60 * 1000,  // don't re-prompt for 7 days after dismissal
    message: (actionType: string, count: number, name: string) =>
      `You've approved all ${count} of ${name}'s ${actionType} actions this week. ` +
      `Want ${name} to handle these automatically?`,
  },
  
  // Partner → Alter Ego: after N days of consistent success with zero corrections
  partner_to_alterego: {
    threshold: 14,  // 14 days of autonomous action with no rejections
    cooldown: 14 * 24 * 60 * 60 * 1000,  // don't re-prompt for 14 days
    message: (domain: string, days: number, name: string) =>
      `${name} has handled your ${domain} autonomously for ${days} days with no corrections. ` +
      `Ready to let ${name} take on more? Here's what Alter Ego mode would do differently:`,
  },
};
```

### B3. Escalation Prompt UI

The escalation prompt appears as a special card in the Universal Inbox's Priority section — not as a modal or blocking dialog. It's prominent but dismissable.

```
┌─── 🚀 Trust Upgrade Available ─────────────────────────┐
│                                                          │
│  You've approved all 12 of [name]'s email archive       │
│  actions this week. Want [name] to handle these          │
│  automatically?                                          │
│                                                          │
│  What changes:                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Archive newsletters                               │   │
│  │ Currently: Shows preview, waits for approval      │   │
│  │ New: Archives automatically, shows in digest      │   │
│  │ Time saved: ~2 min/day                            │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Categorize routine emails                         │   │
│  │ Currently: Shows categories, waits for confirm    │   │
│  │ New: Categorizes and files automatically          │   │
│  │ Time saved: ~3 min/day                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  You can always change this in Settings.                 │
│                                                          │
│  [Yes, handle automatically]  [Not yet]                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design system compliance:**
- Card background: `--color-accent-subtle` to distinguish from other insight cards
- Border-left: 3px `--color-accent` (Warm Amber — this is a positive upgrade, not an alert)
- "What changes" preview uses `--color-surface-2` background
- Current behavior in `--color-text-secondary`, new behavior in `--color-text-primary`
- "Yes" button: primary style. "Not yet" button: ghost style
- "You can always change this in Settings" in `--color-text-tertiary`

### B4. Escalation Execution

When the user accepts an escalation:
1. Update the autonomy tier for the specified domain in the user's preferences
2. Log the tier change to the audit trail: `{ action: 'autonomy.upgrade', from: 'Guardian', to: 'Partner', domain: 'email', trigger: 'approval_pattern', consecutiveApprovals: 12 }`
3. Show a confirmation toast: "[name] will now handle email archiving automatically. You'll see a summary in your daily digest."
4. Mark the escalation prompt as `accepted`

When the user dismisses:
1. Mark the prompt as `dismissed`
2. Start the cooldown timer (7 days for G→P, 14 days for P→AE)
3. Do NOT re-prompt until cooldown expires AND the approval count threshold is met again

---

## C. Full Knowledge Moment (Onboarding Enhancement)

**Location:** Modify `packages/desktop/src/screens/OnboardingScreen.tsx` and add `packages/core/agent/knowledge-moment.ts` (new file)

### C1. Knowledge Moment Generator

After the user connects email AND calendar during onboarding (or later from Settings), and initial indexing completes, the Knowledge Moment fires.

```typescript
// packages/core/agent/knowledge-moment.ts

interface KnowledgeMomentGenerator {
  /** Generate the compound knowledge demonstration */
  generate(): Promise<KnowledgeMoment | null>;
}

interface KnowledgeMoment {
  // The upcoming meeting we'll reference
  upcomingMeeting: {
    title: string;
    startTime: string;
    attendees: string[];
  };
  
  // Email context with attendees
  emailContext: {
    attendeeName: string;
    recentEmailCount: number;
    lastEmailSubject: string;
    lastEmailDate: string;
    hasUnansweredEmail: boolean;
    unansweredSubject: string | null;
  };
  
  // Related documents (from file index)
  relatedDocuments: {
    fileName: string;
    filePath: string;
    relevanceReason: string;       // "Mentions Portland contract" 
  }[];
  
  // The compound message
  message: string;
  
  // Suggested action
  suggestedAction: {
    type: 'draft_reply' | 'create_reminder' | 'prepare_meeting';
    description: string;
  } | null;
}
```

### C2. Generation Logic

```typescript
async function generateKnowledgeMoment(): Promise<KnowledgeMoment | null> {
  // 1. Find the next meeting with external attendees (not just the user)
  const meetings = await calendarIndexer.getUpcoming({ hours: 48, excludeAllDay: true });
  const meetingWithAttendees = meetings.find(m => m.attendees.length > 0);
  
  if (!meetingWithAttendees) {
    // Fallback: find ANY meeting and correlate with emails
    // If no meetings at all, use email-only demonstration
    return generateEmailOnlyMoment();
  }
  
  // 2. Find email history with attendees
  const attendeeEmail = meetingWithAttendees.attendees[0];
  const emailHistory = await emailIndexer.search({
    from: attendeeEmail,
    limit: 10,
    sort: 'date_desc'
  });
  
  // 3. Check for unanswered emails from this attendee
  const unanswered = emailHistory.find(e => 
    !e.isRead || (/* check if user hasn't replied */)
  );
  
  // 4. Search knowledge graph for related documents
  const relatedDocs = await knowledgeGraph.search({
    query: meetingWithAttendees.title + ' ' + attendeeEmail,
    type: 'file',
    limit: 3
  });
  
  // 5. Construct the compound message using the LLM
  const message = await constructKnowledgeMessage({
    meeting: meetingWithAttendees,
    emails: emailHistory,
    unanswered,
    documents: relatedDocs
  });
  
  return { upcomingMeeting: meetingWithAttendees, emailContext: { ... }, relatedDocuments: relatedDocs, message, suggestedAction: unanswered ? { type: 'draft_reply', description: `Draft a reply to ${unanswered.fromName}'s message` } : null };
}
```

### C3. Fallback Strategies

The Knowledge Moment must work even with limited data. Priority order:

1. **Full compound (ideal):** Meeting + email history with attendee + related document + unanswered email → "You have a meeting with Sarah tomorrow. The last 3 emails were about the Portland contract. Here's the relevant doc. You haven't replied to her Monday message. Want me to draft a reply?"

2. **Email + calendar (no related docs):** Meeting + email history → "You're meeting with Sarah tomorrow. You've exchanged 5 emails this week about the Q1 budget. Her latest question is still unanswered."

3. **Email-only (no upcoming meetings):** Unanswered emails + sender context → "You have 3 unanswered emails from frequent contacts. The highest priority is from Amy Park about the budget review — she asked a question 2 days ago."

4. **Calendar-only (no email connected):** Upcoming meetings + file context → "You have a meeting with 4 attendees tomorrow. I found 3 documents on your device that mention the meeting topic."

5. **Files-only (no email or calendar):** This is the Sprint 1 fallback that already exists: "I found 847 documents on your device. Here's what I know about your recent projects."

### C4. Onboarding Flow Update

The onboarding screen sequence (Step 3 of onboarding — "The Knowledge Moment") needs to be wired to the Knowledge Moment generator:

1. After email + calendar indexing completes, call `KnowledgeMomentGenerator.generate()`
2. Display the result in a dedicated onboarding screen with:
   - The compound knowledge message (generated text)
   - Visual indicators for each data source used (email icon, calendar icon, file icon) — showing the cross-referencing
   - The suggested action button ("Draft a reply" / "Prepare meeting" / etc.)
   - If the user clicks the suggested action, execute it immediately — this is the onboarding's First Autonomous Action
3. Transition to autonomy selection (Step 5 of onboarding) after the user acknowledges or takes the action

The Knowledge Moment screen should feel like a reveal — use motion and progressive disclosure. Don't dump everything at once. Show the meeting first, then animate in the email context, then the documents, then the suggested action. Each layer should feel like Semblance is building understanding in real-time.

### C5. Post-Onboarding Knowledge Moments

The Knowledge Moment isn't just for onboarding. After the first connection, generate daily Knowledge Moments as proactive insight cards in the Universal Inbox. These are less theatrical than the onboarding version — just a proactive card that cross-references data sources:

- "Your 2 PM with Sarah: she sent a follow-up yesterday you haven't seen yet. Related: the contract doc in your Downloads folder."
- "Amy asked about the budget 3 days ago. You have a meeting with her team on Thursday. Want me to draft a response before then?"

These integrate with the existing ProactiveEngine from Step 6 — they're a new insight type (`knowledge_moment`) that specifically cross-references multiple data sources.

---

## D. Weekly Digest

**Location:** `packages/core/digest/weekly-digest.ts` (new file), `packages/desktop/src/screens/DigestScreen.tsx` (new file)

### D1. Digest Generator

```typescript
// packages/core/digest/weekly-digest.ts

interface WeeklyDigestGenerator {
  /** Generate the digest for the past week */
  generate(weekStart: string, weekEnd: string): Promise<WeeklyDigest>;
  
  /** Get the most recent digest */
  getLatest(): Promise<WeeklyDigest | null>;
  
  /** List all generated digests */
  list(): Promise<DigestSummary[]>;
}

interface WeeklyDigest {
  id: string;
  weekStart: string;               // ISO 8601
  weekEnd: string;
  generatedAt: string;
  
  // Action summary
  totalActions: number;
  actionsByType: Record<string, number>;  // e.g., { 'archive_email': 23, 'draft_reply': 5 }
  
  // Time saved
  totalTimeSavedSeconds: number;
  timeSavedByType: Record<string, number>;
  timeSavedFormatted: string;       // "2 hours 15 minutes"
  
  // Email summary
  emailsProcessed: number;
  emailsArchived: number;
  emailsDrafted: number;
  emailsSent: number;               // autonomous sends
  
  // Calendar summary
  conflictsDetected: number;
  conflictsResolved: number;
  meetingPrepsGenerated: number;
  
  // Subscription summary (if any imports this week)
  subscriptionsAnalyzed: number;
  forgottenSubscriptions: number;
  potentialSavings: number;         // annual savings in dollars
  
  // Proactive insights
  followUpReminders: number;
  deadlineAlerts: number;
  
  // Autonomy metrics
  actionsAutoExecuted: number;      // executed without approval
  actionsApproved: number;          // user-approved
  actionsRejected: number;          // user-rejected
  autonomyAccuracy: number;         // (auto + approved) / total — measures how well Semblance is calibrated
  
  // Escalation recommendation (if applicable)
  escalationRecommendation: EscalationPrompt | null;
  
  // AI-generated narrative
  narrative: string;                // LLM-generated summary paragraph
  
  // Highlights
  highlights: DigestHighlight[];
}

interface DigestHighlight {
  type: 'subscription_savings' | 'time_saved_milestone' | 'autonomy_accuracy' | 'notable_action';
  title: string;                    // "Saved $340/year in forgotten subscriptions"
  description: string;
  impact: string;                   // quantified impact
}
```

### D2. Digest Generation Logic

The digest runs automatically at the start of each week (Monday 8 AM local time, or on first app launch after Monday 8 AM):

1. Query the audit trail for all actions in the past 7 days
2. Aggregate by action type, count `estimatedTimeSavedSeconds`
3. Query subscription data for any new findings this week
4. Query the escalation engine for any pending recommendations
5. Generate highlights — pick the 2-3 most impactful numbers
6. Generate the narrative paragraph using the LLM:

```typescript
const narrativePrompt = `You are ${userName}'s personal AI assistant named ${aiName}. 
Write a brief, warm, one-paragraph summary of what you accomplished this week.

Stats:
- ${totalActions} actions taken
- ${timeSavedFormatted} saved
- ${emailsArchived} emails archived, ${emailsDrafted} drafts prepared
- ${conflictsResolved} calendar conflicts resolved
${potentialSavings > 0 ? `- Found $${potentialSavings}/year in potentially forgotten subscriptions` : ''}
- Autonomy accuracy: ${Math.round(autonomyAccuracy * 100)}%

Tone: Concise, warm, slightly proud of the work done. Not sycophantic. 
Focus on the most impactful actions. One paragraph, 3-4 sentences max.`;
```

### D3. Digest Screen UI

A new screen accessible from the sidebar (or a weekly notification that opens it):

```
┌─────────────────────────────────────────────────────────────┐
│  Weekly Digest · Feb 17–23, 2026                            │
│                                                              │
│  ┌── Narrative ──────────────────────────────────────────┐  │
│  │ "This week I handled 47 actions that would have taken │  │
│  │  you about 2 hours 15 minutes. I archived 23 routine  │  │
│  │  emails, prepared briefs for your 4 meetings, and     │  │
│  │  found 3 subscriptions you may have forgotten —       │  │
│  │  potentially saving you $1,200/year."                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Highlights ─────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  💰 $1,200/year    ⏱️ 2h 15m saved    📧 47 actions  │  │
│  │  potential savings   this week          completed      │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Actions Breakdown ──────────────────────────────────┐  │
│  │                                                        │  │
│  │  Email                                                 │  │
│  │  ██████████████████░░  23 archived · 5 drafted ·      │  │
│  │                         2 sent · 38 categorized        │  │
│  │                                                        │  │
│  │  Calendar                                              │  │
│  │  ██████░░░░░░░░░░░░░░  4 meeting preps ·              │  │
│  │                         1 conflict resolved            │  │
│  │                                                        │  │
│  │  Subscriptions                                         │  │
│  │  ████░░░░░░░░░░░░░░░░  3 forgotten found ·            │  │
│  │                         $1,200/yr potential savings     │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Autonomy Health ────────────────────────────────────┐  │
│  │                                                        │  │
│  │  Accuracy: 96%  (45 auto + 2 approved / 47 total)    │  │
│  │  0 rejected this week                                  │  │
│  │                                                        │  │
│  │  🚀 Ready for more? [View escalation recommendation]  │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Full Action Log ────────────────────────────────────┐  │
│  │  [View all 47 actions →]                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Design system compliance:**
- Highlights row uses large numbers in `--color-primary` with labels in `--color-text-secondary`
- Progress bars use `--color-primary` fill on `--color-surface-2` track
- Narrative box uses `--color-surface-1` with `--color-border` border, italic text
- "Ready for more?" uses `--color-accent` text (links to the escalation prompt)
- Digest is printable / shareable (for users who want to show someone what Semblance does)

### D4. Digest Notification

When a new digest is generated:
1. Show a notification badge on the sidebar digest icon
2. If the user opens the app on Monday, show a non-blocking banner: "Your weekly digest is ready. [View]"
3. The digest persists — users can review past weeks' digests

### D5. Sidecar Bridge Extensions

```typescript
// New sidecar commands
'digest:generate'         → WeeklyDigestGenerator.generate(weekStart, weekEnd)
'digest:getLatest'        → WeeklyDigestGenerator.getLatest()
'digest:list'             → WeeklyDigestGenerator.list()
```

---

## E. Sidecar Bridge Extensions (All Features)

Add all new sidecar commands for this step:

```typescript
// Subscription detection
'finance:importStatement'   → StatementParser.parseStatement(filePath)
'finance:getSubscriptions'  → RecurringDetector.getStoredCharges()
'finance:updateSubscriptionStatus' → RecurringDetector.updateStatus(chargeId, status)
'finance:getImportHistory'  → StatementParser.getImports()

// Autonomy escalation
'escalation:check'          → EscalationEngine.checkForEscalations()
'escalation:respond'        → EscalationEngine.recordResponse(promptId, accepted)
'escalation:getActive'      → EscalationEngine.getActivePrompts()

// Knowledge Moment
'knowledge:generateMoment'  → KnowledgeMomentGenerator.generate()

// Weekly digest
'digest:generate'           → WeeklyDigestGenerator.generate(weekStart, weekEnd)
'digest:getLatest'          → WeeklyDigestGenerator.getLatest()
'digest:list'               → WeeklyDigestGenerator.list()
```

**New Tauri commands in `lib.rs`:**

```rust
#[tauri::command]
async fn import_statement(file_path: String) -> Result<ImportResult, String>

#[tauri::command]
async fn get_subscriptions() -> Result<Vec<RecurringCharge>, String>

#[tauri::command]
async fn update_subscription_status(charge_id: String, status: String) -> Result<(), String>

#[tauri::command]
async fn check_escalations() -> Result<Vec<EscalationPrompt>, String>

#[tauri::command]
async fn respond_to_escalation(prompt_id: String, accepted: bool) -> Result<(), String>

#[tauri::command]
async fn generate_knowledge_moment() -> Result<KnowledgeMoment, String>

#[tauri::command]
async fn generate_digest(week_start: String, week_end: String) -> Result<WeeklyDigest, String>

#[tauri::command]
async fn get_latest_digest() -> Result<Option<WeeklyDigest>, String>
```

---

## Testing Requirements

### New Test Suites

| Test Suite | Location | What It Validates |
|------------|----------|-------------------|
| **CSV parser** | `tests/core/statement-parser-csv.test.ts` | Handles various CSV formats (different column names, date formats, delimiters, debit/credit columns). Graceful failure on malformed files. Auto-detection of column mapping. Header vs no-header detection. |
| **OFX parser** | `tests/core/statement-parser-ofx.test.ts` | Parses standard OFX format. Extracts transactions with correct dates and amounts. Handles OFX header variations. |
| **Merchant normalizer** | `tests/core/merchant-normalizer.test.ts` | Strips noise from raw descriptions. Known merchant dictionary matches. Consistent normalization (same merchant always → same name). Edge cases: international merchants, square/stripe prefixes, partial matches. |
| **Recurring detector** | `tests/core/recurring-detector.test.ts` | Detects monthly charges. Detects weekly/quarterly/annual. Confidence scoring correlates with regularity. "Forgotten" flagging checks email correspondence. Handles amount variations (e.g., Netflix price changes). Doesn't false-positive on one-time similar charges. |
| **Subscription UI** | `tests/desktop/subscriptions.test.ts` | Insight card renders with correct totals. Individual subscription cards show correct data. Cancel/Keep/Remind buttons trigger correct handlers. Autonomy tier affects cancel button behavior. |
| **Escalation engine** | `tests/core/escalation-engine.test.ts` | Guardian→Partner triggers at threshold (10 consecutive). Partner→AlterEgo triggers at threshold (14 days). Cooldown prevents re-prompting. Dismissed prompts respect cooldown. Accepted escalation updates autonomy tier. Multiple domains tracked independently. |
| **Escalation UI** | `tests/desktop/escalation-prompt.test.ts` | Prompt card renders with correct data. Preview actions show current vs new behavior. Accept/dismiss buttons work. Confirmation toast appears. |
| **Knowledge Moment generator** | `tests/core/knowledge-moment.test.ts` | Full compound moment generated when all data available. Fallback to email+calendar when no docs. Fallback to email-only when no meetings. Fallback to files-only when no email/calendar. Returns null gracefully when no data. |
| **Knowledge Moment onboarding** | `tests/desktop/knowledge-moment-onboarding.test.ts` | Onboarding screen displays the generated moment. Cross-source indicators show correctly. Suggested action button works. Progressive disclosure animation sequence (if testable). Transitions to autonomy selection. |
| **Weekly digest generator** | `tests/core/weekly-digest.test.ts` | Aggregates actions correctly from audit trail. Time-saved calculation is correct. Narrative generation invokes LLM. Highlights pick the most impactful items. Empty week produces valid (not embarrassing) digest. |
| **Weekly digest UI** | `tests/desktop/digest.test.ts` | Digest screen renders all sections. Highlights display with correct formatting. Action breakdown shows correct counts. Autonomy health section accurate. "View all actions" links to action log. Past digests are listable. |
| **Privacy audit** | existing `scripts/privacy-audit/` | No regressions. Financial data parsing in Core has ZERO network imports. Statement files are read from local filesystem only. |

### Test Fixtures

Create representative test fixtures:

```
tests/fixtures/
├── statements/
│   ├── chase-credit-card.csv        # typical US credit card CSV
│   ├── bofa-checking.csv            # Bank of America checking format
│   ├── wells-fargo.ofx              # OFX format
│   ├── european-bank.csv            # DD/MM/YYYY dates, comma decimals
│   ├── minimal.csv                  # bare minimum: date, amount, description
│   ├── messy.csv                    # extra header rows, footer, mixed formats
│   └── no-subscriptions.csv         # one-time purchases only (no recurring)
├── knowledge-moments/
│   ├── full-compound.json           # meeting + emails + docs + unanswered
│   ├── email-calendar-only.json     # no related documents
│   ├── email-only.json              # no meetings
│   └── empty.json                   # new user, no data
```

### Existing Test Baseline

- All 872 existing tests must continue to pass
- Privacy audit must pass (exit 0)
- No regressions in Step 6 functionality (email/calendar tools, inbox, proactive engine)

### Test Target

Expect approximately 100–130 new tests across these suites. The total should reach approximately 970–1,000 tests passing.

---

## What This Step Does NOT Include

| Feature | Ships In | Why Not Now |
|---------|----------|-------------|
| Network Monitor (real-time) | Step 8 | Existing Privacy Dashboard sufficient |
| Task routing (mobile ↔ desktop) | Step 8 | Desktop-first for Sprint 2 |
| Plaid / real-time bank connection | Sprint 3 | CSV/OFX import is the Sprint 2 approach |
| Full financial categorization | Sprint 3 | Only subscription detection in Sprint 2 |
| Transaction budgeting / spending insights | Sprint 3 | Sprint 2 is focused on subscriptions |
| Communication style learning | Sprint 3 | Needed for Alter Ego quality, not for the escalation prompt |
| Subscription cancellation via Digital Representative | Sprint 3 | Sprint 2 drafts cancellation email; Sprint 3 handles the negotiation |
| IMAP IDLE (push notifications) | Step 8 | Polling is sufficient |
| Rich text email composer | Future | Plain text sufficient |

---

## Escalation Triggers

Stop and escalate to Orbital Directors if:

- The CSV parser needs a dependency larger than a basic CSV parsing library (e.g., if considering a full data analysis framework)
- The OFX parser needs a dependency not on the pre-approved list
- The Knowledge Moment generation requires changes to the onboarding flow architecture beyond adding a new screen
- The weekly digest narrative generation requires a different LLM model or prompt strategy than what's used for chat
- The escalation engine needs to modify the autonomy tier storage in a way that affects other components
- You discover that the subscription cancel action needs Gateway capabilities not yet implemented (e.g., form submission)
- The statement import flow needs to store raw financial data in a way that could be a privacy concern (e.g., storing full transaction descriptions that might contain personal info in logs)

---

## Autonomous Decision Authority

You may proceed without escalating for:

- CSV column auto-detection heuristics
- Merchant normalization rules and dictionary entries
- Recurring charge detection thresholds and confidence scoring
- Escalation threshold values (the 10-consecutive and 14-day defaults can be tuned)
- Escalation cooldown durations
- Knowledge Moment fallback hierarchy and message construction
- Digest narrative prompt wording
- Digest generation schedule (Monday 8 AM is the default; adjustments are fine)
- UI layout details within the design system
- Test fixture data
- SQLite schema details for transactions and subscriptions
- Time-saved estimate values for new action types

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

1. **Housekeeping** — Clean stale dist/ directories. Verify zero TS warnings. 5 minutes.
2. **CSV/OFX parser** — Statement parsing with auto-detection. Test with fixture files. This is self-contained — no dependencies on other Step 7 features.
3. **Merchant normalizer** — Clean merchant names. Test with real-world transaction descriptions.
4. **Recurring charge detector** — Pattern matching + "forgotten" flagging (checks email index). Test with fixture data including edge cases.
5. **Subscription UI** — Insight card in Universal Inbox + import flow. Wire to sidecar bridge.
6. **Escalation engine** — Monitor approval patterns, generate prompts. Depends on Step 6's ApprovalPattern data.
7. **Escalation UI** — Prompt card in Universal Inbox. Wire accept/dismiss flows.
8. **Knowledge Moment generator** — Cross-source compound intelligence. Depends on email + calendar indexers from Step 6.
9. **Knowledge Moment onboarding** — Update onboarding flow with the full Knowledge Moment screen. Wire to generator.
10. **Weekly digest generator** — Aggregate audit trail data, generate narrative. Depends on accumulated action data.
11. **Weekly digest UI** — New screen with all sections. Wire to sidecar bridge.
12. **Sidecar bridge wiring** — Connect all new Tauri commands.
13. **Integration tests** — End-to-end: import statement → detect subscriptions → card appears in inbox → user clicks cancel → email drafted (respecting autonomy tier).
14. **Privacy audit** — Run full audit. Financial data must stay in Core. Exit 0 required.

---

## Exit Criteria

This step is complete when ALL of the following are true:

1. ☐ CSV import works — user selects a CSV bank statement, transactions are parsed with auto-detected column mapping
2. ☐ OFX import works — user selects an OFX file, transactions are parsed correctly
3. ☐ Merchant normalization produces clean names from messy descriptions
4. ☐ Recurring charge detection identifies subscriptions with correct frequency and annual cost estimates
5. ☐ "Forgotten" subscriptions are flagged based on email correspondence absence + charge recurrence
6. ☐ Subscription insight card appears in Universal Inbox with correct totals and individual subscription details
7. ☐ Cancel action respects autonomy tier — Guardian: shows draft, Partner: shows preview, Alter Ego: sends with undo
8. ☐ Autonomy escalation triggers after threshold consecutive approvals (configurable, default 10 for G→P)
9. ☐ Escalation prompt card appears in Universal Inbox with concrete preview of behavior changes
10. ☐ Accepting escalation updates the autonomy tier and logs to audit trail
11. ☐ Dismissing escalation starts cooldown — no re-prompt until cooldown expires and threshold is re-met
12. ☐ Full Knowledge Moment generates compound cross-source intelligence (meeting + emails + docs + action)
13. ☐ Knowledge Moment displays in onboarding after email + calendar connection with progressive disclosure
14. ☐ Knowledge Moment has working fallback hierarchy (email+cal → email-only → calendar-only → files-only)
15. ☐ Weekly digest generates with correct action counts, time-saved totals, and AI narrative
16. ☐ Digest screen renders all sections — narrative, highlights, breakdown, autonomy health
17. ☐ Digest notification appears when new digest is available
18. ☐ `estimatedTimeSavedSeconds` continues accumulating correctly for all action types including new ones
19. ☐ All ~970+ tests passing (872 existing + ~100-130 new)
20. ☐ Privacy audit passes (exit 0) — financial data parsed in Core with ZERO network imports
21. ☐ Stale dist/ warnings are gone — `tsc --noEmit` produces zero TS6305 errors
22. ☐ A human can import a bank statement, see forgotten subscriptions flagged with annual savings, receive an escalation prompt after consistent approvals, see the Knowledge Moment in onboarding, and review a weekly digest showing time saved — all without any data leaving the device

---

## Remember

This step delivers the viral moment. The subscription savings card, the Knowledge Moment, the escalation prompt, and the weekly digest are the four things users will screenshot and share. They're also the four things that prove the product thesis: Semblance is more capable because it's private. No cloud AI has your financial data, your email history, your calendar context, AND your document library. Semblance has all of it, locally, compounding, and acting.

"My AI found $340/year in subscriptions I forgot about" is how Semblance spreads. Build it to earn that screenshot.
