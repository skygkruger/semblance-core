# Step 25 — Import Everything + Adversarial Self-Defense

## Date: February 24, 2026
## Sprint: 5 — Becomes Permanent (Sovereignty + Trust)
## Builds On: File Indexer (Sprint 1), Embedding Pipeline (Step 9), Cloud Storage Sync (Step 18), RecurringDetector (free-tier finance), Email Indexer (Sprint 2), Proactive Engine (Sprint 2)
## Repo: semblance-core (parsers + detection engine are core infrastructure; features are premium-gated)
## Baseline: 3,213 tests, 0 failures, TypeScript clean

---

## Context

This is the third step of Sprint 5 and the largest step remaining. It has two halves:

**Import Everything** expands what Semblance knows. Browser history, notes, photos metadata, and messaging history are parsed from standard export formats and fed into the existing embedding pipeline and knowledge graph. After a major import, the Knowledge Moment re-fires to demonstrate the compound knowledge unlocked by the new data.

**Adversarial Self-Defense** changes what Semblance does with what it knows. Instead of passively surfacing information, Semblance actively protects the user from dark patterns, manipulative content, and poor-value subscriptions.

### Premium Tier Classification

Per VERIDIAN_ORBITAL_COMMAND_SESSION_1.md, Import Everything and Adversarial Self-Defense are both listed under the **Digital Representative tier** (premium). However, the infrastructure lives in `semblance-core`:

- **Parser infrastructure** (core): The import parsers, detection engine, and data pipeline are core code. They must exist in `semblance-core` because the extension system needs them available for DR to call.
- **Feature activation** (premium-gated): The "Import Your Digital Life" UI flow and the Adversarial Self-Defense flagging/advocacy features are gated behind `PremiumGate.isActive()`. Free-tier users see the data source options grayed out with "Available with Digital Representative" messaging.

This matches the established pattern: `PremiumGate` is a core module, premium features check it before activating, but the underlying infrastructure is core code.

---

## Deliverable A: Import Parsers

### Architecture

Each import source is a standalone parser that accepts a file/directory path and produces standardized `ImportedItem[]` which feed into the existing embedding pipeline.

```typescript
// packages/core/importers/types.ts
export interface ImportParser<T = unknown> {
  readonly sourceType: ImportSourceType;
  readonly supportedFormats: string[];  // File extensions or format names

  // Validate that the input path is parseable
  canParse(path: string): Promise<boolean>;

  // Parse the source and return items
  parse(path: string, options?: ParseOptions): Promise<ImportResult<T>>;
}

export type ImportSourceType =
  | 'browser_history'
  | 'notes'
  | 'photos_metadata'
  | 'messaging';

export interface ImportResult<T = unknown> {
  items: ImportedItem[];
  sourceType: ImportSourceType;
  format: string;              // e.g., 'chrome_json', 'obsidian_md', 'imessage_sqlite'
  totalParsed: number;
  errors: ParseError[];
  metadata: T;                 // Parser-specific metadata
}

export interface ImportedItem {
  id: string;                  // Deterministic from source content
  sourceType: ImportSourceType;
  format: string;
  title: string;
  content: string;             // Text content for embedding
  timestamp: string;           // ISO timestamp
  metadata: Record<string, unknown>;  // Source-specific fields
  tags?: string[];
}

export interface ParseOptions {
  since?: Date;                // Only import items after this date
  limit?: number;              // Max items to parse
  onProgress?: (parsed: number, total: number) => void;
}

export interface ParseError {
  item?: string;               // Identifier of the failed item
  error: string;
  recoverable: boolean;
}
```

### Browser History Parsers

```typescript
// packages/core/importers/browser/chrome-history-parser.ts
// Chrome exports history as JSON (from chrome://history or Takeout)
// Also reads the History SQLite database directly (macOS/Windows/Linux paths)
// Fields: url, title, visit_time, visit_count, typed_count
// Output: ImportedItem with title, url in content, timestamp, visit_count in metadata

// packages/core/importers/browser/firefox-history-parser.ts
// Firefox uses places.sqlite database
// Fields: url, title, visit_date, visit_count, frecency
// Output: Same ImportedItem structure
```

**What gets indexed:** URL, page title, visit timestamp, visit count. NOT page content (that would require fetching, which is a Gateway call). The URL and title are sufficient for semantic search: "What was that article about machine learning I read last month?"

**Deduplication:** URLs are deduplicated by domain+path. Multiple visits to the same page become a single entity with visit_count and last_visited metadata.

### Notes Parsers

```typescript
// packages/core/importers/notes/obsidian-parser.ts
// Reads a folder of .md files (Obsidian vault structure)
// Preserves: file name as title, full markdown as content, YAML frontmatter as metadata
// Follows wiki-links [[page]] to build relationship edges
// Tags extracted from #tag syntax and frontmatter

// packages/core/importers/notes/apple-notes-parser.ts
// Apple Notes exports as HTML files (via macOS Notes.app File → Export)
// Or reads the NoteStore.sqlite database directly (macOS)
// Fields: title, body (HTML stripped to text), created_date, modified_date, folder_name
```

### Photos Metadata Parser

```typescript
// packages/core/importers/photos/exif-parser.ts
// Reads EXIF data from image files — JPEG, PNG, HEIC, HEIF
// Does NOT read the image content itself
// Extracts: GPS coordinates, timestamp, camera model, lens, exposure, album/folder name
// Output: ImportedItem with location + timestamp as content, all EXIF fields in metadata
// Enables: "Where was I last Tuesday?" → matches photo timestamps + GPS to calendar events
// Enables: "Show me photos from the Portland trip" → GPS + folder + date correlation
// Use exif-reader or exifr npm package for EXIF extraction
```

**Critical privacy note:** The parser reads ONLY metadata. It never stores, indexes, or processes the actual image data. The content field contains a text description: "Photo taken at [location] on [date] with [camera]". This must be documented in the consent card and tested explicitly.

### Messaging History Parser

```typescript
// packages/core/importers/messaging/whatsapp-parser.ts
// WhatsApp exports chat history as .txt files with format:
// [MM/DD/YY, HH:MM:SS] Sender: message text
// Parse line by line, extract sender, timestamp, message
// Group messages by conversation (one export = one conversation)
// Output: ImportedItem per message with sender and conversation_id in metadata
// Relationship context: message frequency, response patterns, topic distribution
```

**v1 scope:** WhatsApp exported .txt is the simplest and most universal messaging format. iMessage SQLite (macOS-only) is a stretch goal for this step.

---

## Deliverable B: Import Pipeline + UI Flow

### Import Pipeline

```typescript
// packages/core/importers/import-pipeline.ts
export class ImportPipeline {
  constructor(deps: {
    db: DatabaseHandle;
    embeddingPipeline: EmbeddingPipeline;
    knowledgeGraph: KnowledgeGraph;
    documentStore: DocumentStore;
    premiumGate: PremiumGate;
  });

  // Register parsers
  registerParser(parser: ImportParser): void;

  // Run an import from a specific source
  async runImport(sourcePath: string, sourceType: ImportSourceType, options?: {
    since?: Date;
    onProgress?: (phase: string, current: number, total: number) => void;
  }): Promise<ImportSummary>;

  // Get all registered parsers
  getAvailableSources(): ImportSourceInfo[];

  // Get import history
  getImportHistory(): Promise<ImportRecord[]>;
}

interface ImportSummary {
  sourceType: ImportSourceType;
  format: string;
  itemsImported: number;
  itemsSkipped: number;        // Already indexed (dedup)
  errors: number;
  embeddingsGenerated: number;
  entitiesCreated: number;
  durationMs: number;
}

interface ImportRecord {
  id: string;
  sourceType: ImportSourceType;
  format: string;
  importedAt: string;
  itemCount: number;
  status: 'complete' | 'partial' | 'failed';
}
```

**Pipeline flow:**
1. `PremiumGate.isActive()` check — if not premium, reject with clear messaging
2. Parser validates input path (`canParse()`)
3. Parser extracts items (`parse()`) with progress callbacks
4. Deduplication against existing knowledge graph entries (by source ID)
5. Items fed to `EmbeddingPipeline.indexBatch()` for embedding generation
6. Entities created in knowledge graph via `DocumentStore`
7. Import record stored in `import_history` SQLite table
8. If items imported > threshold (50), trigger Knowledge Moment re-fire

**SQLite schema:**
```sql
CREATE TABLE IF NOT EXISTS import_history (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  format TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  errors INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'complete',
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS imported_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT,
  metadata_json TEXT,
  import_id TEXT NOT NULL REFERENCES import_history(id),
  embedding_id TEXT,           -- Reference to vector store entry
  entity_id TEXT               -- Reference to knowledge graph entity
);
```

### Import UI Flow

**Desktop — Settings → Data Sources → Import Digital Life:**

```
┌─────────────────────────────────────────────────────────────┐
│ Import Your Digital Life                                     │
│                                                             │
│ Expand what your Semblance knows about you.                 │
│ Everything is processed locally and stays on your device.   │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🌐 Browser History                                      │ │
│ │ Import from Chrome or Firefox.                          │ │
│ │ URLs, page titles, and visit timestamps.                │ │
│ │                                  [Select File/Folder]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📝 Notes                                                │ │
│ │ Import from Obsidian or Apple Notes.                    │ │
│ │ Note text, tags, and dates.                             │ │
│ │                                  [Select File/Folder]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📷 Photos                                               │ │
│ │ EXIF metadata only — location, date, camera.            │ │
│ │ Your photos themselves are never stored.                 │ │
│ │                                  [Select Folder]        │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 💬 Messages                                             │ │
│ │ Import from WhatsApp exported chat.                     │ │
│ │ Message text, senders, and timestamps.                  │ │
│ │                                  [Select File]          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Import History                                              │
│ ─────────────────────────────────────────                   │
│ Chrome History — Feb 24, 2026 — 3,847 items                 │
│ Obsidian Vault — Feb 24, 2026 — 412 notes                   │
└─────────────────────────────────────────────────────────────┘
```

**Each source card shows:**
- Icon + name + supported format description
- Consent text explaining exactly what's accessed
- "Photos" card explicitly says "Your photos themselves are never stored"
- File/folder picker button (uses Tauri dialog API on desktop)
- If not premium: card is grayed, button says "Available with Digital Representative"

**During import:**
- Progress bar with phase label: "Parsing... 1,247 / 3,847" → "Generating embeddings... 892 / 3,847"
- Estimated time remaining
- Cancel button
- Success summary with item counts

**Mobile UI:**
- Same card layout, responsive
- File picker uses React Native document picker
- Progress shown inline

**Knowledge Moment re-fire:**
After a significant import (50+ items), the proactive engine generates a new Knowledge Moment demonstrating compound knowledge from the imported data. Example: "I just indexed your Obsidian vault. I found 412 notes. Your most frequent topics are machine learning (47 notes), product strategy (31 notes), and cooking (28 notes). Your notes reference 12 people you also email regularly."

---

## Deliverable C: Adversarial Self-Defense

### Dark Pattern Detection

```typescript
// packages/core/defense/dark-pattern-detector.ts
export class DarkPatternDetector {
  constructor(deps: {
    llmProvider: LLMProvider;
    model: string;
    db: DatabaseHandle;
    premiumGate: PremiumGate;
  });

  // Analyze a piece of content for manipulation patterns
  async analyze(content: ContentForAnalysis): Promise<DarkPatternResult>;

  // Batch analyze (for email inbox scans)
  async analyzeBatch(items: ContentForAnalysis[]): Promise<DarkPatternResult[]>;
}

interface ContentForAnalysis {
  id: string;
  type: 'email' | 'notification' | 'web_content';
  subject?: string;
  body: string;
  sender?: string;
  receivedAt: string;
}

interface DarkPatternResult {
  contentId: string;
  flagged: boolean;
  confidence: number;          // 0–1. Only flag if > 0.7 (conservative threshold)
  patterns: DetectedPattern[];
  reframe: string | null;      // Calm factual reframe if flagged
  dismissed: boolean;          // User dismissed this flag
}

interface DetectedPattern {
  type: 'urgency' | 'loss_framing' | 'social_proof_fabrication' | 'hidden_costs'
      | 'confirm_shaming' | 'forced_continuity' | 'misdirection';
  evidence: string;            // Specific text that triggered detection
  explanation: string;         // User-facing explanation
}
```

**Detection approach:**

Two-tier analysis:
1. **Regex pre-filter (fast, no LLM):** Pattern-match common urgency phrases ("LAST CHANCE", "ACT NOW", "expires in", "only X left", "don't miss out"). Score based on density of trigger phrases. If score below threshold, skip LLM analysis entirely (saves inference time).
2. **LLM analysis (accurate, slow):** For content that passes the pre-filter, send to local LLM with a structured prompt asking it to identify specific manipulation patterns and generate a factual reframe.

**LLM prompt structure:**
```
Analyze this email for manipulation patterns. Identify specific tactics:
- Urgency: artificial time pressure ("last chance", "expires today")
- Loss framing: emphasizing what you'll lose rather than what you'll gain
- Social proof fabrication: fake scarcity or popularity claims
- Hidden costs: obscured fees or pricing
- Confirm shaming: guilt for declining ("no thanks, I don't want to save money")
- Forced continuity: auto-renewal designed to be hard to cancel
- Misdirection: prominent "accept" with hidden "decline"

For each pattern found, cite the specific text. Then write a calm, factual reframe
that neutralizes the manipulation while preserving any legitimate information.

Respond as JSON: { patterns: [...], reframe: "..." }
```

**Conservative threshold:** Only flag when confidence > 0.7. False positives erode trust more than missed detections. User can dismiss any flag, and dismissed flags train the detector (stored in SQLite for future threshold tuning).

**SQLite schema:**
```sql
CREATE TABLE IF NOT EXISTS dark_pattern_flags (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  flagged_at TEXT NOT NULL,
  confidence REAL NOT NULL,
  patterns_json TEXT NOT NULL,
  reframe TEXT,
  dismissed INTEGER DEFAULT 0,
  dismissed_at TEXT
);
```

### Financial Advocacy

```typescript
// packages/core/defense/financial-advocate.ts
export class FinancialAdvocate {
  constructor(deps: {
    recurringDetector: RecurringDetector;
    db: DatabaseHandle;
    premiumGate: PremiumGate;
  });

  // Calculate value-to-cost ratio for all tracked subscriptions
  async analyzeSubscriptions(): Promise<SubscriptionAdvocacy[]>;
}

interface SubscriptionAdvocacy {
  subscriptionId: string;
  merchantName: string;
  monthlyCost: number;
  annualCost: number;
  usageMetric: UsageMetric;
  valueToCostRatio: number;    // Lower = worse value
  recommendation: 'keep' | 'review' | 'consider_cancelling';
  explanation: string;         // Human-readable advocacy statement
}

interface UsageMetric {
  type: 'email_mentions' | 'browser_visits' | 'login_frequency' | 'transaction_count';
  count: number;
  period: string;              // "past 6 months"
  estimatedValuePerUse: number;
}
```

**Usage measurement:** This is heuristic-based, not perfect:
- `email_mentions`: How many emails from this service in past 6 months (from email indexer)
- `browser_visits`: If browser history imported, visits to the service's domain
- `login_frequency`: Inferred from email login notifications
- `transaction_count`: Non-subscription transactions with this merchant

The value estimate is rough: `estimatedValuePerUse × count = estimatedValue`. If `estimatedValue / annualCost < 0.3`, recommendation is `consider_cancelling`. If `< 0.7`, `review`. Otherwise `keep`.

### Manipulative Content Flagging

This is part of DarkPatternDetector. When an email is flagged, the inbox shows:

**Desktop inbox card:**
- Shield icon (🛡️) in `--color-attention` (Alert Coral) next to the email subject
- Below the subject line: italic text with the reframe in `--color-text-secondary`
- "This email uses urgency language to pressure a purchase decision. The offer has been 'ending soon' for 3 weeks."
- Dismiss button (X) to remove the flag
- "Why flagged?" expandable section showing specific patterns detected

**Mobile inbox:**
- Same shield icon + reframe text
- Swipe to dismiss flag

### Opt-Out Autopilot (Alter Ego Mode)

When Alter Ego mode is active and a subscription scores `consider_cancelling`:
- The autonomy manager receives a proposed action: `subscription.cancel`
- Alter Ego routes through standard escalation — subscription cancellation is a **write** action that requires the undo window
- The action log records the cancellation with full context
- User has configurable undo window (default: 24 hours)
- Daily digest reports: "I cancelled your [Service] subscription ($14.99/mo, used 2x in 6 months). Undo within 24 hours."

This is NOT new cancellation infrastructure — it uses the existing cancellation flow from Step 20 (which is in DR). The opt-out autopilot is the **trigger logic** that decides when to initiate cancellation. The trigger logic lives in core; the execution lives in DR.

---

## Deliverable D: Proactive Engine Integration

### Dark Pattern Scanning

The proactive engine (existing) gets a new insight tracker registered via `registerTracker()`:

```typescript
// packages/core/defense/dark-pattern-tracker.ts
export class DarkPatternTracker implements InsightTracker {
  // Scans recent emails (past 24h) for dark patterns
  // Runs during proactive engine's scheduled analysis cycle
  // Generates ProactiveInsight with type 'dark_pattern'
  // Only runs if PremiumGate.isActive()

  async analyze(context: ProactiveContext): Promise<ProactiveInsight[]>;
}
```

### Financial Advocacy Tracker

```typescript
// packages/core/defense/financial-advocacy-tracker.ts
export class FinancialAdvocacyTracker implements InsightTracker {
  // Runs weekly (not daily — subscription changes are slow)
  // Analyzes all tracked subscriptions for value-to-cost ratio
  // Generates ProactiveInsight with type 'subscription_advocacy'
  // Only runs if PremiumGate.isActive()

  async analyze(context: ProactiveContext): Promise<ProactiveInsight[]>;
}
```

Both trackers register via the existing `registerTracker()` API. They produce standard `ProactiveInsight` objects that surface in the Morning Brief and inbox.

---

## Scope Boundaries

**This step does NOT include:**
- iMessage SQLite parser (macOS-only, complex, defer to post-launch)
- Signal export parser (non-standard format, defer to post-launch)
- Google Keep parser (less common than Obsidian/Apple Notes, defer)
- Notion parser (API-based, would need Gateway call — defer)
- Full page content retrieval for browser history (would need Gateway calls)
- Automatic dark pattern blocking (we flag, we don't block)
- New cancellation infrastructure (uses existing DR cancellation flow)
- Changes to the embedding pipeline itself (we feed it standard items)

**This step DOES include:**
- 4 import parsers: Chrome history, Firefox history, Obsidian notes, WhatsApp messages
- 1 metadata parser: EXIF photos metadata
- Apple Notes parser (HTML export format)
- Import pipeline with progress tracking, deduplication, and history
- Import UI on desktop and mobile (premium-gated)
- DarkPatternDetector with two-tier analysis (regex + LLM)
- FinancialAdvocate with value-to-cost ratio
- Proactive engine integration (2 new trackers)
- Inbox UI for flagged content (desktop + mobile)
- Knowledge Moment re-fire after significant imports

---

## Commit Strategy

10 commits. Each compiles, passes all tests, and leaves the codebase working.

| Commit | Deliverable | Description | Tests |
|--------|-------------|-------------|-------|
| 1 | A | Import types + Chrome history parser | 6+ |
| 2 | A | Firefox history parser + Obsidian notes parser | 6+ |
| 3 | A | Apple Notes parser + WhatsApp messaging parser | 6+ |
| 4 | A | EXIF photos metadata parser | 4+ |
| 5 | B | Import pipeline — dedup, embedding feed, import history, Knowledge Moment re-fire | 8+ |
| 6 | B | Import UI flow — desktop + mobile, consent cards, progress, premium gate | 5+ |
| 7 | C | DarkPatternDetector — regex pre-filter + LLM analysis + SQLite storage | 8+ |
| 8 | C | FinancialAdvocate — value-to-cost ratio, subscription analysis | 6+ |
| 9 | C | Inbox flagging UI (desktop + mobile) + dismiss + "why flagged?" | 4+ |
| 10 | D | Proactive engine trackers (DarkPatternTracker + FinancialAdvocacyTracker) + opt-out autopilot trigger | 5+ |

**Minimum 58 new tests. Target: 65+.**

---

## Verification Checks

Run ALL of these. Report raw terminal output for each.

### Standard Battery
```bash
/step-verify
/extension-audit
/privacy-check
/stub-scan
```

### Step-Specific Checks

```bash
# 1. Import parsers exist
grep -rn "ChromeHistoryParser\|FirefoxHistoryParser" packages/core/importers/browser/ --include="*.ts"
grep -rn "ObsidianParser\|AppleNotesParser" packages/core/importers/notes/ --include="*.ts"
grep -rn "ExifParser" packages/core/importers/photos/ --include="*.ts"
grep -rn "WhatsAppParser" packages/core/importers/messaging/ --include="*.ts"

# 2. All parsers implement ImportParser interface
grep -rn "implements ImportParser" packages/core/importers/ --include="*.ts"

# 3. Import pipeline exists
grep -rn "ImportPipeline" packages/core/importers/ --include="*.ts"
grep -n "runImport\|registerParser\|getImportHistory" packages/core/importers/import-pipeline.ts

# 4. Premium gate on import
grep -n "premiumGate\|PremiumGate\|isActive" packages/core/importers/import-pipeline.ts

# 5. DarkPatternDetector exists with both tiers
grep -rn "DarkPatternDetector" packages/core/defense/ --include="*.ts"
grep -n "regex\|preFilter\|PRE_FILTER\|URGENCY_PATTERNS" packages/core/defense/dark-pattern-detector.ts

# 6. FinancialAdvocate exists
grep -rn "FinancialAdvocate\|valueToCostRatio\|SubscriptionAdvocacy" packages/core/defense/ --include="*.ts"

# 7. Proactive trackers registered
grep -rn "DarkPatternTracker\|FinancialAdvocacyTracker" packages/core/defense/ --include="*.ts"
grep -rn "implements InsightTracker" packages/core/defense/ --include="*.ts"

# 8. EXIF parser does NOT store image data
grep -n "imageData\|pixels\|bitmap\|canvas\|readFile.*image" packages/core/importers/photos/exif-parser.ts

# 9. Import UI components
grep -rn "ImportDigitalLife\|ImportFlow\|ImportCard" packages/desktop/src/components/ --include="*.tsx"
grep -rn "ImportScreen\|ImportFlow" packages/mobile/src/ --include="*.tsx"

# 10. Inbox flagging UI
grep -rn "DarkPatternBadge\|ShieldIcon\|dark.*pattern\|reframe" packages/desktop/src/components/ --include="*.tsx"

# 11. No gateway calls in parsers (parsers read local files only)
grep -rn "gateway\|Gateway\|ipcClient\|IPC\|fetch\(" packages/core/importers/ --include="*.ts"

# 12. No DR imports in core
grep -rn "from.*representative\|from.*@semblance/dr" packages/core/importers/ packages/core/defense/ --include="*.ts"

# 13. Import history SQLite schema
grep -n "import_history\|imported_items" packages/core/importers/import-pipeline.ts

# 14. Conservative detection threshold
grep -n "0\.7\|confidence.*threshold\|CONFIDENCE_THRESHOLD" packages/core/defense/dark-pattern-detector.ts

# 15. Test count
/test-count
```

---

## Exit Criteria

Step 25 is complete when ALL of the following are true:

1. ✅ Browser history import works for Chrome and Firefox export formats (JSON/SQLite).
2. ✅ Notes import works for Obsidian (folder of .md files) and Apple Notes (HTML export).
3. ✅ Photos metadata extraction works — EXIF data parsed, image content NEVER stored or indexed.
4. ✅ Messaging import works for WhatsApp exported .txt format.
5. ✅ All imported data generates embeddings and is searchable via semantic search.
6. ✅ Import pipeline deduplicates against existing knowledge graph entries.
7. ✅ Knowledge Moment re-fires after significant import (50+ items).
8. ✅ Import UI shows consent cards, progress tracking, and import history on desktop and mobile.
9. ✅ Import features are premium-gated behind `PremiumGate.isActive()`.
10. ✅ Dark pattern detection flags urgency/manipulation emails with conservative threshold (>0.7 confidence).
11. ✅ Detection uses two-tier approach: regex pre-filter + LLM analysis.
12. ✅ Flagged content shows shield icon, factual reframe, and dismiss option in inbox UI.
13. ✅ Financial advocacy calculates value-to-cost ratio for tracked subscriptions.
14. ✅ Two new proactive engine trackers registered (DarkPatternTracker + FinancialAdvocacyTracker).
15. ✅ Alter Ego opt-out autopilot trigger logic exists (execution uses existing DR cancellation flow).
16. ✅ Parsers read local files ONLY — zero Gateway calls in import code.
17. ✅ All imports visible in audit trail.
18. ✅ 60+ new tests. All existing tests pass. Privacy audit clean.
19. ✅ TypeScript compiles cleanly (`npx tsc --noEmit` at root).

---

## Autonomous Decision Authority

You may make these decisions without asking:

- **Parser implementation details** — file reading patterns, regex patterns, error handling
- **EXIF library selection** — exifr, exif-reader, or similar (must be local, no network)
- **Regex pre-filter patterns** — which urgency phrases to detect
- **LLM prompt engineering** — dark pattern analysis prompt structure
- **Usage metric heuristics** — how to estimate subscription value from available signals
- **Import deduplication logic** — how to determine if an item already exists
- **UI layout within design system** — component arrangement following DESIGN_SYSTEM.md
- **Test data construction** — mock browser history, notes, EXIF data for tests
- **WhatsApp parsing regex** — line format patterns for different regional variants

## Escalation Required

Stop and ask before:

- **Adding parsers not listed** — iMessage, Signal, Notion, Google Keep are explicitly deferred
- **Fetching web content** — browser history indexes URLs/titles only, no content fetching
- **Modifying the embedding pipeline** — feed standard items in, don't change the pipeline
- **Changing the PremiumGate interface** — gating pattern is established
- **Adding Gateway calls to any parser** — all parsers are local file readers
- **Changing the existing cancellation flow** — opt-out autopilot is trigger logic only
- **Reducing the detection confidence threshold below 0.7** — false positives erode trust
- **Storing actual image data from EXIF parser** — metadata only, never pixel data
