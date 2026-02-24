# Step 21 — Form & Bureaucracy Automation

## Context

Step 20 (Digital Representative + Subscription Cancellation) is COMPLETE. 3,253 tests passing, 0 failures. The extension registration pattern (`registerTools()`, `registerTracker()`, `registerExtensionAdapters()`) is proven across two DR features (Steps 19 and 20). This step delivers PDF form intelligence: fillable field detection, auto-fill from the knowledge graph, LLM-powered smart field mapping, a template library for common forms, and bureaucracy tracking with follow-up reminders.

**This is a Digital Representative (premium) feature.** It ships in the premium repo and follows the same extension registration pattern as Steps 19 and 20. Zero hardcoding in the orchestrator or proactive engine.

---

## Critical Files to Consume

Read these files BEFORE writing any code. Understand their APIs — do not reimplement anything that already exists.

```
File: packages/core/extensions/types.ts
What Step 21 Uses: ExtensionTool, ToolHandler, ExtensionInsightTracker, SemblanceExtension

File: packages/core/representative/types.ts
What Step 21 Uses: RepresentativeAction, RepresentativeActionClassification — reuse the action/approval pattern

File: packages/core/representative/action-manager.ts
What Step 21 Uses: RepresentativeActionManager — reuse for form submission approval flows

File: packages/core/representative/follow-up-tracker.ts
What Step 21 Uses: FollowUpTracker pattern — bureaucracy tracking follows the same escalation model

File: packages/core/knowledge/file-scanner.ts
What Step 21 Uses: PDF text extraction already exists here. Step 21 adds fillable FIELD detection, not raw text.

File: packages/core/knowledge/knowledge-graph.ts
What Step 21 Uses: KnowledgeGraph.search() — queries user data for auto-fill (name, address, employer, etc.)

File: packages/core/llm/types.ts
What Step 21 Uses: LLMProvider.chat(), ChatRequest, ChatResponse — for smart field mapping

File: packages/core/premium/premium-gate.ts
What Step 21 Uses: PremiumGate.isFeatureAvailable(), PremiumFeature type (needs 2 new values)

File: packages/core/agent/autonomy.ts
What Step 21 Uses: AutonomyManager.getDomainTier() — form fill/submit respects autonomy tiers

File: packages/core/agent/ipc-client.ts
What Step 21 Uses: IPCClient — NOT used for form filling (local file ops). Only if bureaucracy tracking sends reminder notifications.

File: packages/core/platform/types.ts
What Step 21 Uses: DatabaseHandle, PlatformAdapter (for file system access)
```

---

## Scope Boundary — READ THIS

**IN SCOPE:**
- PDF fillable field detection (AcroForm and XFA fields)
- Auto-fill from knowledge graph data
- LLM smart field mapping for ambiguous labels
- 4 form template definitions (expense report, PTO request, W-4, insurance claim)
- Fill + review workflow with autonomy tier controls
- Bureaucracy tracking: submission logging, expected timeline, follow-up reminders
- Extension tools via `registerTools()`
- Insight tracker via `registerTracker()`

**OUT OF SCOPE — DO NOT BUILD:**
- Web form automation (browser extension — post-launch)
- Tax preparation or tax filing
- OCR/scanning of non-fillable PDFs (Step 25 Import Everything may address this)
- Actual PDF writing/modification (we detect fields and provide fill data — the user fills in their viewer or we provide a filled copy)
- Any network calls from the forms module

---

## Architecture

### PDF Field Detection

PDF forms use two standards for fillable fields: AcroForm (most common) and XFA (less common, Adobe-centric). Step 21 needs to detect and extract field metadata from both.

**Approach:** Use `pdf-lib` (MIT licensed, zero dependencies, works in Node.js) for AcroForm field detection. `pdf-lib` can read PDF form fields, get their names, types, and positions. It can also FILL fields and save the modified PDF.

**Why pdf-lib:**
- Already handles AcroForm field reading AND writing
- Zero network dependencies (critical for core package)
- Well-maintained, 4M+ weekly npm downloads
- Works with the existing TypeScript strict mode
- Can produce a filled PDF as output (not just field data)

**Note on XFA:** XFA forms are increasingly rare and deprecated by Adobe. For v1, detect XFA presence and inform the user that XFA forms require manual entry. Do not attempt XFA parsing.

```typescript
// packages/core/forms/pdf-field-detector.ts
interface PDFFormField {
  name: string;              // Field name from the PDF
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'date' | 'signature';
  label: string;             // Human-readable label (may equal name)
  page: number;
  required: boolean;
  currentValue?: string;     // Pre-filled value if any
  options?: string[];         // For dropdowns/radios
  maxLength?: number;
}

interface PDFFormAnalysis {
  filePath: string;
  fileName: string;
  fieldCount: number;
  fields: PDFFormField[];
  hasXFA: boolean;           // True = warn user, don't parse
  isAcroForm: boolean;
}
```

### Knowledge Graph Auto-Fill

Query the knowledge graph for common personal data fields. Build a `UserDataResolver` that maps field semantics to knowledge graph queries.

```typescript
// packages/core/forms/user-data-resolver.ts
interface ResolvedField {
  field: PDFFormField;
  value: string | null;
  confidence: 'high' | 'medium' | 'low';  // high = exact match, medium = inferred, low = LLM guess
  source: string;                           // "email signature", "contacts", "calendar", "financial records"
}

// Known field mappings (no LLM needed):
// "Name" / "Full Name" / "Your Name" → user profile name
// "Email" / "Email Address" → user profile email
// "Phone" / "Phone Number" → user profile phone
// "Address" / "Street" / "City" / "State" / "Zip" → user profile address
// "Date" / "Today's Date" / "Date of Signature" → current date
// "Company" / "Employer" / "Organization" → extracted from email signature or profile
// "SSN" → NEVER auto-fill. Always mark as requires manual entry. Log that we refused.

// Ambiguous fields → LLM mapping (see below)
```

**Critical privacy rule:** NEVER auto-fill Social Security Numbers, passwords, PINs, or other high-sensitivity credentials. If a field appears to request these (by name or label), mark it as `requires_manual_entry` and log the refusal. This is a safety invariant, not a preference.

### LLM Smart Field Mapping

For fields that don't match known patterns, use the LLM to infer what data the field is asking for, then query the knowledge graph.

```typescript
// Prompt pattern:
// "Given this form field label: '{fieldLabel}' on a form titled '{formTitle}',
//  what personal data is this field asking for? Respond with one of:
//  name, email, phone, address, employer, date, reference_number, account_number,
//  description, amount, or 'unknown'.
//  If it asks for a reference number, what context might it refer to?"

// Then query knowledge graph with the resolved intent.
```

Use the Fast inference tier (1.5-3B) for field mapping — this is classification, not generation.

### Form Templates

Templates are NOT pre-filled PDFs. They are field mapping definitions that tell the auto-filler how to map a specific form's fields to knowledge graph data, plus metadata about expected processing.

```typescript
// packages/core/forms/form-templates.ts
interface FormTemplate {
  id: string;
  name: string;                          // "Expense Report", "PTO Request", etc.
  description: string;
  category: 'employment' | 'financial' | 'insurance' | 'government';
  fieldMappings: FormFieldMapping[];     // Known field name → data source
  expectedProcessingDays?: number;       // For bureaucracy tracking
  followUpMessage?: string;              // Template for follow-up reminder
}

interface FormFieldMapping {
  fieldPattern: string;                  // Regex or exact match for field name
  dataSource: string;                    // Knowledge graph query key
  transform?: string;                    // Optional: "uppercase", "date:MM/DD/YYYY", etc.
}
```

**4 templates required:**

1. **Expense Report** — maps employee name, department, date, amounts, descriptions. Expected processing: 14 days.
2. **PTO Request** — maps employee name, dates, hours, reason. Expected processing: 3 days.
3. **W-4 (Employee's Withholding Certificate)** — maps name, SSN (MANUAL ONLY), address, filing status. Expected processing: immediate (employer processes).
4. **Insurance Claim** — maps policy number, claimant name, date of incident, description, amount. Expected processing: 30 days.

### Fill + Review Workflow

The workflow respects autonomy tiers:

| Phase | Guardian | Partner | Alter Ego |
|-------|----------|---------|-----------|
| Field detection | Auto | Auto | Auto |
| Auto-fill known fields | Show preview, wait for approval | Fill, highlight uncertain | Fill all |
| LLM-mapped fields | Show preview, wait for approval | Show preview, wait for approval | Fill, flag low-confidence |
| Final submission | User submits manually | User submits manually | Auto-save filled PDF, notify user |

"Submission" here means saving a filled PDF — NOT sending it anywhere. Forms are local files. The user decides how to submit (print, email, upload to portal). Alter Ego can auto-save the filled PDF to a designated location.

### Bureaucracy Tracking

When a form is filled (or marked as submitted by the user), create a tracking entry:

```typescript
// packages/core/forms/bureaucracy-tracker.ts
// SQLite table: form_submissions
interface FormSubmission {
  id: string;
  formName: string;
  templateId?: string;         // If a known template was used
  filledAt: string;            // ISO timestamp
  submittedAt?: string;        // User marks when they actually submitted
  expectedResponseDays: number;
  status: 'filled' | 'submitted' | 'follow-up-sent' | 'resolved' | 'needs-attention';
  notes?: string;
}

// Escalation timeline (reuses FollowUpTracker pattern from Step 20):
// Day X (expected processing time) → reminder: "Your {form} was submitted {X} days ago. Expected: {Y} days."
// Day X+7 → follow-up: "Still no response on your {form}. Consider following up."
// Day X+14 → needs-attention: "Your {form} has been pending for {Z} days. Action may be needed."
```

The bureaucracy tracker generates proactive insights via the extension's insight tracker — these surface in the proactive engine like any other insight.

---

## Files to Create

### Source Files (11)

```
packages/core/forms/types.ts
  — All shared types: PDFFormField, PDFFormAnalysis, ResolvedField, FormTemplate,
    FormFieldMapping, FormSubmission, FormFillRequest, FormFillResult

packages/core/forms/pdf-field-detector.ts
  — PDFFieldDetector class. Uses pdf-lib to detect AcroForm fields.
    Methods: analyzeForm(filePath) → PDFFormAnalysis, detectXFA(buffer) → boolean

packages/core/forms/user-data-resolver.ts
  — UserDataResolver class. Wraps KnowledgeGraph.
    Constructor: { knowledgeGraph, llm, model }
    Methods: resolveFields(fields, formTitle?) → ResolvedField[],
             resolveField(field, formTitle?) → ResolvedField
    Known pattern matching first, then LLM fallback for ambiguous fields.
    NEVER resolves SSN/password fields — returns requires_manual_entry.

packages/core/forms/pdf-form-filler.ts
  — PDFFormFiller class. Uses pdf-lib to write values into PDF fields.
    Methods: fillForm(filePath, resolvedFields) → Buffer (filled PDF),
             previewFill(filePath, resolvedFields) → FormFillPreview
    Does NOT save to disk — returns buffer. Caller decides where to save.

packages/core/forms/form-templates.ts
  — BUILT_IN_TEMPLATES constant array with 4 FormTemplate definitions.
    Methods: getTemplates(), getTemplate(id), matchTemplate(fields) → FormTemplate | null
    matchTemplate uses field name patterns to auto-detect which template applies.

packages/core/forms/bureaucracy-tracker.ts
  — BureaucracyTracker class. SQLite table form_submissions.
    Constructor: { db: DatabaseHandle }
    Methods: createSubmission(data), getSubmission(id), markSubmitted(id, date?),
             getDueReminders(), getPendingSubmissions(), markResolved(id),
             markNeedsAttention(id), getStats()
    Escalation logic based on expectedResponseDays + elapsed time.

packages/core/forms/form-manager.ts
  — FormManager class. Orchestrates the full workflow.
    Constructor: { detector, resolver, filler, tracker, templates, autonomyManager, premiumGate }
    Methods: analyzeAndFill(filePath, options?) → FormFillResult,
             applyTemplate(filePath, templateId) → FormFillResult,
             submitForm(fillResultId) → FormSubmission,
             getFormHistory(limit?)

packages/core/forms/extension-tools.ts
  — createFormTools(deps) returns ExtensionTool[]. 3 tools, all isLocal: true:
    a. fill_form — analyzes PDF, auto-fills fields, returns preview or filled PDF
    b. check_form_status — returns bureaucracy tracking status
    c. list_form_templates — returns available templates with descriptions

packages/core/forms/insight-tracker.ts
  — FormInsightTracker implements ExtensionInsightTracker.
    Generates insights: form-reminder-due, form-needs-attention, form-submission-overdue.
    Returns empty when not premium.

packages/core/forms/index.ts
  — Barrel exports + createFormExtension(deps) → SemblanceExtension.
    Wires all classes together. Returns extension with id '@semblance/forms',
    3 tools, 1 insight tracker.

packages/desktop/src/components/FormFillFlow.tsx
  — Form fill UI: drag/drop PDF or file picker, field preview with
    auto-filled values (color-coded by confidence), edit fields,
    save filled PDF. Free tier: "Activate your Digital Representative" prompt.
    Bureaucracy tracking: submission list with status indicators.

packages/mobile/src/screens/FormScreen.tsx
  — Mobile-adapted form fill + bureaucracy tracking.
    File picker (no drag/drop on mobile), field list view, save filled PDF.
```

### Test Files (10)

```
tests/core/forms/pdf-field-detector.test.ts — 8 tests
  - Detects text fields from AcroForm PDF
  - Detects checkbox and radio fields
  - Detects dropdown fields with options
  - Handles PDF with no form fields (returns empty)
  - Detects XFA presence and sets hasXFA flag
  - Extracts field names and labels correctly
  - Reports required vs optional fields
  - Handles corrupted/invalid PDF gracefully (error, not crash)

tests/core/forms/user-data-resolver.test.ts — 8 tests
  - Resolves "Name" field to user profile name (high confidence)
  - Resolves "Email" field to user profile email (high confidence)
  - Resolves "Employer" via knowledge graph search (medium confidence)
  - Resolves ambiguous field via LLM mapping (low confidence)
  - REFUSES to resolve SSN field — returns requires_manual_entry
  - REFUSES to resolve password field — returns requires_manual_entry
  - Returns null for completely unknown field
  - Multiple fields resolved in batch

tests/core/forms/pdf-form-filler.test.ts — 6 tests
  - Fills text fields in PDF buffer
  - Fills checkbox fields
  - Fills dropdown fields
  - Skips fields with no resolved value
  - Preview mode returns field map without modifying PDF
  - Handles empty resolved fields array (returns original PDF)

tests/core/forms/form-templates.test.ts — 5 tests
  - All 4 templates defined and retrievable
  - getTemplate returns correct template by ID
  - matchTemplate identifies expense report by field patterns
  - matchTemplate returns null for unknown form
  - Each template has expectedProcessingDays

tests/core/forms/bureaucracy-tracker.test.ts — 7 tests
  - Creates submission with all fields
  - getDueReminders returns submissions past expected date
  - getDueReminders excludes resolved submissions
  - markSubmitted updates timestamp
  - markResolved changes status
  - markNeedsAttention changes status
  - getStats returns correct counts

tests/core/forms/form-manager.test.ts — 6 tests
  - Full analyzeAndFill workflow: detect → resolve → fill
  - applyTemplate uses template field mappings
  - Premium gate blocks free-tier access
  - Guardian tier: returns preview, requires approval
  - Partner tier: fills known, previews uncertain
  - Alter Ego tier: fills all, flags low-confidence

tests/core/forms/extension-tools.test.ts — 5 tests
  - fill_form tool registered and callable
  - check_form_status tool returns tracking data
  - list_form_templates tool returns all 4 templates
  - All tools have isLocal: true
  - Tools return error when not premium

tests/core/forms/insight-tracker.test.ts — 4 tests
  - Generates form-reminder-due insight when submission past expected date
  - Generates form-needs-attention for overdue submissions
  - Returns empty array when not premium
  - Returns empty array when no submissions pending

tests/core/forms/extension-init.test.ts — 3 tests
  - createFormExtension returns valid SemblanceExtension
  - Extension has id '@semblance/forms'
  - Extension registers 3 tools and 1 insight tracker

tests/core/forms/privacy.test.ts — 4 tests
  - Zero network imports in packages/core/forms/
  - Zero gateway imports in packages/core/forms/
  - SSN/password fields are NEVER auto-filled (safety invariant)
  - All file operations use PlatformAdapter (no raw fs access)
```

### UI Tests (4)

```
tests/desktop/form-fill-flow.test.ts — 3 tests
  - Renders form fill UI with field preview
  - Shows "Digital Representative" prompt for free tier (not "Premium")
  - Displays bureaucracy tracking list with status indicators

tests/mobile/form-screen.test.ts — 1 test
  - Renders mobile form screen with file picker and field list
```

### Modified Files

```
packages/core/premium/premium-gate.ts
  — Add 2 PremiumFeature values: 'form-automation', 'bureaucracy-tracking'
  — Add FEATURE_TIER_MAP entries: both → 'digital-representative'

packages/core/tsconfig.json
  — Add "forms/**/*.ts" to include array
```

---

## Dependency: pdf-lib

**Package:** `pdf-lib` (npm)
**License:** MIT
**Size:** ~300KB (within the 500KB threshold)
**Transitive dependencies:** 4 (all small: `@pdf-lib/standard-fonts`, `@pdf-lib/upemb`, `pako`, `tslib`)
**Network behavior:** ZERO network calls. Pure PDF parsing/generation.
**Justification:** Required for reading and writing PDF form fields. No existing dependency handles AcroForm detection. `pdf-lib` is the standard TypeScript-native solution.

Install: `npm install pdf-lib` in the core package.

---

## 8-Commit Plan

### Commit 1: Types + PDF Field Detector

**Create:**
- `packages/core/forms/types.ts` — All shared types
- `packages/core/forms/pdf-field-detector.ts` — PDFFieldDetector using pdf-lib
- `tests/core/forms/pdf-field-detector.test.ts` — 8 tests

**Modify:**
- `packages/core/tsconfig.json` — Add `"forms/**/*.ts"` to include
- `package.json` (core) — Add `pdf-lib` dependency

**Tests:** 8

### Commit 2: UserDataResolver + Smart Field Mapping

**Create:**
- `packages/core/forms/user-data-resolver.ts` — Known patterns + LLM fallback
- `tests/core/forms/user-data-resolver.test.ts` — 8 tests (includes SSN/password refusal tests)

**Tests:** 8

### Commit 3: PDFFormFiller + Form Templates

**Create:**
- `packages/core/forms/pdf-form-filler.ts` — Uses pdf-lib to fill fields
- `packages/core/forms/form-templates.ts` — 4 built-in templates
- `tests/core/forms/pdf-form-filler.test.ts` — 6 tests
- `tests/core/forms/form-templates.test.ts` — 5 tests

**Tests:** 11

### Commit 4: BureaucracyTracker

**Create:**
- `packages/core/forms/bureaucracy-tracker.ts` — SQLite table + escalation logic
- `tests/core/forms/bureaucracy-tracker.test.ts` — 7 tests

**Tests:** 7

### Commit 5: FormManager + PremiumGate Expansion

**Create:**
- `packages/core/forms/form-manager.ts` — Full workflow orchestration
- `tests/core/forms/form-manager.test.ts` — 6 tests

**Modify:**
- `packages/core/premium/premium-gate.ts` — Add 'form-automation', 'bureaucracy-tracking'

**Tests:** 6

### Commit 6: Extension Tools + Insight Tracker

**Create:**
- `packages/core/forms/extension-tools.ts` — 3 tools via registerTools()
- `packages/core/forms/insight-tracker.ts` — FormInsightTracker
- `tests/core/forms/extension-tools.test.ts` — 5 tests
- `tests/core/forms/insight-tracker.test.ts` — 4 tests

**Tests:** 9

### Commit 7: Extension Entry Point + UI

**Create:**
- `packages/core/forms/index.ts` — Barrel + createFormExtension()
- `packages/desktop/src/components/FormFillFlow.tsx` — Desktop form fill UI + bureaucracy tracking
- `packages/mobile/src/screens/FormScreen.tsx` — Mobile form screen
- `tests/core/forms/extension-init.test.ts` — 3 tests
- `tests/desktop/form-fill-flow.test.ts` — 3 tests
- `tests/mobile/form-screen.test.ts` — 1 test

**Tests:** 7

### Commit 8: Privacy + Integration

**Create:**
- `tests/core/forms/privacy.test.ts` — 4 tests: zero network/gateway imports, SSN refusal, PlatformAdapter usage

**Tests:** 4

---

## Test Summary

| Commit | Tests |
|--------|-------|
| 1 | 8 (PDF field detector) |
| 2 | 8 (user data resolver) |
| 3 | 11 (PDF filler + templates) |
| 4 | 7 (bureaucracy tracker) |
| 5 | 6 (form manager) |
| 6 | 9 (extension tools + insight tracker) |
| 7 | 7 (extension init + UI) |
| 8 | 4 (privacy) |
| **Total** | **60 tests** (target was 60+) |

---

## Verification Checks

After all 8 commits, run these checks and provide RAW terminal output:

```bash
# Check 1: Test count (3,253 + 60 = 3,313+, 0 failures)
npx vitest run 2>&1 | tail -10

# Check 2: Extension registration — ZERO hardcoding
grep -n "PDFFieldDetector\|FormManager\|BureaucracyTracker\|UserDataResolver" packages/core/agent/orchestrator.ts
# Expected: ZERO matches

grep -n "FormInsightTracker" packages/core/agent/proactive-engine.ts
# Expected: ZERO matches

# Check 3: Extension tools registered
grep -n "registerTools\|createFormTools" packages/core/forms/extension-tools.ts

# Check 4: pdf-lib used (not a reimplementation)
grep -n "pdf-lib\|PDFDocument" packages/core/forms/pdf-field-detector.ts

# Check 5: SSN/password safety invariant
grep -n "ssn\|SSN\|social.security\|password\|requires_manual" packages/core/forms/user-data-resolver.ts

# Check 6: Bureaucracy SQLite table
grep -n "CREATE TABLE\|form_submissions" packages/core/forms/bureaucracy-tracker.ts

# Check 7: All 4 templates
grep -n "expense\|pto\|w-4\|W-4\|insurance" packages/core/forms/form-templates.ts

# Check 8: Digital Representative naming (never "Premium" in UI)
grep -rn "Digital Representative" packages/desktop/src/components/FormFillFlow.tsx packages/mobile/src/screens/FormScreen.tsx
grep -rn ">[^<]*[Pp]remium[^<]*<" packages/desktop/src/components/FormFillFlow.tsx packages/mobile/src/screens/FormScreen.tsx
# Expected: ZERO user-facing "Premium" strings

# Check 9: Privacy audit
grep -rn "^import.*from.*gateway\|from.*@semblance/gateway" packages/core/forms/ --include="*.ts"
# Expected: ZERO gateway imports
grep -rn "import.*fetch\|import.*http\|import.*net\b\|import.*axios" packages/core/forms/ --include="*.ts"
# Expected: ZERO network imports (pdf-lib imports are fine)

# Check 10: TypeScript clean
npx tsc --noEmit

# Check 11: Autonomy tier coverage
grep -n "guardian\|Guardian\|partner\|Partner\|alter.ego\|Alter.Ego" tests/core/forms/form-manager.test.ts
```

---

## Exit Criteria

Step 21 is complete when ALL of the following are true:

1. ☐ PDF fillable fields detected from AcroForm PDFs via pdf-lib
2. ☐ XFA forms detected and flagged (not parsed — user informed)
3. ☐ Auto-fill resolves known fields (name, email, address, employer, date) from knowledge graph
4. ☐ LLM smart mapping resolves ambiguous fields with confidence scoring
5. ☐ SSN/password fields are NEVER auto-filled — safety invariant tested
6. ☐ pdf-lib fills PDF fields and returns buffer (filled PDF)
7. ☐ 4 form templates defined (expense, PTO, W-4, insurance) with expected processing times
8. ☐ Fill + review workflow respects all 3 autonomy tiers
9. ☐ BureaucracyTracker creates submissions, tracks timelines, escalates reminders
10. ☐ Extension registered via registerTools() / registerTracker() — zero hardcoding in orchestrator/proactive-engine
11. ☐ All user-facing strings say "Digital Representative" — zero "Premium"
12. ☐ PremiumGate blocks free tier from form features
13. ☐ Privacy audit clean: zero network imports, zero gateway imports in forms/
14. ☐ TypeScript clean across all 4 packages
15. ☐ 60+ new tests. All existing tests pass. 0 failures.

---

## Known Risks

1. **pdf-lib AcroForm coverage.** pdf-lib handles standard AcroForm well but some PDFs use non-standard field implementations. The detector should gracefully handle partial field detection — return what it can find, flag what it can't.

2. **LLM field mapping quality.** The fast tier (1.5-3B) may struggle with very ambiguous field labels. The confidence scoring system mitigates this — low-confidence fills are always flagged for review. Do NOT use the primary tier for field mapping; it's classification, not generation.

3. **Knowledge graph data availability.** Auto-fill quality depends on how much data the user has indexed. If the knowledge graph has no employer info, the "Employer" field returns null. The UI must handle sparse auto-fill gracefully — show what was found, clearly mark what wasn't.

4. **PDF with no form fields.** Users may drop non-fillable PDFs. The detector must return a clear "this PDF has no fillable fields" result, not an error. The UI should suggest the user fill the form manually or use a PDF editor to add form fields.
