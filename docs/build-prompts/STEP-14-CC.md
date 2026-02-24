# Step 14 — Native Contacts + Relationship Intelligence

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Sprint 3 COMPLETE. 2,739 tests passing across 151 files. TypeScript clean across all packages. Sprint 4 begins now — "Becomes Part of You." Semblance becomes the intelligence layer of the user's device. This step adds the first native device capability: reading the user's contacts and building a relationship graph that makes every subsequent feature smarter.
**Test Baseline:** 2,739 tests, 0 failures, `npx tsc --noEmit` clean.
**Sprint 4 canonical reference:** SEMBLANCE_BUILD_MAP_ELEVATION.md (Steps 14–33)
**Architecture rules:** CLAUDE.md — especially Rule 1 (zero network in Core), Rule 5 (local only data)

---

## Read First

Before writing any code, read these files:
- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules
- `/docs/DESIGN_SYSTEM.md` — Trellis design system, all UI must conform
- `packages/core/platform/types.ts` — PlatformAdapter interface (you will extend this)
- `packages/core/knowledge/` — Knowledge graph structure, entity types, indexing patterns
- `packages/core/agent/proactive-engine.ts` — Where contact insights will surface
- `packages/core/agent/orchestrator.ts` — Where contact resolution happens for agent actions

---

## Why This Step Matters

Native contacts are the first capability that cloud AI physically cannot access. When Semblance knows your contacts — their names, birthdays, organizations, communication patterns — every other feature gets smarter:

- Email triage knows Sarah Chen is your manager, not a stranger
- Meeting prep surfaces relationship context for each attendee
- The orchestrator resolves "text Sarah" to the right person
- Proactive insights detect "you haven't talked to David in 3 weeks — you usually email weekly"
- Birthday reminders appear automatically
- The Knowledge Moment becomes more powerful (compound knowledge across email + calendar + contacts)

This is the unconquerable moat. ChatGPT doesn't know who Sarah is. Semblance does.

---

## Scope Overview

| Section | Description | Tests |
|---------|-------------|-------|
| A | ContactsAdapter on PlatformAdapter | 8+ |
| B | Contact entity model + knowledge graph integration | 12+ |
| C | Relationship graph (communication patterns + inference) | 15+ |
| D | Proactive insights (birthday reminders, contact frequency) | 10+ |
| E | Relationship intelligence UI (desktop + mobile) | 10+ |
| F | Contact resolution for agent actions | 8+ |

**Minimum 60 new tests. Target: 70+.**

---

## Section A: ContactsAdapter on PlatformAdapter

### A1: ContactsAdapter Interface

Add to `packages/core/platform/types.ts`:

```typescript
interface ContactsAdapter {
  // Check if contacts permission has been granted
  hasPermission(): Promise<boolean>;

  // Request permission to access contacts (returns true if granted)
  requestPermission(): Promise<boolean>;

  // Fetch all contacts from the device
  getAllContacts(): Promise<DeviceContact[]>;

  // Watch for contact changes (returns unsubscribe function)
  onContactsChanged(callback: () => void): () => void;
}

interface DeviceContact {
  id: string;                      // Platform-specific contact ID
  givenName: string;
  familyName: string;
  displayName: string;             // Full formatted name
  emails: ContactField[];
  phones: ContactField[];
  organization?: string;
  jobTitle?: string;
  birthday?: string;               // ISO date (YYYY-MM-DD) or MM-DD if no year
  addresses?: ContactAddress[];
  notes?: string;
  imageAvailable: boolean;         // Whether a photo exists (don't fetch the image data itself)
  lastModified?: string;           // ISO datetime
}

interface ContactField {
  value: string;
  label?: string;                  // 'home', 'work', 'mobile', etc.
}

interface ContactAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  label?: string;
}
```

Add `contacts?: ContactsAdapter` to the `PlatformAdapter` interface. Optional to avoid breaking existing adapter creation.

### A2: Desktop Adapter (macOS — Tauri)

```typescript
// packages/core/platform/desktop-contacts.ts
// Tauri plugin for macOS CNContactStore access
// Uses @tauri-apps/plugin-contacts or custom Rust command

// On macOS: CNContactStore.requestAccess(for: .contacts)
// On Windows: Windows.ApplicationModel.Contacts.ContactStore (UWP)
// On Linux: folks / EDS (GNOME) — lower priority, can return empty gracefully

// For Windows development: returns mock data in dev mode, empty in production
// Same pattern as native inference — structurally complete, platform-dependent at runtime
```

### A3: Mobile Adapter (React Native)

```typescript
// packages/mobile/src/native/contacts-bridge.ts
// Uses react-native-contacts (well-maintained, 3.3k stars)
// iOS: CNContactStore
// Android: ContactsContract ContentProvider

// Permission flow:
// 1. Check Contacts.checkPermission()
// 2. If not granted, Contacts.requestPermission()
// 3. If denied, return empty array + hasPermission() returns false
// 4. UI shows "Grant contacts access to unlock relationship intelligence"
```

**Approved dependency:** `react-native-contacts` — well-maintained, widely used, zero network access, pure local data. Justification: provides cross-platform contacts API for React Native that wraps CNContactStore (iOS) and ContactsContract (Android).

### A4: Tests (8+)

- ContactsAdapter interface compliance (desktop mock)
- ContactsAdapter interface compliance (mobile mock)
- Permission denied → returns empty array, hasPermission() false
- Permission granted → returns contacts
- DeviceContact has all required fields populated
- Contact change listener fires on change
- Contact change listener unsubscribe works
- Empty contacts list returns [] (not error)

---

## Section B: Contact Entity Model + Knowledge Graph Integration

### B1: Contact Entity Schema

```typescript
// packages/core/knowledge/entities/contact-entity.ts

interface ContactEntity {
  id: string;                      // Semblance internal ID (nanoid)
  deviceContactId?: string;        // Link to platform contact
  displayName: string;
  givenName?: string;
  familyName?: string;
  emails: string[];                // Deduplicated, lowercase
  phones: string[];                // Normalized format
  organization?: string;
  jobTitle?: string;
  birthday?: string;               // ISO date or MM-DD
  addresses?: ContactAddress[];

  // Relationship intelligence (computed)
  relationshipType?: RelationshipType;  // Inferred from communication patterns
  communicationFrequency?: CommunicationFrequency;
  lastContactDate?: string;        // ISO date of most recent interaction
  firstContactDate?: string;       // ISO date of earliest known interaction
  interactionCount: number;        // Total emails + calendar + mentions
  tags: string[];                  // User-assignable + AI-inferred

  // Knowledge graph links
  emailEntityIds: string[];        // Email entities associated with this contact
  calendarEntityIds: string[];     // Calendar events involving this contact
  documentEntityIds: string[];     // Documents mentioning this contact

  // Metadata
  source: 'device' | 'email' | 'calendar' | 'manual';
  mergedFrom?: string[];           // If this entity was merged from multiple sources
  createdAt: string;
  updatedAt: string;
}

type RelationshipType =
  | 'colleague'
  | 'manager'
  | 'direct_report'
  | 'client'
  | 'vendor'
  | 'friend'
  | 'family'
  | 'acquaintance'
  | 'unknown';

interface CommunicationFrequency {
  emailsPerWeek: number;           // Average over last 90 days
  meetingsPerMonth: number;        // Average over last 90 days
  lastEmailDate?: string;
  lastMeetingDate?: string;
  trend: 'increasing' | 'stable' | 'decreasing' | 'inactive';
}
```

### B2: Contact Store (SQLite)

```sql
-- New table in packages/core/knowledge/ schema
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  device_contact_id TEXT,
  display_name TEXT NOT NULL,
  given_name TEXT,
  family_name TEXT,
  emails TEXT NOT NULL DEFAULT '[]',        -- JSON array
  phones TEXT NOT NULL DEFAULT '[]',        -- JSON array
  organization TEXT,
  job_title TEXT,
  birthday TEXT,
  addresses TEXT DEFAULT '[]',             -- JSON array
  relationship_type TEXT DEFAULT 'unknown',
  communication_frequency TEXT DEFAULT '{}', -- JSON
  last_contact_date TEXT,
  first_contact_date TEXT,
  interaction_count INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',                   -- JSON array
  email_entity_ids TEXT DEFAULT '[]',       -- JSON array
  calendar_entity_ids TEXT DEFAULT '[]',    -- JSON array
  document_entity_ids TEXT DEFAULT '[]',    -- JSON array
  source TEXT DEFAULT 'device',
  merged_from TEXT DEFAULT '[]',            -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_contacts_emails ON contacts(emails);
CREATE INDEX idx_contacts_display_name ON contacts(display_name);
CREATE INDEX idx_contacts_relationship_type ON contacts(relationship_type);
CREATE INDEX idx_contacts_last_contact_date ON contacts(last_contact_date);
```

### B3: Contact Ingestion Pipeline

```typescript
// packages/core/knowledge/contacts/contact-ingestion.ts

export class ContactIngestionPipeline {
  // 1. Fetch all contacts from platform adapter
  // 2. For each contact, check if already exists in contacts table (by email match)
  // 3. If exists: merge (update fields, preserve relationship intelligence)
  // 4. If new: create ContactEntity
  // 5. Run entity resolution: match to existing email senders/calendar attendees
  // 6. Generate embeddings for contact (name + org + title → vector)
  // 7. Update knowledge graph links

  async ingestFromDevice(): Promise<ContactIngestionResult>;
  async resolveEntities(): Promise<EntityResolutionResult>;
}

interface ContactIngestionResult {
  imported: number;
  updated: number;
  skipped: number;       // Duplicates or no useful data
  errors: string[];
}

interface EntityResolutionResult {
  matched: number;       // Device contacts matched to existing email/calendar entities
  unmatched: number;     // Device contacts with no existing correspondence
  merged: number;        // Multiple entities merged into one (e.g., same person, different email)
}
```

### B4: Entity Resolution

The most important part of this step. Semblance must understand that "Sarah Chen" in your contacts, "sarah.chen@company.com" in your email, and "Sarah C." on your calendar are the same person.

**Resolution strategy:**
1. **Email match (highest confidence):** Contact email matches a known email sender → merge
2. **Name + organization match (high confidence):** Full name + same org matches calendar attendee → merge
3. **Name similarity (medium confidence):** Fuzzy name match (Levenshtein distance ≤ 2, or normalized name match) + same domain → merge with confirmation flag
4. **Phone match:** Contact phone matches a phone in any indexed data → merge

```typescript
// packages/core/knowledge/contacts/entity-resolver.ts

export class ContactEntityResolver {
  // Resolves a DeviceContact against existing knowledge graph entities
  // Returns: matched entity ID, or null if no match
  // For medium-confidence matches: sets needsConfirmation flag

  async resolve(contact: DeviceContact): Promise<ResolvedContact>;
}

interface ResolvedContact {
  contactEntityId: string;
  matchedEntities: MatchedEntity[];
  confidence: 'high' | 'medium' | 'low';
  needsConfirmation: boolean;
}

interface MatchedEntity {
  entityId: string;
  entityType: 'email_sender' | 'calendar_attendee' | 'document_mention';
  matchMethod: 'email' | 'name_org' | 'name_fuzzy' | 'phone';
  confidence: number;  // 0-1
}
```

### B5: Tests (12+)

- Contact ingestion creates ContactEntity in SQLite
- Contact with existing email match merges correctly
- Contact without match creates new entity
- Entity resolution: email match → high confidence
- Entity resolution: name + org match → high confidence
- Entity resolution: fuzzy name match → medium confidence with needsConfirmation
- Entity resolution: no match → new entity
- Duplicate contact (same device ID) updates rather than duplicates
- Contact embedding generated and stored in vector store
- Contact searchable by name via semantic search
- Contact searchable by organization via semantic search
- Merged entity preserves all linked email/calendar/document IDs

---

## Section C: Relationship Graph

### C1: Communication Pattern Analysis

```typescript
// packages/core/knowledge/contacts/relationship-analyzer.ts

export class RelationshipAnalyzer {
  // Analyzes communication patterns between the user and each contact
  // Sources: email send/receive history, calendar co-attendance, @mentions

  // Computes CommunicationFrequency for each contact
  async analyzeFrequency(contactId: string): Promise<CommunicationFrequency>;

  // Infers relationship type from patterns
  // - High frequency + same org + meeting attendance → colleague
  // - All meetings are 1:1 + hierarchical language patterns → manager/report
  // - External domain + invoices/contracts → client/vendor
  // - Personal email domain + low formality + optional meetings → friend
  // - Birthday shared + same last name → family
  async inferRelationshipType(contactId: string): Promise<RelationshipType>;

  // Computes interaction trend (increasing/decreasing/stable/inactive)
  async analyzeTrend(contactId: string): Promise<'increasing' | 'stable' | 'decreasing' | 'inactive'>;

  // Builds the full relationship graph for all contacts
  async buildRelationshipGraph(): Promise<RelationshipGraph>;
}

interface RelationshipGraph {
  contacts: ContactEntity[];
  edges: RelationshipEdge[];
  clusters: RelationshipCluster[];
}

interface RelationshipEdge {
  fromContactId: string;
  toContactId: string;
  weight: number;          // Interaction strength (0-1)
  sharedContexts: string[]; // Common topics, projects, events
}

interface RelationshipCluster {
  id: string;
  name: string;            // "Work — Engineering Team", "Family", "Portland Project"
  contactIds: string[];
  inferredFrom: string;    // How cluster was identified
}
```

### C2: Relationship Type Inference

This uses the LLM for nuanced classification. Not every relationship can be determined by rules alone.

**Approach:**
1. Gather evidence for each contact: email count, meeting count, email tone samples (3 recent), calendar event types, shared org, email domains
2. For contacts with enough data (≥5 interactions), use LLM classification:
   - System prompt: "Classify the relationship between the user and this contact based on the evidence provided."
   - Input: structured evidence summary
   - Output: RelationshipType + confidence + reasoning
3. For contacts with sparse data (<5 interactions): rule-based inference only (same org → colleague, personal domain → acquaintance)
4. Classification runs as a background task (not blocking ingestion)
5. Results cached in contacts table, re-analyzed weekly or on significant new data

**Critical:** This is an AI Core operation — no Gateway involvement. The LLM runs locally. Email tone samples are pulled from the local knowledge graph. No data leaves the device.

### C3: Tests (15+)

- High-frequency same-org contact → colleague
- 1:1 meetings + hierarchical language → manager/direct_report
- External domain + invoices → client/vendor
- Personal domain + informal language → friend
- Same last name + birthday shared → family
- Sparse data (<5 interactions) → rule-based only (no LLM call)
- Communication frequency calculation correct (emails/week, meetings/month)
- Trend detection: increasing frequency → 'increasing'
- Trend detection: 30+ days no contact from weekly pattern → 'decreasing'
- Trend detection: no prior pattern → 'stable'
- Relationship graph has edges between contacts who appear in same email threads
- Relationship graph clusters contacts by shared context
- Cluster naming reflects shared topic (e.g., "Portland Project")
- Re-analysis after new email data updates relationship type
- Entity resolution across data sources preserves relationship data

---

## Section D: Proactive Insights

### D1: Birthday Reminders

```typescript
// packages/core/agent/proactive/birthday-tracker.ts

export class BirthdayTracker {
  // Checks all contacts with birthdays, generates reminders
  // Runs daily (called by ProactiveEngine scheduler)

  // Returns contacts with birthdays in the next N days
  async getUpcomingBirthdays(daysAhead?: number): Promise<BirthdayReminder[]>;

  // Generates reminder with context
  // "Sarah Chen's birthday is in 3 days (March 15). You sent her a birthday message last year."
  async generateBirthdayInsight(contactId: string): Promise<BirthdayInsight>;
}

interface BirthdayReminder {
  contactId: string;
  contactName: string;
  birthday: string;       // MM-DD or YYYY-MM-DD
  daysUntil: number;
  relationship: RelationshipType;
}

interface BirthdayInsight {
  reminder: BirthdayReminder;
  lastBirthdayAction?: string;   // What user did last year (if tracked)
  suggestedAction?: string;      // "Send a message" or "Add to calendar"
}
```

**Integration with existing reminders:** Birthday reminders create entries in the existing reminder system (Step 10). They appear as system-generated reminders with source: 'birthday_tracker'. User can snooze/dismiss like any reminder.

### D2: Contact Frequency Insights

```typescript
// packages/core/agent/proactive/contact-frequency-monitor.ts

export class ContactFrequencyMonitor {
  // Detects anomalies in communication patterns
  // Runs weekly (called by ProactiveEngine scheduler)

  // Returns contacts where communication has dropped below established pattern
  async getDecreasingContacts(): Promise<FrequencyAlert[]>;

  // Returns contacts the user communicates with frequently but has no contact entry for
  async getUnresolvedFrequentContacts(): Promise<UnresolvedContact[]>;
}

interface FrequencyAlert {
  contactId: string;
  contactName: string;
  relationship: RelationshipType;
  usualPattern: string;       // "Weekly emails"
  currentGap: string;         // "3 weeks since last contact"
  lastInteraction: string;    // ISO date
  suggestedAction?: string;   // "Send a follow-up?"
}
```

**ProactiveEngine integration:** These insights surface in the Universal Inbox as proactive cards (same as Knowledge Moments and meeting prep). They respect autonomy tier:
- Guardian: shows insight card, suggests action
- Partner: shows insight card, pre-drafts follow-up email
- Alter Ego: drafts and queues follow-up (user can review in audit trail)

### D3: Tests (10+)

- Birthday 3 days away → reminder generated
- Birthday today → reminder generated with "today" flag
- No birthday set → no reminder
- Birthday reminder creates entry in reminder system
- Contact with decreasing frequency → alert generated
- Contact with stable frequency → no alert
- Inactive contact (>90 days, was weekly) → alert with longer gap description
- New contact (insufficient data) → no frequency alert
- Insight surfaces in ProactiveEngine output
- Autonomy tier respected: Guardian shows card only, Partner pre-drafts

---

## Section E: Relationship Intelligence UI

### E1: Contacts & Relationships Screen (Desktop)

New screen accessible from sidebar navigation: "Relationships"

**Layout:**
- Top section: Summary stats (total contacts, active relationships, upcoming birthdays)
- Main section: Contact list with relationship badges
  - Each contact row: avatar placeholder (initials), name, org, relationship type badge, last contact date, frequency indicator (●●● active, ●● occasional, ● rare)
  - Sort by: name, last contact, frequency, relationship type
  - Filter by: relationship type, frequency, has birthday
- Detail panel (click contact): Full contact card with:
  - All contact fields
  - Communication timeline (emails, meetings — last 10)
  - Shared topics/projects (from relationship edges)
  - Related contacts (same cluster)
  - Frequency chart (emails/week over last 90 days — simple bar chart)

**Design system compliance:**
- Card backgrounds: `--color-surface-2`
- Relationship badges: Warm Amber for work, Sage for personal, Muted for unknown
- Frequency dots: `--color-primary` (active), `--color-secondary` (occasional), `--color-muted` (rare)
- Typography: `--font-heading` for contact names, `--font-body` for details

### E2: Contacts Screen (Mobile)

Same data, mobile-optimized layout:
- Contact list with swipe actions (call, email, view details)
- Tap for detail view (full screen, not panel)
- Frequency chart simplified (sparkline instead of bar chart)
- Birthday section at top if upcoming birthdays exist

### E3: Proactive Cards in Inbox

Birthday reminders and frequency alerts render as inbox cards:
- Birthday card: cake emoji + "Sarah Chen's birthday is March 15 (3 days)" + action buttons (send message, add to calendar)
- Frequency card: clock emoji + "You haven't emailed David in 3 weeks — you usually exchange emails weekly" + action button (draft follow-up)

### E4: Sidecar Bridge Commands

Add to the Tauri sidecar bridge:
```
contacts:import          — Trigger contact ingestion
contacts:list            — Get all contacts (paginated)
contacts:get             — Get single contact by ID
contacts:search          — Search contacts by name/org/email
contacts:getRelationshipGraph — Get full graph (for visualization in Step 24)
contacts:getUpcomingBirthdays — Birthday reminders
contacts:getFrequencyAlerts   — Communication frequency alerts
```

### E5: Tests (10+)

- Contacts screen renders with contact list
- Contact detail shows communication timeline
- Contact search returns matching contacts
- Relationship badge shows correct type
- Frequency indicator matches calculated frequency
- Birthday card renders when upcoming birthday exists
- Frequency alert card renders when gap detected
- Mobile contact list renders
- Mobile swipe actions work
- Sidecar bridge commands return correct data

---

## Section F: Contact Resolution for Agent Actions

### F1: Orchestrator Contact Resolution

When the user says "email Sarah about the Portland contract" or "text David to confirm Tuesday," the orchestrator needs to resolve "Sarah" and "David" to actual contacts.

```typescript
// packages/core/knowledge/contacts/contact-resolver.ts

export class ContactResolver {
  // Resolves a natural language name reference to a ContactEntity
  // Uses: exact name match, fuzzy match, recent conversation context, relationship strength

  async resolve(nameRef: string, context?: ResolutionContext): Promise<ResolvedContactResult>;
}

interface ResolutionContext {
  conversationTopic?: string;   // Current conversation topic (for disambiguation)
  actionType?: string;          // 'email', 'text', 'call' — affects which contacts are viable
  recentMentions?: string[];    // Names mentioned in recent messages
}

interface ResolvedContactResult {
  contact: ContactEntity | null;
  confidence: 'exact' | 'high' | 'ambiguous' | 'none';
  alternatives?: ContactEntity[];  // If ambiguous, other candidates
  disambiguationQuestion?: string; // "Did you mean Sarah Chen (Acme Corp) or Sarah Johnson (personal)?"
}
```

**Resolution priority:**
1. Exact full name match → return immediately
2. First name match, single result → return with high confidence
3. First name match, multiple results → use context to disambiguate:
   - If topic matches one contact's shared context → prefer that one
   - If action type is 'text' and only one has a phone → prefer that one
   - Otherwise → return ambiguous with disambiguation question
4. No match → return none

**Orchestrator integration:** When the orchestrator detects a name reference in a user message that involves an action (email, text, call, schedule meeting), it calls `ContactResolver.resolve()` before constructing the action request. If ambiguous, it asks the user to clarify rather than guessing.

### F2: Tests (8+)

- Exact name "Sarah Chen" → resolves to correct contact
- First name "Sarah" with single match → high confidence
- First name "Sarah" with multiple matches → ambiguous + disambiguation question
- Context disambiguates: topic "Portland" + two Sarahs → Sarah who's linked to Portland project
- Action type disambiguates: "text Sarah" + only one Sarah has phone → that Sarah
- No match → returns none gracefully
- Orchestrator uses ContactResolver before building action request
- Ambiguous resolution → orchestrator asks user to clarify

---

## Commit Strategy

8 commits. Each compiles, passes all tests, leaves codebase working.

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A | ContactsAdapter interface + desktop/mobile adapters | 8+ |
| 2 | B | Contact entity schema + SQLite store + ingestion pipeline | 8+ |
| 3 | B | Entity resolution (email match, name match, fuzzy match) | 8+ |
| 4 | C | Relationship analyzer (frequency, trends, communication patterns) | 8+ |
| 5 | C | Relationship type inference (LLM + rules) + graph builder | 8+ |
| 6 | D | Birthday tracker + contact frequency monitor + proactive integration | 10+ |
| 7 | E | Relationship intelligence UI (desktop + mobile) + sidecar bridge | 10+ |
| 8 | F | Contact resolver + orchestrator integration | 8+ |

**Minimum 60 new tests. Target: 70+.**

---

## Exit Criteria

Step 14 is complete when ALL of the following are true:

### Core Functionality
1. ☐ ContactsAdapter on PlatformAdapter with permission flow
2. ☐ Contacts imported from device (mock adapter in tests) and stored in SQLite
3. ☐ Entity resolution matches device contacts to existing email senders/calendar attendees
4. ☐ High-confidence matches (email) resolve automatically; medium-confidence (fuzzy name) flagged for confirmation
5. ☐ Contact embeddings generated and searchable via semantic search

### Relationship Intelligence
6. ☐ Communication frequency calculated per contact (emails/week, meetings/month)
7. ☐ Relationship type inferred (colleague, manager, client, friend, family, etc.)
8. ☐ Communication trend detected (increasing, stable, decreasing, inactive)
9. ☐ Relationship graph with edges (shared contexts) and clusters (teams, projects)

### Proactive Insights
10. ☐ Birthday reminders generate automatically for contacts with birthdays
11. ☐ Birthday reminders create entries in existing reminder system
12. ☐ Contact frequency alerts surface when communication drops below pattern
13. ☐ Insights respect autonomy tier (Guardian: show only; Partner: pre-draft; Alter Ego: queue action)

### UI
14. ☐ Relationships screen renders on desktop with contact list, detail view, frequency chart
15. ☐ Relationships screen renders on mobile with contact list and detail view
16. ☐ Birthday and frequency alert cards render in Universal Inbox
17. ☐ Sidecar bridge commands functional

### Agent Integration
18. ☐ ContactResolver resolves "email Sarah" to correct contact
19. ☐ Ambiguous names produce disambiguation question (not wrong guess)
20. ☐ Orchestrator uses ContactResolver before constructing action requests

### Engineering
21. ☐ `npx tsc --noEmit` → zero errors (maintain TypeScript clean slate)
22. ☐ 60+ new tests from this step
23. ☐ All existing 2,739 tests pass — zero regressions
24. ☐ Total test suite passes with zero failures
25. ☐ Privacy audit clean — contacts are local-only, no Gateway involvement for contact data
26. ☐ `react-native-contacts` is the ONLY new production dependency

---

## Approved Dependencies

### New
- `react-native-contacts` — Cross-platform contacts API for React Native. iOS CNContactStore, Android ContactsContract. Pure local data, no network access.

### NOT Approved
- Any cloud contacts API (Google People API, Microsoft Graph, etc.)
- Any contacts syncing service
- Any analytics or telemetry

---

## Autonomous Decision Authority

Proceed without escalating for:
- Contact entity field additions beyond what's specified (as long as they're local data)
- UI layout adjustments within Trellis design system
- Relationship type inference prompt engineering
- Entity resolution threshold tuning (confidence scores)
- SQLite index optimization
- Test organization

## Escalation Triggers — STOP and Report

- Entity resolution produces >10% false positive merge rate in tests → threshold tuning needed
- Contact ingestion for >1,000 contacts takes >30 seconds → performance issue
- Relationship type inference requires >3 LLM calls per contact → too expensive, need batching strategy
- Any temptation to make Gateway calls for contact data → RULE VIOLATION, stop immediately
- TypeScript errors introduced → fix before committing
- react-native-contacts has known security issues or excessive dependencies → find alternative

---

## Verification Requirements

**When this step is complete, provide:**

1. `git log --oneline -10` — show all commits from this step
2. `npx tsc --noEmit 2>&1 | tail -5` — TypeScript clean
3. `npx vitest run 2>&1 | tail -10` — full test suite pass count and result
4. `grep -r "import.*react-native-contacts" packages/ --include="*.ts" -l` — confirm dependency is only in mobile adapter
5. `grep -rn "fetch\|http\|https\|axios\|XMLHttpRequest" packages/core/knowledge/contacts/ --include="*.ts"` — confirm zero network access in contacts code

**All 26 exit criteria must be individually confirmed with evidence.**

---

## The Bar

After this step, Semblance knows who the people in your life are. Not just email addresses — real people with names, birthdays, organizations, communication patterns, and relationship context. When you say "email Sarah," it knows which Sarah. When it preps you for a meeting, it knows your history with each attendee. When someone's birthday approaches, it reminds you. When you haven't talked to an important contact in weeks, it notices.

ChatGPT has no idea who any of these people are. Semblance does. That's the moat.
