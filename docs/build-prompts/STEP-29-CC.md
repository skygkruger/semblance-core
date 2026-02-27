# Step 29 — Privacy Dashboard + Proof of Privacy + Comparison Statement

## Implementation Prompt for Claude Code

**Sprint:** 6 — Becomes Undeniable (FIRST STEP OF SPRINT)  
**Builds on:** Audit Trail (Sprint 1), Network Monitor (Sprint 2), Privacy Audit Pipeline (Sprint 1 CI), Knowledge Graph (all sprints), Indexer stats (all sprints)  
**Test target:** 50+ new tests. All existing 3,418 tests must pass. TypeScript clean. Privacy audit clean.

---

## Context

You are implementing Step 29, the first step of Sprint 6. Steps 1–28 are complete with 3,418 tests across 294 files, zero failures. Sprint 5 ("Becomes Permanent") is closed. Sprint 6 ("Becomes Undeniable") is about hardening, polishing, and shipping.

This feature is split: the Privacy Dashboard and Comparison Statement are **free tier** (visible to all users — privacy is not a premium feature). The Proof of Privacy report generation is **Digital Representative tier** (premium-gated via `PremiumGate.isPremium()`).

This is an **open-core** feature. Source code lives in `semblance-core` (public, auditable). The Proof of Privacy report's credibility depends on the source being auditable — users and third parties can verify the privacy claims by reading the code.

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code.

---

## What You're Building

Three interconnected deliverables:

### 1. Privacy Dashboard (Free Tier)
A full visualization of everything Semblance stores, every connection it has made, every action it has taken, and proof that data never left the device. This is the user's window into their sovereignty — a real-time answer to "what does my AI know, and where has it gone?"

### 2. Proof of Privacy Report (Premium)
A cryptographically signed, designed document that attests to Semblance's privacy behavior. This is not a data dump — it is a shareable artifact. Something a user would want to show someone. "Here's cryptographic proof that my AI has never sent my data anywhere." Designed to be beautiful, not just functional.

### 3. Comparison Statement (Free Tier)
A single, powerful UI element: "Your Semblance has indexed 14,847 emails, 2,341 calendar events, 847 documents, and 6 months of financial history. When you open ChatGPT, it knows nothing." This appears in the Privacy Dashboard and in the weekly digest.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Nothing in `packages/core/` touches the network.
2. **RULE 2 — Gateway Only.** All external network calls flow through the Gateway via IPC.
3. **RULE 3 — Action Signing.** Every Gateway action is signed and audit-trailed.
4. **RULE 4 — No Telemetry.** Zero analytics or tracking.
5. **RULE 5 — Local Only Data.** All data on-device only.

The Privacy Dashboard and Proof of Privacy are entirely local features. They read from local data stores and produce local outputs. No Gateway involvement. No network access.

---

## Existing Code to Reuse

**From Sprint 1 (Audit Trail):**
- Audit trail SQLite tables — query for action history, action counts by type, timeline data
- Action signing infrastructure — reuse for signing the Proof of Privacy report

**From Sprint 2 (Network Monitor):**
- Network Monitor data — query for connection history, data flow visualization
- The Network Monitor already shows real-time network activity. The Privacy Dashboard provides the historical, comprehensive view.

**From Sprint 1 (Privacy Audit Pipeline):**
- `scripts/privacy-audit/` — the CI pipeline that scans for network imports in core. The Proof of Privacy report can reference the audit methodology and results.

**From Step 26 (Attestation):**
- `packages/core/attestation/attestation-signer.ts` — sign the Proof of Privacy report
- `packages/core/attestation/attestation-format.ts` — JSON-LD format for the attestation

**From All Sprints (Knowledge Graph / Indexers):**
- `packages/core/knowledge/document-store.ts` — `getStats()` for document count
- `packages/core/knowledge/email-indexer.ts` — email count
- `packages/core/knowledge/calendar-indexer.ts` — calendar event count
- `packages/core/knowledge/contacts/contact-store.ts` — contact count
- Any other indexer stats methods for counts by data type

**From Step 25 (Import):**
- Import history — counts of imported browser history, notes, photos metadata, messaging

**From Premium infrastructure:**
- `packages/core/premium/premium-gate.ts` — PremiumGate.isPremium() for Proof of Privacy gating
- `packages/core/extensions/types.ts` — ExtensionInsightTracker

---

## Detailed Specification

### Privacy Dashboard

The Privacy Dashboard is a settings screen accessible from Settings → Privacy & Security → Privacy Dashboard. It provides a comprehensive, real-time view of Semblance's data and behavior.

**Dashboard Sections:**

#### Section 1: Data Inventory
What Semblance knows, organized by category with counts:

```typescript
interface DataInventory {
  emails: { count: number; oldestDate: string; newestDate: string };
  calendarEvents: { count: number; oldestDate: string; newestDate: string };
  documents: { count: number; totalSizeBytes: number };
  contacts: { count: number };
  browserHistory: { count: number; sources: string[] };  // "Chrome", "Firefox"
  notes: { count: number; sources: string[] };            // "Obsidian", "Apple Notes"
  photosMetadata: { count: number };
  messagingHistory: { count: number; sources: string[] };
  financialTransactions: { count: number; dateRange: string };
  healthEntries: { count: number };
  // Total
  totalEntities: number;
  knowledgeGraphNodes: number;
  knowledgeGraphEdges: number;
  embeddingsCount: number;
}
```

Each category shows: count, date range, storage size, and a "View Details" link.

#### Section 2: Network Activity Summary
Aggregated view of all network connections Semblance has ever made, pulled from the Network Monitor / audit trail:

```typescript
interface NetworkActivitySummary {
  totalConnections: number;
  connectionsByService: { service: string; count: number; lastUsed: string }[];
  totalDataSentBytes: number;
  totalDataReceivedBytes: number;
  blockedRequests: number;          // Requests rejected by allowlist
  anomaliesDetected: number;        // From anomaly detection
  lastConnectionAt: string;
  // The key insight:
  dataExfiltratedBytes: 0;          // Always 0. This is the point.
  unknownDestinations: 0;           // Always 0. Allowlist-only.
}
```

The "data exfiltrated" and "unknown destinations" fields are always 0 by architectural design. Displaying them as explicit zeros is the statement.

#### Section 3: Action History Summary
Aggregated view of all autonomous actions Semblance has taken:

```typescript
interface ActionHistorySummary {
  totalActions: number;
  actionsByCategory: { category: string; count: number }[];
  actionsByAutonomyTier: { tier: string; count: number }[];
  actionsRequiringApproval: number;
  actionsAutoApproved: number;
  escalations: number;
  witnessAttestationsGenerated: number;
}
```

#### Section 4: Privacy Guarantees
A checklist-style display of the 5 inviolable rules with real-time verification status:

```typescript
interface PrivacyGuarantees {
  rules: PrivacyRule[];
}

interface PrivacyRule {
  name: string;                     // e.g., "Zero Network in AI Core"
  description: string;              // Human-readable explanation
  status: 'verified' | 'unknown';   // Based on last privacy audit run
  lastVerifiedAt: string;
  verificationMethod: string;       // e.g., "Automated import scan on every commit"
}
```

The 5 rules:
1. Zero Network in AI Core — verified by privacy audit pipeline
2. Gateway Only — verified by architecture scan
3. Action Signing — verified by audit trail integrity check
4. No Telemetry — verified by dependency scan
5. Local Only Data — verified by storage location audit

#### Section 5: Comparison Statement
The single most powerful element on the dashboard:

```typescript
interface ComparisonStatement {
  indexed: {
    emails: number;
    calendarEvents: number;
    documents: number;
    contacts: number;
    // ... all categories with counts
    totalDataPoints: number;
    timeSpanMonths: number;         // How long Semblance has been learning
  };
  comparison: string;               // "When you open ChatGPT, it knows nothing."
}
```

**Display format:** "Your Semblance has indexed **14,847 emails**, **2,341 calendar events**, **847 documents**, and **6 months of financial history**. When you open ChatGPT, it knows nothing."

This is not a paragraph. It is a designed element — bold counts, clear contrast, unmistakable message. The Trellis design system should inform the visual treatment.

The Comparison Statement also appears in the **weekly digest** (Step 13 daily digest infrastructure). Add it as a section in the digest output.

### Proof of Privacy Report (Premium)

A cryptographically signed document that attests to Semblance's privacy behavior over a specified time period.

**Report contents:**
1. **Header:** Report title, generation date, device identity, time period covered
2. **Data Inventory:** Same as dashboard Section 1, frozen at generation time
3. **Network Audit:** Complete connection log summary — every service contacted, data sent/received, zero exfiltration
4. **Action Audit:** Autonomous actions taken, approval rates, escalation counts
5. **Privacy Guarantees:** The 5 rules with verification status at generation time
6. **Comparison Statement:** Frozen at generation time
7. **Attestation:** Cryptographic signature proving this report was generated by this Semblance instance at this time

**Report format:**
- Generated as a JSON structure internally
- Signed using AttestationSigner (same infrastructure as Witness)
- The signed report is the artifact — it can be exported as a `.privacy-report.json` file
- The report is designed to be **shareable** — the user might show it to an employer, a client, or post it publicly as proof of their privacy posture

**Verification:** Anyone with the report and the user's public key can verify the report's authenticity and that it hasn't been tampered with. Same verification pattern as Witness attestations.

**Premium gate:** Report generation requires `PremiumGate.isPremium()`. Dashboard viewing is free.

Register `'proof-of-privacy'` as a new PremiumFeature entry (19 → 20 features).

### Weekly Digest Integration

Add the Comparison Statement to the existing weekly/daily digest output (Step 13 infrastructure). The digest already exists — this adds a new section to it.

Find the digest generator and add a comparison statement section that:
1. Queries data inventory for current counts
2. Formats the comparison statement
3. Includes it in the digest output

---

## File Structure

```
packages/core/privacy/
├── types.ts                          # All interfaces: DataInventory, NetworkActivitySummary, etc.
├── privacy-dashboard-provider.ts     # Assembles all dashboard data from various stores
├── data-inventory-collector.ts       # Queries all indexers/stores for counts and stats
├── network-activity-aggregator.ts    # Aggregates Network Monitor / audit trail data
├── action-history-aggregator.ts      # Aggregates action history from audit trail
├── privacy-guarantee-checker.ts      # Verifies the 5 rules and reports status
├── comparison-statement-generator.ts # Generates the comparison statement text
├── proof-of-privacy-generator.ts     # Generates and signs the Proof of Privacy report
├── proof-of-privacy-exporter.ts      # Exports report as .privacy-report.json
├── privacy-tracker.ts                # ExtensionInsightTracker for privacy insights
├── index.ts                          # Barrel exports
```

---

## Commit Strategy

### Commit 1: Types + Data Inventory Collector (6 tests)

- `types.ts` — all interfaces: DataInventory, NetworkActivitySummary, ActionHistorySummary, PrivacyGuarantees, ComparisonStatement, ProofOfPrivacyReport, etc.
- `data-inventory-collector.ts`:
  - Constructor receives all relevant stores via dependency injection (document store, email indexer, calendar indexer, contact store, import history, financial store, health store)
  - `collectInventory()`: queries each store for counts, date ranges, sizes
  - Returns `DataInventory` with all categories populated
  - Handles missing stores gracefully (count = 0 if store unavailable)

**Tests:** tests/core/privacy/data-inventory-collector.test.ts
1. Collects email count from email indexer
2. Collects document count and size from document store
3. Collects calendar event count with date range
4. Collects contact count
5. Returns 0 for stores that are not available
6. Computes total entities across all categories

### Commit 2: Network Activity Aggregator + Action History Aggregator (6 tests)

- `network-activity-aggregator.ts`:
  - Queries audit trail for all Gateway actions (network connections)
  - Aggregates: total connections, connections by service, data sent/received, blocked requests, anomalies
  - `dataExfiltratedBytes` is always 0 (hardcoded — this IS the architecture)
  - `unknownDestinations` is always 0 (hardcoded — allowlist-only)
  
- `action-history-aggregator.ts`:
  - Queries audit trail for all autonomous actions
  - Aggregates: total actions, by category, by autonomy tier, approval vs auto-approved, escalations
  - Includes Witness attestation count from Step 26

**Tests:** tests/core/privacy/network-activity-aggregator.test.ts
1. Aggregates connections by service
2. Counts blocked requests from audit trail
3. Data exfiltrated is always 0
4. Unknown destinations is always 0

**Tests:** tests/core/privacy/action-history-aggregator.test.ts
5. Aggregates actions by category
6. Counts actions by autonomy tier

### Commit 3: Privacy Guarantee Checker (5 tests)

- `privacy-guarantee-checker.ts`:
  - `checkAllGuarantees()`: returns `PrivacyGuarantees` with status for each of the 5 rules
  - Rule 1 (Zero Network in Core): checks last privacy audit result (from CI pipeline or local scan)
  - Rule 2 (Gateway Only): checks audit trail for any non-Gateway network actions (should be 0)
  - Rule 3 (Action Signing): verifies audit trail integrity — checks signature chain
  - Rule 4 (No Telemetry): checks dependency list for known telemetry packages
  - Rule 5 (Local Only Data): verifies all data store paths are local
  - Each check returns 'verified' or 'unknown' (never 'failed' — if architecture is intact, these always pass; 'unknown' means the check couldn't run)

**Tests:** tests/core/privacy/privacy-guarantee-checker.test.ts
1. Rule 1 — returns 'verified' when no network imports found
2. Rule 2 — returns 'verified' when all actions went through Gateway
3. Rule 3 — returns 'verified' when audit trail signatures are valid
4. Rule 4 — returns 'verified' when no telemetry packages found
5. Rule 5 — returns 'verified' when all data paths are local

### Commit 4: Comparison Statement Generator (5 tests)

- `comparison-statement-generator.ts`:
  - `generate(inventory: DataInventory)`: produces the comparison statement
  - Returns structured data (not just a string) — the UI renders it with bold counts and formatting
  - `generateForDigest(inventory: DataInventory)`: produces a plain-text version for the weekly digest
  - Handles edge cases: new user with minimal data, user with massive data, specific category emphasis

```typescript
interface ComparisonStatementOutput {
  // Structured for UI rendering with bold counts
  segments: ComparisonSegment[];
  // Plain text version for digest
  plainText: string;
  // The total data point count
  totalDataPoints: number;
  // How long Semblance has been learning
  timeSpanDescription: string;  // e.g., "6 months", "2 weeks", "1 year"
}

interface ComparisonSegment {
  type: 'text' | 'metric';
  value: string;
  category?: string;     // For metrics: "emails", "calendar events", etc.
  count?: number;         // For metrics: the raw count
}
```

**Tests:** tests/core/privacy/comparison-statement-generator.test.ts
1. Generates statement with correct counts from inventory
2. Segments include both text and metric types
3. Plain text version is human-readable
4. Handles zero-count categories gracefully (omits them)
5. Time span calculated correctly from oldest data point

### Commit 5: Proof of Privacy Generator + Exporter (8 tests)

- `proof-of-privacy-generator.ts`:
  - Constructor receives: data inventory collector, network aggregator, action aggregator, guarantee checker, comparison generator, attestation signer, premium gate, db
  - `initSchema()` — creates `proof_of_privacy_reports` table for report history
  - `generate(timePeriod?: { from: string, to: string })`: assembles full report from all components, signs it
  - Premium-gated: `PremiumGate.isPremium()` required
  - Returns `ProofOfPrivacyReport` with all sections + attestation

- `proof-of-privacy-exporter.ts`:
  - `exportAsJson(report)`: exports as `.privacy-report.json` — pretty-printed, human-readable
  - `verifyReport(reportJson, verificationKey)`: verifies report authenticity (NOT premium-gated — anyone can verify)
  - Report includes all dashboard sections frozen at generation time + cryptographic attestation

```typescript
interface ProofOfPrivacyReport {
  "@context": "https://veridian.run/privacy/v1";
  "@type": "ProofOfPrivacy";
  generatedAt: string;
  deviceId: string;
  timePeriod: { from: string; to: string };
  dataInventory: DataInventory;
  networkAudit: NetworkActivitySummary;
  actionAudit: ActionHistorySummary;
  privacyGuarantees: PrivacyGuarantees;
  comparisonStatement: ComparisonStatementOutput;
  proof: AttestationProof;  // Cryptographic signature
}
```

**Tests:** tests/core/privacy/proof-of-privacy-generator.test.ts
1. Rejects generation when premium gate is inactive
2. Generates report with all sections populated
3. Report is signed with attestation
4. Report includes correct time period
5. Report stored in history table

**Tests:** tests/core/privacy/proof-of-privacy-exporter.test.ts
6. Exports as valid JSON
7. Verification returns valid for authentic report
8. Verification returns invalid for tampered report

### Commit 6: Privacy Dashboard Provider (5 tests)

- `privacy-dashboard-provider.ts`:
  - Constructor receives all component dependencies
  - `getDashboardData()`: assembles complete dashboard from all components
  - Returns: `{ inventory, networkActivity, actionHistory, guarantees, comparisonStatement }`
  - This is the single entry point the UI calls to populate the entire dashboard
  - Caches results for 5 minutes (dashboard doesn't need real-time refresh)

**Tests:** tests/core/privacy/privacy-dashboard-provider.test.ts
1. Returns complete dashboard data with all sections
2. Caches results for 5 minutes
3. Cache invalidates after expiry
4. Handles missing component gracefully (partial dashboard)
5. Comparison statement included in dashboard output

### Commit 7: Weekly Digest Integration + Privacy Tracker (6 tests)

- Modify the existing digest generator (find it in the codebase — likely `packages/core/agent/` or related to Step 13 daily digest):
  - Add comparison statement section to digest output
  - Queries DataInventoryCollector for current counts
  - Formats via ComparisonStatementGenerator.generateForDigest()

- `privacy-tracker.ts` implements `ExtensionInsightTracker`:
  - `generateInsights()`: suggests generating a Proof of Privacy report if user has significant data and hasn't generated one recently (30+ days)
  - Only suggests report generation if `premiumGate.isPremium()`
  - For free users: suggests viewing the Privacy Dashboard if they haven't recently

**Tests:** tests/core/privacy/digest-integration.test.ts
1. Digest includes comparison statement section
2. Comparison statement has correct counts from current data

**Tests:** tests/core/privacy/privacy-tracker.test.ts
3. Suggests Proof of Privacy report when stale (30+ days)
4. Returns empty when not premium (for report suggestion)
5. Suggests dashboard visit for free users with significant data
6. Returns empty when data is minimal (nothing to show)

### Commit 8: Premium Gate + Extension Registration (4 tests)

- Modify `packages/core/premium/premium-gate.ts`: add `'proof-of-privacy'` to PremiumFeature type and FEATURE_TIER_MAP → 'digital-representative' (19 → 20 features)
- Modify `tests/core/premium/premium-gate.test.ts`: update feature count 19 → 20
- Register barrel exports in `index.ts`

**Tests:** tests/core/privacy/premium-gate-integration.test.ts
1. Premium gate blocks proof-of-privacy for free tier
2. Premium gate allows proof-of-privacy for DR tier
3. Privacy Dashboard is accessible without premium (free feature)
4. Comparison Statement is accessible without premium (free feature)

---

## What NOT to Do

1. **Do NOT gate the Privacy Dashboard behind premium.** Privacy visibility is a free feature. Every user deserves to see what their AI knows and that their data is safe. Only the Proof of Privacy report generation is premium.
2. **Do NOT gate the Comparison Statement behind premium.** It's a free feature and a conversion driver — seeing those counts makes users want to protect them, which leads to Digital Representative.
3. **Do NOT make the Proof of Privacy report a data dump.** It should be a designed, shareable artifact. Think of it as something you'd share on social media or show to a security-conscious client. JSON structure with clear sections, not a raw log.
4. **Do NOT add network calls.** The Privacy Dashboard reads from local stores. The Proof of Privacy is generated locally. Nothing leaves the device.
5. **Do NOT hardcode data counts.** All numbers come from actual store queries. The Comparison Statement must reflect real data, not placeholders.
6. **Do NOT skip the cryptographic signature on the Proof of Privacy report.** The signature is what makes it a "proof" and not just a "report." Without the signature, it's just a document anyone could fabricate.
7. **Do NOT merge the Proof of Privacy report into the knowledge graph.** Reports are stored in their own table (`proof_of_privacy_reports`) and exported as standalone files.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Dashboard data structure and section organization
- Comparison statement wording and formatting
- Report JSON structure beyond what's specified
- Cache duration for dashboard data
- Digest integration approach (finding the right insertion point)
- Privacy guarantee check implementations (the checks themselves are straightforward)

You MUST escalate for:
- Any network calls from privacy module code
- Any change to the audit trail format
- Any change to the attestation signing approach
- Any new external dependency
- Any modification to the privacy audit pipeline
- Any decision to gate dashboard features behind premium

---

## Repo Enforcement Check

Before committing, verify:

```bash
# No network imports in privacy module
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bdns\b\|import.*\bfetch\b" packages/core/privacy/ --include="*.ts"  # Must be empty

# No DR imports in core
grep -rn "from.*@semblance/dr" packages/core/ --include="*.ts"  # Must be empty

# Premium gate
grep -n "'proof-of-privacy'" packages/core/premium/premium-gate.ts  # Must exist

# All tests pass
npx tsc --noEmit && npx vitest run
```

---

## Exit Criteria Checklist

From `SEMBLANCE_BUILD_MAP_ELEVATION.md`:

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Privacy Dashboard shows full data inventory with accurate counts | Test: collector returns correct counts from all stores |
| 2 | Network activity summary shows all connections, zero exfiltration | Test: aggregator shows connections by service, exfiltrated = 0 |
| 3 | Action history summary shows autonomous actions by category/tier | Test: aggregator counts by category and autonomy tier |
| 4 | Privacy guarantees show 5 rules with verification status | Test: all 5 rules return 'verified' when architecture intact |
| 5 | Comparison Statement shows indexed counts vs cloud AI | Test: generates structured statement with correct counts |
| 6 | Comparison Statement appears in weekly digest | Test: digest output includes comparison section |
| 7 | Proof of Privacy report generates with all sections | Test: report contains inventory, network, actions, guarantees, comparison |
| 8 | Proof of Privacy report is cryptographically signed | Test: report has valid attestation, verifiable with public key |
| 9 | Proof of Privacy report is exportable as .privacy-report.json | Test: export produces valid JSON file |
| 10 | Proof of Privacy is premium-gated, dashboard is free | Test: gate blocks report for free, dashboard accessible to all |
| 11 | Report verification works without premium (public good) | Test: verification returns valid/invalid without premium check |
| 12 | 50+ new tests. All existing tests pass. Privacy audit clean. | `npx vitest run` — 3,463+ total, 0 failures. `npx tsc --noEmit` clean. |

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 6 | 6 |
| 2 | 6 | 12 |
| 3 | 5 | 17 |
| 4 | 5 | 22 |
| 5 | 8 | 30 |
| 6 | 5 | 35 |
| 7 | 6 | 41 |
| 8 | 4 | 45 |

**Total: 45 new tests. Baseline + new = 3,418 + 45 = 3,463.**

*Note: This is slightly below the 50+ target in the exit criteria. If Claude Code finds natural places to add coverage (e.g., edge cases in the comparison statement, additional guarantee checks), aim for 50+. The exit criterion is 50+, not 45.*

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,463+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. Which existing modules were reused (with file paths)
5. Exit criteria checklist — each criterion (all 12) with PASS/FAIL and evidence
6. Repo enforcement check results
7. Confirmation that Privacy Dashboard and Comparison Statement are NOT premium-gated
8. Confirmation that digest integration works (comparison statement in digest output)
