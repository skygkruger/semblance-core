# Step 20 — Digital Representative + Subscription Cancellation

## Implementation Prompt for Claude Code

**Date:** February 23, 2026
**Context:** Steps 1–19 complete. Extension interface built — `registerTools()`, `registerTracker()`, `registerExtensionAdapters()`, UI slots all operational. Step 19 delivered financial awareness with the `PremiumGate`. Step 11 delivered style profile extraction and style-matched email drafting. Sprint 4 continues — "Becomes Part of You."
**What this step delivers:** The Digital Representative's first autonomous actions. Semblance drafts and sends emails in the user's voice, cancels forgotten subscriptions, handles customer service interactions, and does it all while respecting autonomy tiers. This is where Semblance stops being a tool and starts being a representative.
**Test Baseline:** 3,167 tests passing across ~248 files. Privacy audit clean. TypeScript compilation clean.
**Architecture Note:** This is the first step built on the extension interface. All new tools, insight trackers, and gateway adapters MUST register via the extension system (`registerTools()`, `registerTracker()`), NOT be hardcoded into the orchestrator or proactive engine. The extension pattern established in the repo split session is mandatory.
**Premium Feature:** All Step 20 features are Digital Representative tier. Free tier sees nothing new from this step. Gate checks happen at the orchestrator tool level and UI level via `PremiumGate.isFeatureAvailable()`.
**Naming Convention:** In ALL user-facing strings (UI labels, upgrade prompts, settings text, dashboard copy), the paid tier is called **"Digital Representative"** — never "Premium." Internal code uses `PremiumGate`, `isPremium()`, `LicenseTier`. This distinction is non-negotiable.
**Rule:** ZERO stubs, ZERO placeholders, ZERO deferrals. Every deliverable ships production-ready.

---

## Read First

Before writing any code, read these files:

- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules
- `/docs/DESIGN_SYSTEM.md` — Trellis design system
- `packages/core/extensions/types.ts` — SemblanceExtension interface, ExtensionTool, ExtensionInsightTracker
- `packages/core/extensions/loader.ts` — How extensions are loaded
- `packages/core/extensions/ui-slots.ts` — How UI slots work
- `packages/core/agent/orchestrator.ts` — registerTools() method, BASE_TOOLS, processToolCalls extension dispatch
- `packages/core/agent/proactive-engine.ts` — registerTracker() method
- `packages/core/agent/types.ts` — AutonomyDomain, autonomy tier definitions
- `packages/core/agent/autonomy.ts` — ACTION_DOMAIN_MAP, ACTION_RISK_MAP, getConfig()
- `packages/core/types/ipc.ts` — ActionType enum, email.send/email.draft actions
- `packages/core/premium/premium-gate.ts` — PremiumGate, isFeatureAvailable(), PremiumFeature
- Find and read the Step 11 style profile code:
  - Search for `style`, `StyleProfile`, `StyleExtractor`, `styleMatcher` across the codebase
  - Understand the style profile JSON structure, the style injection into LLM prompts, the style score
- Find and read the Sprint 2 subscription detection code:
  - `packages/core/finance/recurring-detector.ts` — RecurringDetector, SubscriptionSummary
- Find and read the email infrastructure:
  - Email drafting, email sending via IPC (`email.send`, `email.draft`)
  - How the orchestrator currently handles email actions

**CRITICAL: Map the style profile system and email infrastructure before writing anything.** Step 20 consumes Step 11's style profile to draft emails in the user's voice. If you don't understand the style injection mechanism, the representative's emails won't sound like the user.

---

## Why This Step Matters — The Moat Argument

This is where Semblance becomes a representative, not just an assistant.

ChatGPT can draft an email if you tell it what to say. Semblance drafts emails that sound like YOU wrote them — using your greeting, your sign-off, your formality level, your sentence structure. It doesn't just know what to say, it knows how you'd say it.

And it doesn't just draft — it acts. A subscription you forgot about? Semblance drafts the cancellation email in your voice, sends it, tracks whether the company responds, and follows up if they don't. A meeting confirmation? Semblance handles it end-to-end. A billing dispute? Semblance uses a battle-tested template, fills in your specifics, and sends it with your approval (or autonomously in Alter Ego mode).

The autonomy tiers matter here more than any previous step:
- **Guardian mode:** Every representative action shown for explicit approval. User reviews and approves each email.
- **Partner mode:** Routine actions (meeting confirmations, simple replies) sent automatically. Complex actions (cancellation, disputes) shown for approval.
- **Alter Ego mode:** All representative actions sent autonomously. Full audit trail. User can review after the fact.

This is the feature that sells the Digital Representative tier. "My AI cancelled a subscription I forgot about and saved me $340/year" — that's the viral moment.

---

## Scope Overview

| Section | Description | Test Target |
|---------|-------------|-------------|
| A | Representative Email Drafter (style-matched) | 10+ |
| B | Subscription Cancellation Engine | 12+ |
| C | Customer Service Templates | 8+ |
| D | Follow-Up Tracker | 8+ |
| E | Autonomy Integration + Approval Flow | 8+ |
| F | Orchestrator Tools (via extension registration) | 6+ |
| G | ProactiveEngine Integration (via extension registration) | 4+ |
| H | Representative Dashboard UI | 8+ |
| I | Privacy Audit + Integration Tests | 6+ |

**Minimum 65 new tests. Target 70+.**

---

## Section A: Representative Email Drafter

### A1: RepresentativeEmailDrafter

Create `packages/core/representative/email-drafter.ts`:

```typescript
/**
 * Drafts emails in the user's voice using the style profile from Step 11.
 *
 * This is the core capability of the Digital Representative. Every email
 * the representative sends goes through this drafter to ensure it sounds
 * like the user wrote it.
 *
 * Flow:
 * 1. Receive draft request (intent, recipient, context)
 * 2. Load style profile from Step 11's style system
 * 3. Build LLM prompt with: intent, recipient context, style profile, conversation history
 * 4. Generate draft via InferenceRouter
 * 5. Score style match (reuse Step 11's scoring)
 * 6. If score < threshold: regenerate with stronger style injection (max 2 retries)
 * 7. Return draft with style score and metadata
 *
 * Draft types:
 * - Meeting confirmation: "Yes, Thursday at 2pm works for me."
 * - Simple Q&A reply: respond to a direct question with relevant info
 * - Scheduling response: propose or confirm times
 * - Follow-up: "Just following up on my email from last week about..."
 * - Cancellation request: formal cancellation of a subscription/service
 * - Customer service: billing dispute, refund request, account inquiry
 *
 * The drafter does NOT decide whether to send. That's the autonomy system's job.
 * The drafter produces a draft; the RepresentativeActionManager handles approval/sending.
 */
export class RepresentativeEmailDrafter {
  constructor(
    private inferenceRouter: InferenceRouter,
    private styleProfile: StyleProfileProvider,
    private knowledgeGraph: KnowledgeProvider
  ) {}

  async draft(request: DraftRequest): Promise<DraftResult>;
  async draftReply(originalEmail: EmailContext, intent: ReplyIntent): Promise<DraftResult>;
  async draftCancellation(subscription: SubscriptionContext): Promise<DraftResult>;
  async draftFromTemplate(template: ServiceTemplate, context: TemplateContext): Promise<DraftResult>;
}

export interface DraftRequest {
  to: string[];
  cc?: string[];
  subject: string;
  intent: string;
  recipientContext?: string;
  conversationHistory?: EmailContext[];
  draftType: DraftType;
}

export type DraftType =
  | 'meeting-confirmation'
  | 'simple-reply'
  | 'scheduling'
  | 'follow-up'
  | 'cancellation'
  | 'customer-service'
  | 'general';

export interface DraftResult {
  subject: string;
  body: string;
  styleScore: number;
  regenerations: number;
  draftType: DraftType;
  metadata: {
    recipientName?: string;
    conversationId?: string;
    templateId?: string;
  };
}

export interface EmailContext {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  date: number;
}

export type ReplyIntent =
  | 'confirm' | 'decline' | 'reschedule'
  | 'answer-question' | 'provide-info'
  | 'follow-up' | 'general';

export interface StyleProfileProvider {
  getStyleProfile(): Promise<StyleProfile | null>;
  getStyleScore(text: string): Promise<number>;
  hasMinimumData(): Promise<boolean>;
}

export interface KnowledgeProvider {
  getRecipientContext(email: string): Promise<string | null>;
  getRecentInteractions(email: string, limit: number): Promise<EmailContext[]>;
}
```

**Tests (10+):** `tests/core/representative/email-drafter.test.ts`
- Draft meeting confirmation includes style profile elements
- Draft reply uses conversation history context
- Style score below threshold triggers regeneration
- Maximum 2 regenerations then return best attempt
- Draft cancellation produces formal cancellation email
- Draft from template fills context into template
- Missing style profile → neutral professional tone with notice
- hasMinimumData false → neutral tone
- Recipient context enriches the draft
- Draft metadata populated correctly

---

## Section B: Subscription Cancellation Engine

### B1: CancellationEngine

Create `packages/core/representative/cancellation-engine.ts`:

```typescript
/**
 * Orchestrates the subscription cancellation workflow.
 *
 * Flow:
 * 1. User selects subscription to cancel (from Step 19's data + Sprint 2's detector)
 * 2. Engine determines the cancellation method:
 *    a. Email cancellation: draft and send cancellation email
 *    b. Known cancellation URL: surface URL to user (no browser automation)
 * 3. Draft cancellation email using RepresentativeEmailDrafter
 * 4. Submit to RepresentativeActionManager for approval/sending
 * 5. Track follow-up: if no response within configurable period (default 3 days), draft follow-up
 * 6. Report result: cancelled, pending, needs-attention
 *
 * The engine does NOT do browser automation or navigate websites.
 * Email-based cancellation only. Known cancellation URLs are surfaced
 * for the user to handle manually.
 *
 * Scope boundary: This sends cancellation REQUESTS. It does not guarantee
 * the subscription is actually cancelled. It tracks the request and follows up.
 */
export class CancellationEngine {
  constructor(
    private emailDrafter: RepresentativeEmailDrafter,
    private actionManager: RepresentativeActionManager,
    private followUpTracker: FollowUpTracker,
    private subscriptionDetector: RecurringDetector
  ) {}

  async getSubscriptions(): Promise<CancellableSubscription[]>;
  async initiateCancellation(subscriptionId: string, options: CancellationOptions): Promise<CancellationAction>;
  async getPendingCancellations(): Promise<CancellationStatus[]>;
  async triggerFollowUps(): Promise<FollowUpResult[]>;
}

export interface CancellableSubscription {
  id: string;
  merchantName: string;
  amountCents: number;
  frequency: 'monthly' | 'yearly' | 'weekly';
  annualCostCents: number;
  lastChargeDate: number;
  nextExpectedDate: number;
  supportEmail?: string;
  cancellationUrl?: string;
  cancellationMethod: 'email' | 'url' | 'unknown';
}

export interface CancellationOptions {
  type: 'cancel' | 'refund' | 'downgrade';
  reason?: string;
  effectiveDate?: number;
}

export interface CancellationAction {
  id: string;
  subscriptionId: string;
  type: CancellationOptions['type'];
  status: 'draft-pending' | 'approval-pending' | 'sent' | 'follow-up-pending' | 'completed' | 'failed';
  emailDraft?: DraftResult;
  sentAt?: number;
  followUpAt?: number;
}

export interface CancellationStatus {
  action: CancellationAction;
  subscription: CancellableSubscription;
  daysSinceSent: number;
  responseReceived: boolean;
  followUpCount: number;
}
```

### B2: SupportEmailExtractor

Create `packages/core/representative/support-email-extractor.ts`:

```typescript
/**
 * Extracts support/billing email addresses from:
 * 1. Known merchant database (hardcoded for common services)
 * 2. User's email history (emails FROM the merchant)
 * 3. LLM extraction from email signatures and footers
 */
export class SupportEmailExtractor {
  constructor(
    private knowledgeProvider: KnowledgeProvider,
    private inferenceRouter: InferenceRouter
  ) {}

  async findSupportEmail(merchantName: string): Promise<SupportContact | null>;
}

export interface SupportContact {
  email: string;
  source: 'known-database' | 'email-history' | 'llm-extraction';
  confidence: number;
}
```

**Tests (12+):** `tests/core/representative/cancellation-engine.test.ts` (8) + `tests/core/representative/support-email-extractor.test.ts` (4)
- Initiate cancellation drafts email via RepresentativeEmailDrafter
- Cancellation with refund option includes refund language
- Pending cancellations tracked correctly
- Follow-up triggered after 3 days with no response
- Follow-up email references original cancellation request
- Support email found from known database
- Support email extracted from email history
- Support email falls back to LLM extraction
- getSubscriptions returns CancellableSubscription list
- Cancellation status tracks response
- Unknown cancellation method returns 'url' or 'unknown'
- Multiple follow-ups increment count

---

## Section C: Customer Service Templates

### C1: TemplateEngine

Create `packages/core/representative/template-engine.ts`:

```typescript
/**
 * Pre-built playbooks for common customer service interactions.
 *
 * Each template is a structured intent that the LLM expands
 * into a natural, style-matched email.
 *
 * Built-in templates:
 * - Refund request
 * - Billing dispute
 * - Service cancellation
 * - Account inquiry
 * - Complaint escalation
 * - Warranty claim
 */
export class TemplateEngine {
  constructor(private emailDrafter: RepresentativeEmailDrafter) {}

  getTemplates(): ServiceTemplate[];
  async fillTemplate(templateId: string, context: TemplateContext): Promise<DraftResult>;
}

export interface ServiceTemplate {
  id: string;
  name: string;
  description: string;
  category: 'refund' | 'billing' | 'cancellation' | 'inquiry' | 'escalation' | 'warranty';
  requiredFields: TemplateField[];
  optionalFields: TemplateField[];
}

export interface TemplateField {
  name: string;
  label: string;
  type: 'text' | 'date' | 'amount' | 'email' | 'select';
  options?: string[];
  autoFill?: string;
}

export interface TemplateContext {
  fields: Record<string, string | number>;
  recipientEmail: string;
  recipientName?: string;
  previousCorrespondence?: EmailContext[];
}
```

**Tests (8+):** `tests/core/representative/template-engine.test.ts`
- getTemplates returns 6 built-in templates
- Refund template includes amount and date
- Billing dispute template includes charge details
- fillTemplate produces DraftResult via emailDrafter
- Template with auto-fill fields populates from context
- Unknown template ID returns error
- Template validation catches missing required fields
- Escalation template references previous correspondence

---

## Section D: Follow-Up Tracker

### D1: FollowUpTracker

Create `packages/core/representative/follow-up-tracker.ts`:

```typescript
/**
 * Tracks pending representative actions and triggers follow-ups.
 *
 * SQLite table: representative_follow_ups (id, action_id, action_type,
 *   recipient_email, sent_at, follow_up_window_days, follow_up_count,
 *   max_follow_ups, response_received, needs_attention, last_follow_up_at,
 *   thread_id)
 *
 * Follow-up escalation:
 * - Day 3: first follow-up
 * - Day 7: second follow-up (firmer tone)
 * - Day 14: mark as "needs attention" — surface to user
 * - Max 2 automated follow-ups, then human takes over
 */
export class FollowUpTracker {
  constructor(private db: DatabaseHandle) {}

  async createFollowUp(entry: FollowUpEntry): Promise<void>;
  async getOverdueFollowUps(): Promise<FollowUpEntry[]>;
  async markResponseReceived(actionId: string): Promise<void>;
  async markFollowUpSent(actionId: string): Promise<void>;
  async getFollowUpStatus(actionId: string): Promise<FollowUpEntry | null>;
  async getPendingFollowUps(): Promise<FollowUpEntry[]>;
  async markNeedsAttention(actionId: string): Promise<void>;
}

export interface FollowUpEntry {
  id: string;
  actionId: string;
  actionType: 'cancellation' | 'service-request' | 'general';
  recipientEmail: string;
  sentAt: number;
  followUpWindowDays: number;
  followUpCount: number;
  maxFollowUps: number;
  responseReceived: boolean;
  needsAttention: boolean;
  lastFollowUpAt?: number;
  threadId?: string;
}
```

**Tests (8+):** `tests/core/representative/follow-up-tracker.test.ts`
- Create follow-up entry, retrieve it
- getOverdueFollowUps returns entries past window
- markResponseReceived clears follow-up
- Follow-up count increments after send
- Max follow-ups reached → needs attention
- Pending follow-ups excludes responded entries
- Thread ID matching for response detection
- Multiple follow-ups for different actions tracked independently

---

## Section E: Representative Action Manager + Autonomy

### E1: RepresentativeActionManager

Create `packages/core/representative/action-manager.ts`:

```typescript
/**
 * Central manager for all representative actions.
 * Integrates with the autonomy system to determine approval requirements.
 *
 * Every action flows through here:
 * 1. RepresentativeEmailDrafter produces a draft
 * 2. ActionManager determines autonomy requirements
 * 3. Based on autonomy tier:
 *    - Guardian: queue for explicit user approval
 *    - Partner: auto-send routine, queue complex for approval
 *    - Alter Ego: auto-send all, full audit trail
 * 4. Approved actions are sent via IPC (email.send)
 * 5. Follow-up tracker notified
 * 6. Audit trail entry created
 *
 * Action classification:
 * - Routine: meeting confirmations, simple replies → auto-send in Partner/Alter Ego
 * - Standard: scheduling, follow-ups → auto-send in Alter Ego only
 * - High-stakes: cancellations, disputes, financial → approval in Partner, auto in Alter Ego
 *
 * CRITICAL: Every action generates an audit trail entry regardless of
 * autonomy tier. The user can always see what the representative did.
 */
export class RepresentativeActionManager {
  constructor(
    private ipcClient: IPCClient,
    private premiumGate: PremiumGate,
    private autonomyConfig: AutonomyConfigProvider,
    private followUpTracker: FollowUpTracker
  ) {}

  async submit(draft: DraftResult, request: ActionRequest): Promise<ActionOutcome>;
  async getPendingApprovals(): Promise<PendingAction[]>;
  async approve(actionId: string): Promise<ActionOutcome>;
  async reject(actionId: string, reason?: string): Promise<void>;
  async getActionHistory(limit: number): Promise<RepresentativeAction[]>;
}

export interface ActionRequest {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  draftType: DraftType;
  classification: 'routine' | 'standard' | 'high-stakes';
  relatedSubscriptionId?: string;
  relatedTemplateId?: string;
  followUpDays?: number;
}

export type ActionOutcome =
  | { status: 'sent'; actionId: string; sentAt: number }
  | { status: 'queued-for-approval'; actionId: string }
  | { status: 'rejected'; reason?: string }
  | { status: 'gate-blocked'; feature: PremiumFeature };

export interface PendingAction {
  id: string;
  draft: DraftResult;
  request: ActionRequest;
  createdAt: number;
  classification: ActionRequest['classification'];
}

export interface RepresentativeAction {
  id: string;
  type: DraftType;
  to: string[];
  subject: string;
  status: 'sent' | 'approved' | 'rejected' | 'pending';
  classification: ActionRequest['classification'];
  styleScore: number;
  sentAt?: number;
  createdAt: number;
}

export interface AutonomyConfigProvider {
  getCurrentTier(): Promise<'guardian' | 'partner' | 'alter-ego'>;
  getDomainConfig(domain: string): Promise<{ riskLevel: string }>;
}
```

**Tests (8+):** `tests/core/representative/action-manager.test.ts`
- Guardian mode: all actions queued for approval
- Partner mode: routine actions auto-sent
- Partner mode: high-stakes actions queued for approval
- Alter Ego mode: all actions auto-sent
- Approve pending action → sent via IPC
- Reject pending action → not sent
- Premium gate blocks non-DR users
- Audit trail entry created for every sent action

---

## Section F: Orchestrator Tools (Extension Registration)

### F1: Representative Extension Tools

Create `packages/core/representative/extension-tools.ts`:

```typescript
/**
 * Tools registered via the extension system, NOT hardcoded in orchestrator.
 *
 * Registered by calling orchestrator.registerTools() during initialization.
 *
 * Tools:
 * - cancel_subscription: "Cancel my Netflix subscription"
 * - draft_service_email: "Write a refund request to Amazon"
 * - check_representative_status: "What has my representative done today?"
 * - list_pending_actions: "Any actions waiting for my approval?"
 */
export function getRepresentativeTools(): ExtensionTool[];
```

**Tests (6+):** `tests/core/representative/extension-tools.test.ts`
- cancel_subscription tool handler calls CancellationEngine
- draft_service_email tool handler calls TemplateEngine
- check_representative_status returns action history
- list_pending_actions returns pending approvals
- Tools are registered via registerTools (integration)
- Premium gate checked before tool execution

---

## Section G: ProactiveEngine Integration (Extension Registration)

### G1: RepresentativeInsightTracker

Create `packages/core/representative/insight-tracker.ts`:

```typescript
/**
 * Generates proactive insights for the Digital Representative.
 * Registered via proactiveEngine.registerTracker(), NOT hardcoded.
 *
 * Insight types:
 * - 'representative-action-complete': "Your representative cancelled Netflix."
 * - 'follow-up-needed': "No response to your cancellation request."
 * - 'cancellation-recommendation': "You haven't used [service] in 3 months."
 * - 'pending-approval': "3 actions waiting for your approval."
 */
export class RepresentativeInsightTracker implements ExtensionInsightTracker {
  constructor(
    private actionManager: RepresentativeActionManager,
    private followUpTracker: FollowUpTracker,
    private cancellationEngine: CancellationEngine,
    private premiumGate: PremiumGate
  ) {}

  generateInsights(): ProactiveInsight[];
}
```

**Tests (4+):** `tests/core/representative/insight-tracker.test.ts`
- Generates cancellation-recommendation for unused subscriptions
- Generates follow-up-needed for overdue actions
- Generates pending-approval when approvals waiting
- Returns empty when not premium

---

## Section H: Representative Dashboard UI

### H1: RepresentativeDashboard

Create `packages/desktop/src/components/RepresentativeDashboard.tsx`:

```typescript
/**
 * Dashboard for the Digital Representative.
 *
 * Sections:
 * - Action summary: "Your representative has handled 12 emails this week"
 * - Pending approvals: cards with approve/reject buttons
 * - Active cancellations: status of each cancellation
 * - Recent actions: scrollable list with type, recipient, status, style score
 * - Savings tracker: "Total saved by cancellations: $540/year"
 *
 * Free tier: "Activate your Digital Representative" prompt.
 * Digital Representative tier: full dashboard.
 *
 * All user-facing text: "Digital Representative" — never "Premium."
 */
```

### H2: CancellationFlow

Create `packages/desktop/src/components/CancellationFlow.tsx`:
- Subscription list with "Cancel" button per item
- Cancellation options (cancel/refund/downgrade)
- Draft preview with style score
- Approve/edit/reject flow
- Status tracking card (sent, awaiting response, follow-up sent)

### H3: TemplatePicker

Create `packages/desktop/src/components/TemplatePicker.tsx`:
- Grid of 6 template cards
- Template form with auto-filled and manual fields
- Draft preview before sending

### H4: Mobile RepresentativeScreen

Create `packages/mobile/src/screens/RepresentativeScreen.tsx`:
- Mobile-optimized action list and approval flow
- Swipe to approve/reject

**Tests (8+):**
- `tests/desktop/representative-dashboard.test.ts` (3) — Dashboard renders action summary, pending approvals with approve/reject, free tier shows Digital Representative activation prompt
- `tests/desktop/cancellation-flow.test.ts` (2) — Subscription list renders with cancel button, draft preview shows style score
- `tests/desktop/template-picker.test.ts` (2) — Template picker shows 6 templates, template form validates required fields
- `tests/core/representative/representative-state.test.ts` (1) — State loads correctly from managers

---

## Section I: Privacy Audit + Integration Tests

### I1: Privacy Tests

Create `tests/privacy/representative-privacy.test.ts` (3 tests):
- Zero network imports in `packages/core/representative/`
- Zero Gateway imports in `packages/core/representative/`
- Representative actions use existing `email.send` IPC action (no new network paths)

### I2: Integration Tests

Create `tests/integration/representative-e2e.test.ts` (3 tests):
- E2E: initiate cancellation → draft generated → approval flow → sent via IPC → follow-up tracked
- E2E: template → fill → draft → style-matched → sent
- E2E: premium gate blocks representative tools for free tier

---

## Commit Strategy

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A | RepresentativeEmailDrafter + style interfaces | 10+ |
| 2 | B | CancellationEngine + SupportEmailExtractor | 12+ |
| 3 | C | TemplateEngine (6 templates) | 8+ |
| 4 | D | FollowUpTracker (SQLite) | 8+ |
| 5 | E | RepresentativeActionManager + autonomy integration | 8+ |
| 6 | F | Extension tools (4 tools registered via registerTools) | 6+ |
| 7 | G | RepresentativeInsightTracker (registered via registerTracker) | 4+ |
| 8 | H | Dashboard + Cancellation Flow + Template Picker + Mobile | 8+ |
| 9 | I1 | Privacy test suite | 3+ |
| 10 | I2 | Integration tests + barrel exports | 3+ |

**Minimum 65 new tests. Target: 70+.**

---

## Exit Criteria

Step 20 is complete when ALL of the following are true.

### Representative Email Drafting (A)
1. ☐ RepresentativeEmailDrafter produces style-matched drafts using Step 11's style profile
2. ☐ Style score computed for every draft
3. ☐ Below-threshold drafts regenerated (max 2 retries)
4. ☐ Missing style profile → neutral professional tone with notice
5. ☐ Recipient context from knowledge graph enriches drafts

### Subscription Cancellation (B)
6. ☐ CancellationEngine lists subscriptions with cancellation recommendations
7. ☐ Cancellation email drafted in user's voice
8. ☐ Support email extracted from known database, email history, or LLM
9. ☐ Cancel/refund/downgrade options all produce appropriate emails
10. ☐ Follow-up triggered after configurable window (default 3 days)

### Customer Service Templates (C)
11. ☐ 6 built-in templates: refund, billing, cancellation, inquiry, escalation, warranty
12. ☐ Templates filled with context and passed through style-matched drafter
13. ☐ Required field validation

### Follow-Up Tracking (D)
14. ☐ Follow-ups tracked in SQLite
15. ☐ Overdue follow-ups detected
16. ☐ Response detection via thread matching
17. ☐ Max 2 automated follow-ups, then needs-attention flag

### Autonomy Integration (E)
18. ☐ Guardian mode: all actions queued for approval
19. ☐ Partner mode: routine auto-sent, complex queued
20. ☐ Alter Ego mode: all actions auto-sent with full audit trail
21. ☐ Every sent action creates audit trail entry
22. ☐ Premium gate enforced — free tier blocked

### Extension Registration (F, G)
23. ☐ 4 representative tools registered via orchestrator.registerTools()
24. ☐ Zero hardcoded representative tools in orchestrator BASE_TOOLS
25. ☐ RepresentativeInsightTracker registered via proactiveEngine.registerTracker()
26. ☐ Zero hardcoded representative imports in proactive-engine.ts

### UI (H)
27. ☐ Representative Dashboard renders action summary and pending approvals
28. ☐ Cancellation flow shows subscription list → draft preview → approve/reject
29. ☐ Template picker shows 6 templates with form validation
30. ☐ Free tier shows "Activate your Digital Representative" prompt
31. ☐ Mobile representative screen functional

### Privacy & Integration (I)
32. ☐ Zero network imports in packages/core/representative/
33. ☐ Zero Gateway imports in packages/core/representative/
34. ☐ E2E cancellation flow: draft → approve → send → follow-up
35. ☐ E2E template flow: select → fill → draft → send

### Totals
36. ☐ 65+ new tests
37. ☐ All 3,167+ existing tests still pass
38. ☐ TypeScript compilation clean (npx tsc --noEmit → EXIT_CODE=0)
39. ☐ Privacy audit clean

---

## Verification Checks

After all 10 commits, run these checks:

```bash
echo "=== CHECK 1: TEST COUNT ==="
npx vitest run 2>&1 | tail -20
echo "--- Expected: 3,232+ tests (3,167 + 65+), 0 failures ---"

echo "=== CHECK 2: SOURCE FILES ==="
find packages/core/representative -name "*.ts" -not -name "*.test.ts" | sort
echo "--- Expected: 7+ source files ---"
wc -l packages/core/representative/*.ts

echo "=== CHECK 3: TEST FILES ==="
find tests/core/representative tests/desktop tests/integration tests/privacy -name "*representative*" -o -name "*cancellation*" -o -name "*template-picker*" | sort
echo "--- Expected: 12+ test files ---"

echo "=== CHECK 4: EXTENSION REGISTRATION (NOT HARDCODED) ==="
echo "--- Orchestrator should have ZERO representative tool imports ---"
grep -n "RepresentativeEmailDrafter\|CancellationEngine\|TemplateEngine\|RepresentativeActionManager" packages/core/agent/orchestrator.ts
echo "--- Expected: ZERO matches ---"
echo ""
echo "--- ProactiveEngine should have ZERO representative imports ---"
grep -n "RepresentativeInsightTracker" packages/core/agent/proactive-engine.ts
echo "--- Expected: ZERO matches ---"
echo ""
echo "--- Extension tools registered via registerTools ---"
grep -n "registerTools\|getRepresentativeTools" packages/core/representative/extension-tools.ts
echo "--- Expected: function that returns ExtensionTool[] ---"

echo "=== CHECK 5: AUTONOMY INTEGRATION ==="
grep -n "guardian\|partner\|alter.ego\|classification" packages/core/representative/action-manager.ts | head -20
echo "--- Expected: autonomy tier handling ---"

echo "=== CHECK 6: STYLE PROFILE CONSUMPTION ==="
grep -n "StyleProfileProvider\|styleProfile\|styleScore\|getStyleProfile" packages/core/representative/email-drafter.ts | head -15
echo "--- Expected: style profile integration ---"

echo "=== CHECK 7: FOLLOW-UP TRACKER SQLITE ==="
grep -n "CREATE TABLE\|representative_follow_ups" packages/core/representative/follow-up-tracker.ts
echo "--- Expected: SQLite table definition ---"

echo "=== CHECK 8: DIGITAL REPRESENTATIVE NAMING ==="
grep -rn "Digital Representative" packages/desktop/src/components/Representative*.tsx packages/desktop/src/components/Cancellation*.tsx packages/desktop/src/components/TemplatePicker.tsx packages/mobile/src/screens/Representative*.tsx 2>/dev/null
echo "--- Expected: Multiple 'Digital Representative' strings ---"
echo ""
grep -rn ">[^<]*[Pp]remium[^<]*<" packages/desktop/src/components/Representative*.tsx packages/desktop/src/components/Cancellation*.tsx packages/mobile/src/screens/Representative*.tsx 2>/dev/null
echo "--- Expected: ZERO user-facing 'Premium' strings ---"

echo "=== CHECK 9: PRIVACY AUDIT ==="
grep -rn "^import.*from.*gateway\|from.*@semblance/gateway" packages/core/representative/ --include="*.ts" | grep -v ".test."
echo "--- Expected: ZERO gateway imports in core/representative ---"
echo ""
grep -rn "fetch\|XMLHttpRequest\|WebSocket\|import.*http\|import.*net\b" packages/core/representative/ --include="*.ts" | grep -v ".test." | grep -v "web_fetch"
echo "--- Expected: ZERO network imports ---"

echo "=== CHECK 10: TYPESCRIPT ==="
npx tsc --noEmit 2>&1
echo "TSC EXIT_CODE=$?"
echo "--- Expected: 0 ---"

echo "=== CHECK 11: TEMPLATES ==="
grep -n "category:" packages/core/representative/template-engine.ts | head -10
echo "--- Expected: 6 categories (refund, billing, cancellation, inquiry, escalation, warranty) ---"

echo "=== CHECK 12: CANCELLATION ENGINE ==="
grep -n "CancellableSubscription\|CancellationOptions\|CancellationAction" packages/core/representative/cancellation-engine.ts | head -10
echo "--- Expected: All types exported ---"
```

---

## Escalation Triggers

If ANY of these occur, STOP and report before proceeding:

1. **Step 11 style profile code cannot be located or has been deleted.** The representative cannot draft emails without the style system.
2. **Style profile interface incompatible.** If the style system doesn't expose a way to get the profile and compute a style score, report the actual interface.
3. **Email sending IPC action (`email.send`) doesn't accept the fields the representative needs.** Report the actual payload schema.
4. **RecurringDetector from Sprint 2 doesn't expose subscription data in a usable format.** Report what it actually returns.
5. **Extension registration methods (`registerTools`, `registerTracker`) don't accept the signatures expected.** Report the actual method signatures.
6. **The extension framework from the repo split session has compile errors or test failures.** This must be stable before building on it.

---

## The Bar

When Step 20 is complete, this is what works:

- A user says "Cancel my Netflix subscription." Semblance finds the subscription in their financial data, looks up Netflix's support email, drafts a cancellation email in the user's voice with their greeting and sign-off, and submits it for approval. In Guardian mode they see the draft and approve it. In Alter Ego mode it just sends. Three days later with no response, Semblance drafts a follow-up. The whole thing shows up in the representative dashboard with a savings tracker: "Cancelling Netflix saves you $190/year."

- A user says "I need to dispute a charge from Amazon for $47.99." Semblance pulls up the billing dispute template, fills in the amount, date, and merchant from financial data, drafts the email in the user's voice, and submits it. The user can edit the draft or approve as-is.

- A user in Partner mode gets a meeting confirmation email. Semblance recognizes it as routine, drafts "Sounds good, see you Thursday at 2!" in the user's voice, and sends it automatically. The action shows up in the audit trail and representative dashboard.

That's not an AI assistant. That's a digital representative.
