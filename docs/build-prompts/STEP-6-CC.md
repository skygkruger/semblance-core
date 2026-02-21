# Sprint 2 — Step 6: Universal Inbox + AI Actions + Proactive Context Engine

## Implementation Prompt for Claude Code

**Date:** February 21, 2026
**Prerequisite:** Steps 1–5B complete (723 tests passing, privacy audit clean)
**Test Baseline:** 723 passing tests, privacy audit exit 0
**Sprint 2 Step Sequence:** Step 5 ✅ → Step 5B ✅ → **Step 6 (this)** → Step 7 (Subscription Detection + Escalation + Knowledge Moment + Digest) → Step 8 (Network Monitor + Task Routing + Polish)

---

## Read First

Before writing any code, read these files in order:

1. `CLAUDE.md` — Architecture rules, IPC protocol, boundary rules, autonomy framework
2. `docs/DESIGN_SYSTEM.md` — Visual reference for all UI work
3. `packages/core/agent/orchestrator.ts` — Current Orchestrator implementation (tool calling, approval flows)
4. `packages/core/agent/tools.ts` — Current tool definitions
5. `packages/core/knowledge/` — Knowledge graph, semantic search, entity resolution
6. `packages/gateway/services/email/` — IMAP and SMTP adapters (Step 5)
7. `packages/gateway/services/calendar/` — CalDAV adapter (Step 5)
8. `packages/desktop/src-tauri/sidecar/bridge.ts` — Sidecar bridge command routing
9. `packages/desktop/src/pages/` — Existing app screens and navigation

---

## Mission

This step transforms Semblance from a local document Q&A tool into an autonomous personal agent. When this step is complete:

1. **Universal Inbox** — A unified view of emails, calendar events, and file activity, sorted by AI-determined priority. Not a list of notifications. An intelligent command center.
2. **AI Email Actions** — The Orchestrator can fetch inbox, categorize emails, draft responses, send routine replies, and archive low-priority messages — all respecting the user's autonomy tier.
3. **AI Calendar Actions** — The Orchestrator can fetch upcoming events, detect scheduling conflicts, suggest resolutions, and create events.
4. **Proactive Context Engine** — Background intelligence that connects data across sources: meeting prep (who are the attendees, what were the last emails exchanged, what documents are relevant), deadline tracking, follow-up reminders.
5. **Email Indexing** — Fetched emails are indexed into the knowledge graph so the LLM can reason about email content in conversations.

This is where the product becomes a verb. After Step 6, Semblance doesn't just answer questions — it acts.

---

## Architecture Constraints — Absolute

These are from CLAUDE.md. Violating any of them is a critical failure.

- **AI Core (`packages/core/`) has ZERO network access.** Email/calendar data reaches Core exclusively through IPC responses from the Gateway. Core never imports networking libraries.
- **All external calls flow through the Gateway (`packages/gateway/`).** The Gateway uses the IMAP, SMTP, and CalDAV adapters built in Step 5.
- **Every action is signed, logged, and auditable.** Actions are logged to the audit trail BEFORE execution. No silent operations.
- **Autonomy tiers are enforced.** Guardian = show and wait. Partner = routine automatic, novel requires approval. Alter Ego = act freely, interrupt only for high-stakes.
- **The privacy audit must pass.** Run `scripts/privacy-audit/` after implementation. Exit 0 or the step fails.

---

## A. Email Indexing Pipeline

**Location:** `packages/core/knowledge/email-indexer.ts` (new file)

When the user has connected an email account (Step 5), Semblance needs to index email content into the knowledge graph so the LLM can search and reason about it.

### A1. Initial Index (On Account Connection)

When a user first connects email:

1. Core sends `email.fetch` action to Gateway via IPC with `{ folder: 'INBOX', limit: 200, sort: 'date_desc' }` — fetch the most recent 200 messages
2. For each message returned, Core:
   a. Extracts entities: sender name/email, recipients, subject keywords, dates mentioned, people mentioned in body
   b. Generates embedding of subject + first 500 chars of body (using the local embedding model)
   c. Stores in LanceDB with metadata (messageId, threadId, folder, date, from, to, subject, snippet)
   d. Stores structured email metadata in SQLite (for fast filtering without vector search)
   e. Resolves entities against existing knowledge graph (e.g., links email sender to known contact)
3. Emit progress events: `semblance://email-index-progress` with `{ indexed: number, total: number }`
4. After initial index completes, emit `semblance://email-index-complete`

### A2. Incremental Sync

After initial index, periodically fetch new messages:

- Poll interval: configurable, default 5 minutes
- Only fetch messages newer than the most recent indexed message (use IMAP `SINCE` filter)
- Index new messages using the same pipeline as A1
- This runs as a background task — should not block the UI or chat

### A3. Calendar Indexing

Same pattern for calendar events:

1. Core sends `calendar.fetch` action to Gateway with date range (past 30 days to future 60 days)
2. For each event: extract entities (attendees, location, recurring pattern), generate embedding of title + description, store in LanceDB + SQLite
3. Incremental sync: re-fetch upcoming events every 15 minutes

### A4. Data Schema

```typescript
// SQLite table for fast email queries (no vector search needed)
interface IndexedEmail {
  id: string;                    // nanoid
  messageId: string;             // IMAP Message-ID header
  threadId: string;              // derived from References/In-Reply-To
  folder: string;                // INBOX, Sent, etc.
  from: string;                  // sender email
  fromName: string;              // sender display name
  to: string[];                  // recipient emails
  subject: string;
  snippet: string;               // first 200 chars of body, plaintext
  receivedAt: string;            // ISO 8601
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string[];              // AI-assigned categories (Step 6)
  priority: 'high' | 'normal' | 'low';  // AI-assigned
  accountId: string;             // links to credential
  indexedAt: string;             // when we indexed it
}

// SQLite table for calendar events
interface IndexedCalendarEvent {
  id: string;
  uid: string;                   // iCalendar UID
  calendarId: string;
  title: string;
  description: string;
  startTime: string;             // ISO 8601
  endTime: string;
  isAllDay: boolean;
  location: string;
  attendees: string[];           // email addresses
  organizer: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrenceRule: string | null; // RRULE string
  accountId: string;
  indexedAt: string;
}
```

### A5. Important Implementation Notes

- **Email bodies are NOT stored in full.** Only the first 500 chars for embedding and a 200-char snippet for display. The full body is fetched on demand via Gateway when needed. This keeps the local index lean.
- **Attachments are metadata-only.** Store filename, MIME type, and size. Attachment content is NOT fetched or indexed in this step (that's a future feature).
- **Thread reconstruction:** Use `In-Reply-To` and `References` headers to build thread trees. The Step 5B hardening confirmed these headers handle edge cases (malformed threading, missing References). Use the adapter's existing parsing.
- **All-day events:** The Step 5B hardening fixed the all-day event parsing edge case. The CalDAV adapter now returns `isAllDay: true` with correct date boundaries (midnight-to-midnight local time). Use this flag in the indexed schema.

---

## B. Orchestrator Tool Extensions

**Location:** `packages/core/agent/tools.ts` (extend existing), `packages/core/agent/orchestrator.ts` (extend existing)

The Orchestrator currently has tools for `search_files`. Add tools for email and calendar operations.

### B1. New Tool Definitions

```typescript
// Add to existing tools array
const emailCalendarTools: ToolDefinition[] = [
  {
    name: 'fetch_inbox',
    description: 'Fetch recent emails from the user\'s inbox. Returns a summary of unread and recent messages with sender, subject, date, and AI-assigned priority.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max messages to return (default 20)' },
        unreadOnly: { type: 'boolean', description: 'Only return unread messages (default false)' },
        folder: { type: 'string', description: 'IMAP folder (default INBOX)' }
      }
    }
  },
  {
    name: 'search_emails',
    description: 'Search the user\'s indexed emails by keyword, sender, date range, or semantic meaning.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (natural language or keyword)' },
        from: { type: 'string', description: 'Filter by sender email or name' },
        dateAfter: { type: 'string', description: 'ISO date — only emails after this date' },
        dateBefore: { type: 'string', description: 'ISO date — only emails before this date' }
      },
      required: ['query']
    }
  },
  {
    name: 'send_email',
    description: 'Send an email on behalf of the user. In Guardian mode, this shows a preview and waits for approval. In Partner mode, routine responses are sent automatically; novel emails require approval. In Alter Ego mode, all emails are sent automatically.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Email body (plain text)' },
        replyToMessageId: { type: 'string', description: 'Message-ID to reply to (for threading)' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'draft_email',
    description: 'Save an email draft without sending. Always available regardless of autonomy tier.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' } },
        cc: { type: 'array', items: { type: 'string' } },
        subject: { type: 'string' },
        body: { type: 'string' },
        replyToMessageId: { type: 'string' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'archive_email',
    description: 'Archive one or more emails (move from INBOX to Archive/All Mail). In Partner mode, archiving routine emails is automatic.',
    parameters: {
      type: 'object',
      properties: {
        messageIds: { type: 'array', items: { type: 'string' }, description: 'Message IDs to archive' }
      },
      required: ['messageIds']
    }
  },
  {
    name: 'categorize_email',
    description: 'Apply AI-determined categories and priority to emails. Always automatic — categorization is informational, not an action.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Category labels' },
        priority: { type: 'string', enum: ['high', 'normal', 'low'] }
      },
      required: ['messageId', 'categories', 'priority']
    }
  },
  {
    name: 'fetch_calendar',
    description: 'Fetch upcoming calendar events.',
    parameters: {
      type: 'object',
      properties: {
        daysAhead: { type: 'number', description: 'Number of days ahead to fetch (default 7)' },
        includeAllDay: { type: 'boolean', description: 'Include all-day events (default true)' }
      }
    }
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event. In Guardian mode, shows preview and waits. In Partner mode, routine scheduling is automatic. In Alter Ego mode, all scheduling is automatic.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startTime: { type: 'string', description: 'ISO 8601 start time' },
        endTime: { type: 'string', description: 'ISO 8601 end time' },
        description: { type: 'string' },
        location: { type: 'string' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' }
      },
      required: ['title', 'startTime', 'endTime']
    }
  },
  {
    name: 'detect_calendar_conflicts',
    description: 'Check for scheduling conflicts with existing events. Returns conflicting events if any.',
    parameters: {
      type: 'object',
      properties: {
        startTime: { type: 'string' },
        endTime: { type: 'string' }
      },
      required: ['startTime', 'endTime']
    }
  }
];
```

### B2. Tool Execution with Autonomy Checks

When the Orchestrator receives a tool call from the LLM, it must:

1. **Determine the action's autonomy classification:**

```typescript
interface ActionClassification {
  actionType: ActionType;           // maps to IPC action type
  isRoutine: boolean;               // has the user approved similar actions before?
  isReversible: boolean;            // can this be undone?
  stakeLevel: 'low' | 'medium' | 'high';  // consequence severity
  estimatedTimeSavedSeconds: number;       // for the weekly digest
}

// Classification logic:
// - fetch_inbox, search_emails, fetch_calendar, detect_calendar_conflicts → always execute (read-only)
// - categorize_email → always execute (informational, local-only)
// - archive_email → low stakes, reversible → routine in Partner+
// - draft_email → always execute (saves draft, doesn't send)
// - send_email replying to routine message → medium stakes, approval pattern check
// - send_email new thread → higher stakes, requires approval in Partner
// - create_calendar_event → medium stakes, check for conflicts first
```

2. **Check the user's autonomy tier for this domain:**

```typescript
const emailTier = await getAutonomyTier('email');  // Guardian | Partner | AlterEgo
const calendarTier = await getAutonomyTier('calendar');

function shouldAutoExecute(
  classification: ActionClassification,
  tier: AutonomyTier
): boolean {
  if (tier === 'Guardian') return classification.actionType.startsWith('email.fetch') || 
                                    classification.actionType.startsWith('calendar.fetch') ||
                                    classification.actionType === 'categorize_email';
  if (tier === 'Partner') return classification.isRoutine || classification.stakeLevel === 'low';
  if (tier === 'AlterEgo') return classification.stakeLevel !== 'high';
  return false;
}
```

3. **Execute or queue for approval:**

If auto-execute: send the action to Gateway via IPC, log to audit trail with `estimatedTimeSavedSeconds`, return result to LLM for follow-up response.

If requires approval: create a `PendingAction` entry, notify the user in the UI, wait for approval/rejection.

### B3. Approval Pattern Tracking

Track the user's approval history to refine what counts as "routine":

```typescript
interface ApprovalPattern {
  actionType: string;              // e.g., 'email.send'
  subType: string;                 // e.g., 'reply_to_routine'
  consecutiveApprovals: number;    // how many in a row the user approved
  lastApprovalAt: string;
  autoExecuteThreshold: number;    // default 3 — after 3 approvals, this becomes routine
}
```

Store in SQLite. After `autoExecuteThreshold` consecutive approvals of the same action subtype, that subtype becomes "routine" for autonomy checks. This is the data foundation for Step 7's autonomy escalation prompts.

---

## C. Proactive Context Engine

**Location:** `packages/core/agent/proactive-engine.ts` (new file)

The Proactive Context Engine runs background analysis and surfaces actionable intelligence. It does NOT require the user to ask — it monitors and acts.

### C1. Meeting Prep

When the engine detects an upcoming meeting (within next 24 hours):

1. Identify attendees from the calendar event
2. Search indexed emails for recent correspondence with each attendee
3. Search knowledge graph for documents mentioning the attendees or the meeting topic
4. Construct a meeting prep brief:

```typescript
interface MeetingPrepBrief {
  eventId: string;
  eventTitle: string;
  startTime: string;
  attendees: AttendeeContext[];
  relevantEmails: EmailSummary[];      // recent emails with attendees
  relevantDocuments: DocumentRef[];     // files mentioning attendees or topic
  suggestedAgenda: string[];           // AI-generated from context
  openItems: string[];                 // unanswered emails, pending requests
}

interface AttendeeContext {
  email: string;
  name: string;
  lastEmailDate: string | null;
  emailCount30Days: number;           // how many emails exchanged in past 30 days
  relationship: 'frequent' | 'occasional' | 'rare' | 'unknown';
}
```

5. In Partner/Alter Ego mode: surface the brief proactively (push to Universal Inbox as a high-priority card 1 hour before the meeting)
6. In Guardian mode: make the brief available but don't push it

### C2. Follow-Up Tracking

Track emails that appear to need a response:

1. After email indexing, identify messages where:
   - The user is in the `to` field (not just CC)
   - The message contains a question (heuristic: ends with `?`, contains "can you", "could you", "please", "let me know")
   - The user has not replied (no outbound message with matching `In-Reply-To`)
   - The message is more than 24 hours old
2. Surface these as "Follow-up needed" items in the Universal Inbox
3. In Partner/Alter Ego: draft a follow-up response after configurable delay (default 48 hours without response)

### C3. Deadline Detection

Scan indexed emails for time-sensitive content:

1. Look for patterns: "by Friday", "due on March 1", "deadline is", "EOD", "ASAP", "urgent"
2. Parse dates from these patterns using `date-fns`
3. Create internal deadline entries linked to the source email
4. Surface approaching deadlines in the Universal Inbox (24 hours before deadline)

### C4. Engine Execution Model

The proactive engine runs as a periodic background task:

```typescript
// Runs every 15 minutes (configurable)
async function runProactiveEngine(): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];
  
  // 1. Check upcoming meetings (next 24h) and generate prep briefs
  insights.push(...await generateMeetingPreps());
  
  // 2. Check for emails needing follow-up
  insights.push(...await checkFollowUps());
  
  // 3. Check for approaching deadlines
  insights.push(...await checkDeadlines());
  
  // 4. Log all insights to action trail
  for (const insight of insights) {
    await logInsight(insight);
  }
  
  // 5. Push to Universal Inbox
  await pushToInbox(insights);
  
  return insights;
}
```

Each insight has a `ProactiveInsight` shape:

```typescript
interface ProactiveInsight {
  id: string;
  type: 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict';
  priority: 'high' | 'normal' | 'low';
  title: string;                      // "Meeting prep: Sarah Chen 1:1"
  summary: string;                    // "3 recent emails, 1 unanswered question"
  sourceIds: string[];                // linked email/event IDs
  suggestedAction: SuggestedAction | null;  // what the AI would do
  createdAt: string;
  expiresAt: string | null;           // some insights expire (meeting prep after the meeting)
  estimatedTimeSavedSeconds: number;
}

interface SuggestedAction {
  actionType: string;                 // 'send_email', 'create_event', etc.
  payload: Record<string, unknown>;   // the action payload ready to execute
  description: string;                // "Draft a follow-up to Sarah's unanswered question"
}
```

---

## D. Universal Inbox UI

**Location:** `packages/desktop/src/pages/inbox/` (new directory)

The Universal Inbox replaces the placeholder "Inbox" page. It is the primary screen most users see when they open Semblance.

### D1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Sidebar - existing]  │  Universal Inbox                   │
│                        │                                     │
│  💬 Chat               │  ┌─── Priority Section ──────────┐ │
│  📥 Inbox  ← active    │  │ ⚡ Meeting prep: Sarah 1:1    │ │
│  📅 Calendar           │  │    in 2 hours · 3 emails      │ │
│  📁 Files              │  │                                │ │
│  ⚙️ Settings           │  │ 🔴 Follow up: Contract Q      │ │
│                        │  │    2 days · awaiting response  │ │
│                        │  └────────────────────────────────┘ │
│                        │                                     │
│                        │  ┌─── Email ─────────────────────┐ │
│                        │  │ Amy Park · Q1 Budget Review    │ │
│                        │  │   3h ago · high priority       │ │
│                        │  │   [Reply] [Archive] [Snooze]   │ │
│                        │  │                                │ │
│                        │  │ Jira · PROJ-1234 assigned      │ │
│                        │  │   5h ago · normal · automated  │ │
│                        │  │   [Archive] [View]             │ │
│                        │  │                                │ │
│                        │  │ Newsletter · TechCrunch Daily  │ │
│                        │  │   8h ago · low priority        │ │
│                        │  │   ✅ Archived by Semblance     │ │
│                        │  └────────────────────────────────┘ │
│                        │                                     │
│                        │  ┌─── Calendar Today ────────────┐ │
│                        │  │ 10:00 AM  Team standup         │ │
│                        │  │  2:00 PM  Sarah Chen 1:1       │ │
│                        │  │  4:30 PM  ⚠️ Conflicts with   │ │
│                        │  │           Design review        │ │
│                        │  └────────────────────────────────┘ │
│                        │                                     │
│                        │  ┌─── Actions Taken ─────────────┐ │
│                        │  │ Today: 4 actions · ~12 min    │ │
│                        │  │ saved                          │ │
│                        │  │ • Archived 2 newsletters       │ │
│                        │  │ • Categorized 8 emails         │ │
│                        │  │ • Prepared meeting brief       │ │
│                        │  │ [View all actions →]           │ │
│                        │  └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### D2. Inbox Sections

The inbox is divided into sections, not tabs:

1. **Priority / Proactive** (top) — Proactive insights from the context engine. Meeting preps, follow-up reminders, deadline alerts, conflict warnings. These are the "holy shit" moments. Each card has a suggested action with one-click execution.

2. **Email** — Recent emails sorted by AI-assigned priority (high → normal → low). Each email card shows: sender, subject, time, priority badge, AI category label, and quick-action buttons. Emails the AI has already acted on show the action taken (e.g., "✅ Archived by [name]").

3. **Calendar Today** — Today's events in timeline order. Conflicts highlighted with Alert Coral. Clicking an event expands to show the meeting prep brief (if one exists).

4. **Actions Taken** — Summary of autonomous actions since last visit. Shows count, time saved, and a preview list. Links to the full action log.

### D3. Email Card Component

```typescript
interface EmailCardProps {
  email: IndexedEmail;
  aiCategory: string[];           // e.g., ['routine', 'meeting-confirmation']
  aiPriority: 'high' | 'normal' | 'low';
  actionTaken: ActionTaken | null; // if the AI already acted on this
  onReply: () => void;            // opens reply composer
  onArchive: () => void;          // archives (with undo toast)
  onSnooze: () => void;           // snooze for later
  onExpand: () => void;           // show full email body
}

interface ActionTaken {
  type: 'archived' | 'categorized' | 'replied' | 'drafted';
  timestamp: string;
  undoAvailable: boolean;
  description: string;            // "Archived — appeared to be a newsletter"
}
```

**Design system compliance:**
- Use `--color-surface-1` for card backgrounds
- Priority indicators: high = `--color-attention` dot, normal = `--color-primary` dot, low = `--color-muted` dot
- AI action badges use `--color-success-subtle` background with `--color-success` text
- Quick-action buttons use ghost button style from semblance-ui
- Sender name in `--color-text-primary`, subject in `--color-text-primary`, metadata in `--color-text-secondary`
- Cards have `--spacing-3` padding, `--radius-md` corners, `--shadow-sm` elevation

### D4. Proactive Insight Card Component

```typescript
interface InsightCardProps {
  insight: ProactiveInsight;
  onExecuteSuggestion: () => void;  // one-click to execute the suggested action
  onDismiss: () => void;
  onExpand: () => void;
}
```

Meeting prep cards expand to show:
- Attendee list with relationship context ("frequent contact — 12 emails this month")
- Recent email threads with each attendee (clickable, opens in email detail)
- Related documents (clickable, opens in file viewer)
- Suggested talking points / open items

### D5. Email Reply Composer

A lightweight reply composer that opens inline (below the email card) or as a modal:

- Pre-fills `to`, `subject` (with Re: prefix), `replyToMessageId`
- If in Partner/Alter Ego mode and the AI has drafted a response, show the draft pre-filled with an edit affordance
- "Send" button respects autonomy tier — in Guardian mode, shows confirmation dialog
- "Save Draft" always available
- Composer uses a plain textarea (not rich text) — email bodies are plain text for now

### D6. Undo System

Every autonomous action in the inbox must support undo:

- When the AI archives an email, show an undo toast (8-second window)
- When the AI sends a routine reply (Partner/Alter Ego), the sent email appears in "Actions Taken" with a 30-second undo window (move to Drafts, delete from Sent)
- Undo uses `--color-accent` for the undo button, `--color-surface-2` for the toast background
- After the undo window expires, the action is finalized and logged as complete in the audit trail

---

## E. Sidecar Bridge Extensions

**Location:** `packages/desktop/src-tauri/sidecar/bridge.ts` (extend existing)

Add new sidecar commands for inbox and proactive engine operations:

```typescript
// Email indexing
'email:startIndex'        → EmailIndexer.startInitialIndex(accountId)
'email:getIndexStatus'    → EmailIndexer.getStatus()
'email:syncNew'           → EmailIndexer.syncNewMessages(accountId)

// Calendar indexing
'calendar:startIndex'     → CalendarIndexer.startInitialIndex(accountId)
'calendar:syncNew'        → CalendarIndexer.syncNewEvents(accountId)

// Universal Inbox data
'inbox:getItems'          → InboxAggregator.getItems({ limit, offset, filter })
'inbox:getProactiveInsights' → ProactiveEngine.getActiveInsights()

// AI email actions (these go through the Orchestrator)
'email:categorize'        → Orchestrator.categorizeEmail(messageId)
'email:categorizeBatch'   → Orchestrator.categorizeEmails(messageIds[])
'email:draftReply'        → Orchestrator.draftReply(messageId, context)
'email:archive'           → Gateway.execute('email.archive', { messageIds })

// AI calendar actions
'calendar:detectConflicts' → Orchestrator.detectConflicts(startTime, endTime)
'calendar:getMeetingPrep'  → ProactiveEngine.getMeetingPrep(eventId)

// Proactive engine
'proactive:run'           → ProactiveEngine.run()
'proactive:getInsights'   → ProactiveEngine.getActiveInsights()

// Action management
'action:undo'             → ActionLog.undoAction(actionId)
'action:approve'          → Orchestrator.approveAction(actionId)
'action:reject'           → Orchestrator.rejectAction(actionId)
'action:getPending'       → Orchestrator.getPendingActions()
```

**New Tauri commands in `lib.rs`:**

```rust
#[tauri::command]
async fn start_email_index(account_id: String) -> Result<(), String>

#[tauri::command]
async fn get_inbox_items(limit: u32, offset: u32, filter: Option<String>) -> Result<Vec<InboxItem>, String>

#[tauri::command]
async fn get_proactive_insights() -> Result<Vec<ProactiveInsight>, String>

#[tauri::command]
async fn categorize_emails(message_ids: Vec<String>) -> Result<Vec<EmailCategory>, String>

#[tauri::command]
async fn draft_reply(message_id: String) -> Result<DraftedEmail, String>

#[tauri::command]
async fn archive_emails(message_ids: Vec<String>) -> Result<(), String>

#[tauri::command]
async fn detect_calendar_conflicts(start: String, end: String) -> Result<Vec<Conflict>, String>

#[tauri::command]
async fn get_meeting_prep(event_id: String) -> Result<MeetingPrepBrief, String>

#[tauri::command]
async fn undo_action(action_id: String) -> Result<(), String>

#[tauri::command]
async fn approve_action(action_id: String) -> Result<ActionResponse, String>

#[tauri::command]
async fn reject_action(action_id: String) -> Result<(), String>

#[tauri::command]
async fn get_pending_actions() -> Result<Vec<PendingAction>, String>

#[tauri::command]
async fn run_proactive_engine() -> Result<Vec<ProactiveInsight>, String>
```

---

## F. IPC Protocol Extensions

**Location:** `packages/core/types/` and `packages/gateway/ipc/`

Add new action types to the IPC protocol:

```typescript
// New ActionTypes (add to the existing discriminated union)
type ActionType =
  | 'email.fetch'          // existing
  | 'email.send'           // existing
  | 'email.draft'          // existing
  | 'email.archive'        // NEW — move messages to Archive folder
  | 'email.move'           // NEW — move messages between folders
  | 'email.markRead'       // NEW — mark messages as read
  | 'calendar.fetch'       // existing
  | 'calendar.create'      // existing
  | 'calendar.update'      // existing
  | 'calendar.delete'      // NEW — delete/cancel event
  // ... existing types unchanged

// New payloads
interface EmailArchivePayload {
  accountId: string;
  messageIds: string[];      // IMAP UIDs
  targetFolder: string;      // default: '[Gmail]/All Mail' or 'Archive'
}

interface EmailMovePayload {
  accountId: string;
  messageIds: string[];
  fromFolder: string;
  toFolder: string;
}

interface EmailMarkReadPayload {
  accountId: string;
  messageIds: string[];
  read: boolean;
}
```

**Gateway adapter extensions:**

The IMAP adapter needs new methods to support these operations:
- `moveMessages(messageIds, fromFolder, toFolder)` — IMAP MOVE or COPY+DELETE
- `markAsRead(messageIds, read)` — IMAP STORE +FLAGS \Seen
- `archiveMessages(messageIds)` — move to Archive folder (provider-specific folder name)

The SMTP adapter and CalDAV adapter from Step 5 should already handle `email.send`, `email.draft`, `calendar.create`, `calendar.update`. If any methods are missing, add them.

---

## G. Email Categorization AI

**Location:** `packages/core/agent/email-categorizer.ts` (new file)

The email categorizer uses the local LLM to classify emails. This runs as part of the indexing pipeline (categorize each email after indexing).

### G1. Category Taxonomy

```typescript
const EMAIL_CATEGORIES = [
  'actionable',          // requires the user to do something
  'informational',       // FYI, no action needed
  'routine',             // meeting confirmations, receipts, shipping
  'newsletter',          // subscribed content
  'automated',           // Jira, GitHub, CI, system notifications
  'personal',            // from known personal contacts
  'commercial',          // promotions, marketing
  'urgent',              // time-sensitive, flagged
] as const;
```

### G2. Categorization Prompt

```typescript
function buildCategorizationPrompt(email: IndexedEmail): string {
  return `Categorize this email. Respond with a JSON object containing "categories" (array of applicable categories) and "priority" (high/normal/low).

Categories: actionable, informational, routine, newsletter, automated, personal, commercial, urgent

Email:
From: ${email.fromName} <${email.from}>
Subject: ${email.subject}
Date: ${email.receivedAt}
Snippet: ${email.snippet}

Respond ONLY with JSON: {"categories": [...], "priority": "..."}`;
}
```

### G3. Batch Processing

Categorize emails in batches to minimize LLM round-trips:
- Group up to 5 emails per LLM call
- Use structured output parsing (JSON mode if the model supports it)
- Fall back to individual categorization if batch parsing fails
- Cache categorization results — don't re-categorize already-categorized emails
- If LLM is unavailable (Ollama not running), skip categorization and mark emails as `priority: 'normal'` with no categories

### G4. Time-Saved Estimation

Each action type has an estimated time-saved value:

```typescript
const TIME_SAVED_ESTIMATES: Record<string, number> = {
  'categorize_email': 5,           // 5 seconds saved per email categorized
  'archive_email': 10,             // 10 seconds saved per email archived
  'draft_reply': 120,              // 2 minutes saved per draft
  'send_routine_reply': 180,       // 3 minutes saved per routine reply sent
  'meeting_prep': 600,             // 10 minutes saved per meeting brief
  'follow_up_reminder': 30,        // 30 seconds saved per reminder
  'conflict_detection': 120,       // 2 minutes saved per conflict found
  'create_event': 60,              // 1 minute saved per event created
};
```

These are conservative estimates. They are logged with every action in the audit trail for the weekly digest (Step 7).

---

## H. Pending Action Queue UI

**Location:** `packages/desktop/src/components/PendingActionBanner.tsx` (new component)

When the Orchestrator queues an action for approval (Guardian mode, or novel action in Partner mode), the user must see it and act on it.

### H1. Approval Banner

A non-blocking banner that appears at the top of whatever screen the user is on:

```
┌────────────────────────────────────────────────────┐
│ 📧 [Name] wants to send a reply to Amy Park       │
│ Subject: Re: Q1 Budget Review                      │
│                                                     │
│ "Hi Amy, thanks for sending the budget review.     │
│  I'll have feedback by Friday. — [User]"           │
│                                                     │
│ [Approve & Send]  [Edit]  [Reject]                 │
│                                                     │
│ Similar actions approved: 0 times                   │
│ After 3 approvals, this becomes automatic          │
└────────────────────────────────────────────────────┘
```

### H2. Design

- Background: `--color-primary-subtle` (light) / `--color-primary-subtle-dark` (dark)
- Border-left: 3px `--color-primary`
- "Approve & Send" button: primary button style
- "Edit" opens the reply composer with the draft pre-filled
- "Reject" dismisses with a brief feedback option ("Why? Too aggressive / Wrong recipient / Not now")
- "Similar actions approved: N times" shows the approval pattern count — this transparency builds trust and explains why actions will eventually become automatic
- If multiple pending actions, stack them vertically with a "N pending actions" badge on the inbox icon

---

## Testing Requirements

### New Test Suites

| Test Suite | Location | What It Validates |
|------------|----------|-------------------|
| **Email indexer** | `tests/core/email-indexer.test.ts` | Initial index processes messages correctly. Incremental sync only fetches new messages. Entity extraction works. Embeddings are generated. SQLite schema is correct. Progress events are emitted. |
| **Calendar indexer** | `tests/core/calendar-indexer.test.ts` | Events are indexed with correct schema. All-day events handled correctly (regression from 5B fix). Recurring events expanded properly. Incremental sync works. |
| **Orchestrator email tools** | `tests/core/orchestrator-email.test.ts` | Tool calls route to correct IPC actions. Autonomy tier checks work for all three tiers × all action types. Approval queueing works. Approval pattern tracking works. |
| **Orchestrator calendar tools** | `tests/core/orchestrator-calendar.test.ts` | Calendar tool calls work. Conflict detection works. Event creation respects autonomy. |
| **Email categorizer** | `tests/core/email-categorizer.test.ts` | Categories assigned correctly for representative emails. Batch processing works. LLM unavailable fallback works. Cache prevents re-categorization. |
| **Proactive engine** | `tests/core/proactive-engine.test.ts` | Meeting prep generated for upcoming meetings. Follow-up tracking detects unanswered questions. Deadline detection parses date patterns. Engine respects autonomy tier for surfacing vs pushing. |
| **IPC protocol extensions** | `tests/gateway/ipc-email-actions.test.ts` | New action types (archive, move, markRead) validate correctly. Gateway routes to adapter methods. Audit trail entries created for all actions. |
| **IMAP adapter extensions** | `tests/gateway/imap-adapter-actions.test.ts` | Archive moves to correct folder. Mark as read/unread works. Folder listing works. Provider-specific folder names handled (Gmail vs generic IMAP). |
| **Universal Inbox UI** | `tests/desktop/inbox.test.tsx` | Inbox renders sections correctly. Email cards show correct data. Priority sorting works. Action buttons trigger correct handlers. Proactive insight cards render. Undo toast appears and functions. |
| **Pending action banner** | `tests/desktop/pending-action.test.tsx` | Banner renders for pending actions. Approve/reject/edit buttons work. Approval count displays correctly. Multiple pending actions stack. |
| **Privacy audit** | existing `scripts/privacy-audit/` | No regressions. Core still has zero network imports. All new IPC actions are schema-validated. |

### Existing Test Baseline

- All 723 existing tests must continue to pass
- Privacy audit must pass (exit 0)
- No regressions in adapter tests from Step 5B

### Test Target

Expect approximately 100–150 new tests across these suites. The total should reach approximately 850–900 tests passing.

---

## What This Step Does NOT Include

Do not build these. They are explicitly out of scope for Step 6.

| Feature | Ships In | Why Not Now |
|---------|----------|-------------|
| Subscription detection | Step 7 | Requires financial data import (CSV/OFX) |
| Autonomy escalation prompts | Step 7 | Step 6 builds the tracking data; Step 7 builds the UX |
| Full Knowledge Moment (onboarding) | Step 7 | Requires email + calendar + proactive all working together |
| Weekly digest | Step 7 | Requires accumulated action data from Step 6 |
| Network Monitor | Step 8 | Privacy Dashboard exists, real-time monitor is polish |
| Task routing (mobile ↔ desktop) | Step 8 | Mobile integration follows desktop completion |
| Rich text email composer | Future | Plain text is sufficient for Sprint 2 |
| Email attachment viewing/downloading | Future | Metadata only in Step 6 |
| OAuth 2.0 for Gmail/Outlook | Sprint 3+ | App Passwords are the Sprint 2 approach |
| Communication style learning | Sprint 3 | Needed for Alter Ego quality, not for Partner mode |
| IMAP IDLE (push notifications) | Step 8 | Polling is sufficient; push is polish |

---

## Escalation Triggers

Stop and escalate to Orbital Directors if:

- The Orchestrator's tool-calling integration requires changes to the LLM provider interface beyond what's already there
- You need to modify the existing IPC protocol schema in a breaking way (adding new types is fine; changing existing types requires escalation)
- The email categorization LLM calls require a different model or model configuration than what's currently used for chat
- The proactive engine's background execution model conflicts with the existing sidecar bridge architecture
- The Universal Inbox layout requires design system components that don't exist and aren't covered by the design system doc
- You discover that the email/calendar adapters from Step 5 are missing methods you need and the additions would be significant (small additions are fine — document as autonomous decisions)
- Any action could send email or modify calendar events without going through the autonomy check

---

## Autonomous Decision Authority

You may proceed without escalating for:

- Email categorization taxonomy refinements (add/remove/rename categories)
- Time-saved estimate values (use reasonable defaults, they can be tuned later)
- Proactive engine polling intervals and thresholds
- Follow-up detection heuristics
- Deadline detection date parsing patterns
- Inbox UI layout details within the design system
- SQLite schema details for indexed emails/events
- Batch sizes for email categorization
- LLM prompt wording for categorization
- Email card and insight card component details
- Undo window durations
- How many emails to show per section in the inbox

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

1. **IPC protocol extensions** — Add new action types, payloads, Zod schemas. Verify existing tests still pass. Small change, validates the extension pattern.
2. **IMAP adapter extensions** — Add `archiveMessages`, `moveMessages`, `markAsRead` methods. Test against mock IMAP server. This extends Step 5 work.
3. **Email indexer** — Build the indexing pipeline. This is the data foundation everything else depends on. Test with mock email data.
4. **Calendar indexer** — Same pattern as email indexer. Ensure all-day event regression test passes.
5. **Email categorizer** — Build the LLM-based categorization. Test with representative email fixtures.
6. **Orchestrator tool extensions** — Add email/calendar tools to the Orchestrator. Wire autonomy checks. This is the brain.
7. **Approval pattern tracking** — SQLite schema and logic. Foundation for Step 7 escalation.
8. **Proactive context engine** — Meeting prep, follow-ups, deadlines. Depends on indexed emails and calendar.
9. **Universal Inbox UI** — Build the inbox page with all sections. Wire to sidecar bridge commands.
10. **Pending action banner** — Approval UX. Wire approve/reject/edit flows.
11. **Sidecar bridge wiring** — Connect all new Tauri commands to the new modules.
12. **Integration tests** — End-to-end: email arrives → indexed → categorized → appears in inbox → user interacts → action logged.
13. **Privacy audit** — Run the full audit. Fix any violations. Exit 0 required.

---

## Exit Criteria

This step is complete when ALL of the following are true:

1. ☐ Email indexing pipeline operational — connects to configured IMAP account, fetches messages, indexes to knowledge graph + SQLite
2. ☐ Calendar indexing operational — fetches events, indexes with correct all-day event handling
3. ☐ Incremental sync working — only fetches new messages/events, runs on configurable poll interval
4. ☐ Email categorization operational — LLM assigns categories and priority to each email
5. ☐ Orchestrator has email tools — fetch_inbox, search_emails, send_email, draft_email, archive_email, categorize_email
6. ☐ Orchestrator has calendar tools — fetch_calendar, create_calendar_event, detect_calendar_conflicts
7. ☐ Autonomy tier checks enforced — Guardian shows and waits, Partner auto-executes routine + queues novel, Alter Ego auto-executes all non-high-stakes
8. ☐ Approval pattern tracking — consecutive approvals counted, stored in SQLite
9. ☐ Proactive context engine running — meeting prep, follow-up tracking, deadline detection
10. ☐ Universal Inbox renders — priority section, email section, calendar section, actions-taken section all populated with real data
11. ☐ Email cards display correctly — sender, subject, time, priority, category, quick-action buttons
12. ☐ Proactive insight cards render — meeting prep expandable, follow-up items actionable
13. ☐ Pending action banner works — shows when approval needed, approve/edit/reject functional
14. ☐ Undo system works — autonomous actions show undo toast, undo reverses the action
15. ☐ `estimatedTimeSavedSeconds` logged on every action — data accumulating for Step 7 digest
16. ☐ All ~850+ tests passing (723 existing + ~100-150 new)
17. ☐ Privacy audit passes (exit 0) — no network imports in Core, all IPC actions schema-validated
18. ☐ A human can connect email, see their inbox populated and categorized, receive a meeting prep brief, and have Semblance archive a newsletter — all without leaving the app

---

## Remember

This is where Semblance stops being a chatbot and starts being an agent. Every action the Orchestrator takes is either building trust or breaking it. The approval patterns, the undo system, the transparent "Actions Taken" section — these aren't polish. They're the trust infrastructure that makes autonomous action psychologically safe.

The product is judged by actions taken and time saved. After this step, Semblance takes actions. Make them count.
