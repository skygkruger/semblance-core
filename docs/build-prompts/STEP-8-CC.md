# Sprint 2 — Step 8: Network Monitor + Task Routing Foundation + Sprint 2 Validation

## Implementation Prompt for Claude Code

**Date:** February 21, 2026
**Prerequisite:** Steps 1–7 complete (1,022 tests passing, privacy audit clean)
**Test Baseline:** 1,022 passing tests, privacy audit exit 0
**Sprint 2 Step Sequence:** Step 5 ✅ → Step 5B ✅ → Step 6 ✅ → Step 7 ✅ → **Step 8 (this — FINAL)**

---

## Read First

Before writing any code, read these files in order:

1. `CLAUDE.md` — Architecture rules, IPC protocol, boundary rules, autonomy framework
2. `docs/DESIGN_SYSTEM.md` — Visual reference for all UI work
3. `packages/gateway/` — Gateway architecture, allowlist, action signing, audit trail
4. `packages/core/types/ipc.ts` — IPC protocol types (expanded in Steps 5B, 6)
5. `packages/gateway/adapters/` — IMAP, SMTP, CalDAV adapters
6. `packages/gateway/security/` — Action signing and audit trail
7. `packages/desktop/src/screens/` — All existing screens (Inbox, Onboarding, Digest)
8. `packages/desktop/src/screens/OnboardingScreen.tsx` — Autonomy tier selection UI
9. `packages/core/agent/autonomy-escalation.ts` — Escalation engine (Step 7)
10. `packages/core/digest/weekly-digest.ts` — Digest generator (Step 7)

---

## Mission

This is the final Sprint 2 step. It delivers the last exit criterion (Network Monitor), lays the task routing foundation for mobile, and runs the full Sprint 2 validation suite.

When this step is complete, Sprint 2 is closed. All 8 exit criteria are met. The product is ready for Sprint 3.

Three deliverables:

1. **Network Monitor Dashboard** — A real-time, always-accessible display of every outbound connection Semblance makes. Visible on the main dashboard, not buried in settings. Shows allowlisted services, connection counts, data volumes, and a prominent "zero unauthorized connections" status. This is the trust proof. It's how the user (and journalists, and security researchers) verify that the privacy architecture is real.

2. **Task Routing Foundation** — The protocol and data model for intelligent mobile↔desktop task routing. This step builds the routing framework, device capability registry, and task delegation protocol. Full mobile feature parity is Sprint 3 — this step delivers the plumbing so Sprint 3 can wire it up.

3. **Sprint 2 Validation** — End-to-end verification that all 8 exit criteria are met. Integration tests that validate the complete user journey: install → onboard → Knowledge Moment → email triage → calendar management → subscription detection → escalation prompt → weekly digest → Network Monitor green.

---

## Architecture Constraints — Absolute

Same rules. Same enforcement. Non-negotiable.

- **AI Core has ZERO network access.** The Network Monitor reads from the Gateway's audit trail — it does NOT perform network operations itself.
- **All external calls flow through the Gateway.**
- **Every action is signed, logged, and auditable.**
- **Autonomy tiers are enforced.**
- **Privacy audit must pass.** Exit 0 or the step fails.

**Critical note for Network Monitor:** The monitor reads the Gateway's audit trail (which already logs every outbound connection). It does NOT intercept network traffic or install packet-level monitoring. It reads structured log data that the Gateway already produces. The only new component is the UI that displays this data and the query interface that aggregates it.

---

## A. Network Monitor Dashboard

**Location:** `packages/desktop/src/screens/NetworkMonitorScreen.tsx` (new file), `packages/gateway/monitor/` (new directory)

### A1. Gateway Monitor Service

The Gateway already logs every action to the audit trail. The Network Monitor adds a query layer on top of that audit trail, plus real-time connection tracking.

```typescript
// packages/gateway/monitor/network-monitor.ts

interface NetworkMonitor {
  /** Get current connection status — what services are connected right now */
  getActiveConnections(): Promise<ActiveConnection[]>;
  
  /** Get connection history for a time period */
  getConnectionHistory(options: HistoryOptions): Promise<ConnectionRecord[]>;
  
  /** Get aggregate statistics */
  getStatistics(period: 'today' | 'week' | 'month' | 'all'): Promise<NetworkStatistics>;
  
  /** Get the allowlist of authorized services */
  getAllowlist(): Promise<AllowlistEntry[]>;
  
  /** Check for unauthorized connection attempts (should always be zero) */
  getUnauthorizedAttempts(period?: string): Promise<UnauthorizedAttempt[]>;
}

interface ActiveConnection {
  id: string;
  service: string;               // 'imap.gmail.com', 'smtp.gmail.com', 'caldav.google.com'
  protocol: string;              // 'IMAP', 'SMTP', 'CalDAV', 'HTTPS'
  connectedSince: string;        // ISO 8601
  status: 'active' | 'idle' | 'reconnecting';
  bytesIn: number;
  bytesOut: number;
  lastActivity: string;
}

interface ConnectionRecord {
  id: string;
  timestamp: string;
  service: string;
  protocol: string;
  direction: 'outbound';         // Always outbound — Gateway never accepts inbound
  action: string;                // 'email.fetch', 'email.send', 'calendar.fetch', etc.
  bytesTransferred: number;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  requestId: string;             // Links to the audit trail entry
}

interface NetworkStatistics {
  period: string;
  totalConnections: number;
  totalBytesIn: number;
  totalBytesOut: number;
  connectionsByService: Record<string, number>;
  connectionsByAction: Record<string, number>;
  unauthorizedAttempts: number;   // MUST be zero
  uniqueServicesContacted: number;
  averageConnectionDurationMs: number;
}

interface AllowlistEntry {
  service: string;               // user-friendly name: 'Gmail', 'Google Calendar'
  domain: string;                // 'imap.gmail.com'
  protocol: string;
  addedAt: string;
  addedBy: 'user' | 'onboarding'; // how it got on the allowlist
  connectionCount: number;       // how many times used
  lastUsed: string;
}

interface UnauthorizedAttempt {
  timestamp: string;
  requestedDomain: string;
  requestedAction: string;
  reason: string;                // 'domain_not_on_allowlist', 'schema_validation_failed', etc.
  blocked: true;                 // Always true — unauthorized requests are ALWAYS blocked
}
```

### A2. Audit Trail Query Extensions

The Gateway's audit trail (`packages/gateway/audit/`) already stores every action. Add query methods for the Network Monitor:

```typescript
// packages/gateway/audit/audit-query.ts (new file or extend existing)

interface AuditQuery {
  /** Query audit entries by time range */
  getEntries(options: {
    after?: string;
    before?: string;
    action?: string;
    service?: string;
    status?: 'success' | 'error';
    limit?: number;
    offset?: number;
  }): Promise<AuditEntry[]>;
  
  /** Count entries matching criteria */
  count(options: Omit<typeof options, 'limit' | 'offset'>): Promise<number>;
  
  /** Aggregate bytes transferred by service */
  aggregateByService(period: 'today' | 'week' | 'month'): Promise<ServiceAggregate[]>;
  
  /** Get timeline data for chart rendering */
  getTimeline(options: {
    period: 'today' | 'week' | 'month';
    granularity: 'hour' | 'day';
  }): Promise<TimelinePoint[]>;
}

interface TimelinePoint {
  timestamp: string;
  connections: number;
  bytesIn: number;
  bytesOut: number;
}
```

### A3. Network Monitor UI

**Design principle from canonical docs:** "Not buried in settings. Visible on the main dashboard." The Network Monitor is a first-class screen in the sidebar, AND it has a persistent status indicator on every screen.

#### A3a. Persistent Status Indicator

A small, always-visible indicator in the app header or sidebar footer:

```
┌─── Status Bar (always visible) ─────────────────────────┐
│  🟢 0 unauthorized connections · 3 services active      │
└──────────────────────────────────────────────────────────┘
```

- Green dot + "0 unauthorized connections" when clean (this is the expected permanent state)
- Red dot + "⚠️ N unauthorized attempts blocked" if any blocked attempts exist (should never happen in production, but must be visible if it does)
- Click opens the full Network Monitor screen
- The indicator is present on EVERY screen — Inbox, Chat, Digest, Settings, Onboarding (post-setup)

**Design system compliance:**
- Green dot: `--color-success`
- Red dot: `--color-attention`
- Text: `--color-text-secondary`, small font (`--font-size-sm`)
- Background: transparent, blends with header/sidebar

#### A3b. Full Network Monitor Screen

```
┌─────────────────────────────────────────────────────────────┐
│  Network Monitor                                             │
│                                                              │
│  ┌── Trust Status ───────────────────────────────────────┐  │
│  │                                                        │  │
│  │  🟢 Zero unauthorized connections                     │  │
│  │                                                        │  │
│  │  Your Semblance has contacted only the services you    │  │
│  │  authorized. No data has been sent anywhere else.      │  │
│  │  Ever.                                                 │  │
│  │                                                        │  │
│  │  [Generate Proof of Privacy Report]                   │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Active Connections ─────────────────────────────────┐  │
│  │                                                        │  │
│  │  Gmail (IMAP)         🟢 Connected · idle             │  │
│  │  imap.gmail.com       ↓ 2.1 MB  ↑ 45 KB  · 3h ago   │  │
│  │                                                        │  │
│  │  Gmail (SMTP)         ⚪ Disconnected                  │  │
│  │  smtp.gmail.com       Last used: 1h ago               │  │
│  │                                                        │  │
│  │  Google Calendar       🟢 Connected · idle            │  │
│  │  caldav.google.com    ↓ 340 KB  ↑ 12 KB  · 15m ago  │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Today's Activity ───────────────────────────────────┐  │
│  │                                                        │  │
│  │  ██████░░░░░░░░░░░░░░░░░░  12 connections             │  │
│  │  8am   10am   12pm   2pm   4pm   6pm                  │  │
│  │                                                        │  │
│  │  By Service:                                           │  │
│  │  Gmail (IMAP)     ████████████  8 connections          │  │
│  │  Google Calendar  ███           3 connections          │  │
│  │  Gmail (SMTP)     █             1 connection           │  │
│  │                                                        │  │
│  │  Total data: ↓ 2.5 MB received · ↑ 57 KB sent        │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Authorized Services ────────────────────────────────┐  │
│  │                                                        │  │
│  │  ✅ Gmail            imap.gmail.com, smtp.gmail.com   │  │
│  │     Added during onboarding · 847 connections total   │  │
│  │                                                        │  │
│  │  ✅ Google Calendar  caldav.google.com                │  │
│  │     Added during onboarding · 234 connections total   │  │
│  │                                                        │  │
│  │  That's it. No other services have been contacted.    │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Connection Log ─────────────────────────────────────┐  │
│  │                                                        │  │
│  │  2:34 PM  email.fetch    imap.gmail.com  ↓ 12 KB  ✓  │  │
│  │  2:19 PM  calendar.fetch caldav.google   ↓ 4 KB   ✓  │  │
│  │  2:04 PM  email.fetch    imap.gmail.com  ↓ 8 KB   ✓  │  │
│  │  1:49 PM  email.send     smtp.gmail.com  ↑ 3 KB   ✓  │  │
│  │  1:34 PM  email.fetch    imap.gmail.com  ↓ 15 KB  ✓  │  │
│  │  ...                                                   │  │
│  │  [View full audit trail →]                            │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Design system compliance:**
- Trust Status box: `--color-surface-1` background with `--color-success` left border (3px). Large green circle icon.
- Active Connections: service names in `--color-text-primary`, domains in `--color-text-tertiary`, data transfer in `--color-text-secondary`. Green/gray status dots.
- Activity chart: `--color-primary` bars on `--color-surface-2` background. Simple histogram, not fancy — clarity over decoration.
- Connection log: monospace font for timestamps, `--color-text-secondary` for details, green checkmark for success, red × for errors.
- "That's it. No other services have been contacted." — This is the key privacy statement. In `--color-text-primary`, slightly larger than surrounding text.
- "Generate Proof of Privacy Report" — primary button style.

#### A3c. Proof of Privacy Report

The report is a human-readable summary of network activity over a user-selected period. It includes:

1. Header with period covered, device name, app version
2. Total connections made, services contacted, data volumes
3. Unauthorized attempts: count (should be 0), details if any
4. Full list of authorized services and their usage
5. Statement: "During this period, all network activity was limited to user-authorized services. No data was transmitted to unauthorized destinations."
6. Hash of the audit trail entries covered (for tamper-evidence verification)

**Format:** Generate as a structured JSON file that can be independently verified, plus a human-readable text/HTML summary. The cryptographic signing of the report is Sprint 4 scope (requires the full Privacy Dashboard with Proof of Privacy infrastructure). For Sprint 2, the report is a structured export of the audit trail with a summary — not yet cryptographically signed.

```typescript
// packages/gateway/monitor/privacy-report.ts

interface PrivacyReportGenerator {
  /** Generate a privacy report for a time period */
  generate(options: {
    startDate: string;
    endDate: string;
    format: 'json' | 'text' | 'html';
  }): Promise<PrivacyReport>;
}

interface PrivacyReport {
  metadata: {
    generatedAt: string;
    period: { start: string; end: string };
    appVersion: string;
    deviceId: string;              // anonymized device identifier
  };
  summary: {
    totalConnections: number;
    authorizedServices: string[];
    unauthorizedAttempts: number;
    totalBytesIn: number;
    totalBytesOut: number;
  };
  services: Array<{
    name: string;
    domain: string;
    connectionCount: number;
    totalBytes: number;
    firstConnection: string;
    lastConnection: string;
  }>;
  auditTrailHash: string;         // SHA-256 of all audit entries in period
  statement: string;              // human-readable privacy statement
}
```

### A4. Sidecar Bridge Extensions

```typescript
// New sidecar commands for Network Monitor
'network:getActiveConnections'     → NetworkMonitor.getActiveConnections()
'network:getStatistics'            → NetworkMonitor.getStatistics(period)
'network:getAllowlist'             → NetworkMonitor.getAllowlist()
'network:getUnauthorizedAttempts'  → NetworkMonitor.getUnauthorizedAttempts(period)
'network:getConnectionHistory'     → NetworkMonitor.getConnectionHistory(options)
'network:getTimeline'             → AuditQuery.getTimeline(options)
'network:generateReport'          → PrivacyReportGenerator.generate(options)
```

**New Tauri commands in `lib.rs`:**

```rust
#[tauri::command]
async fn get_active_connections() -> Result<Vec<ActiveConnection>, String>

#[tauri::command]
async fn get_network_statistics(period: String) -> Result<NetworkStatistics, String>

#[tauri::command]
async fn get_allowlist() -> Result<Vec<AllowlistEntry>, String>

#[tauri::command]
async fn get_unauthorized_attempts(period: Option<String>) -> Result<Vec<UnauthorizedAttempt>, String>

#[tauri::command]
async fn get_connection_timeline(period: String, granularity: String) -> Result<Vec<TimelinePoint>, String>

#[tauri::command]
async fn generate_privacy_report(start_date: String, end_date: String, format: String) -> Result<PrivacyReport, String>
```

---

## B. Task Routing Foundation

**Location:** `packages/core/routing/` (new directory)

### B1. Scope — Foundation Only

The Sprint 2 build map lists "Task routing between mobile and desktop devices" as a deliverable. Sprint 3 delivers "Mobile feature parity for all Sprint 2 features." Step 8 builds the routing framework — the protocol, capability registry, and task delegation model. It does NOT build the mobile implementation of Sprint 2 features.

What this step delivers:
- Device capability registry (what each device can do)
- Task complexity assessment (what resources a task needs)
- Routing decision engine (match task to device)
- Cross-device communication protocol (how devices coordinate)

What this step does NOT deliver:
- Actual mobile implementations of email/calendar/subscription features (Sprint 3)
- Real-time sync between devices (Sprint 3)
- Mobile-specific UI for Sprint 2 features (Sprint 3)

### B2. Device Capability Registry

```typescript
// packages/core/routing/device-registry.ts

interface DeviceRegistry {
  /** Register a device's capabilities */
  register(device: DeviceCapabilities): Promise<void>;
  
  /** Update capabilities (e.g., when battery or connectivity changes) */
  update(deviceId: string, updates: Partial<DeviceCapabilities>): Promise<void>;
  
  /** Get all registered devices */
  getDevices(): Promise<DeviceCapabilities[]>;
  
  /** Get the device best suited for a task */
  getBestDevice(requirements: TaskRequirements): Promise<DeviceCapabilities | null>;
}

interface DeviceCapabilities {
  id: string;
  name: string;                    // "Sky's MacBook Pro", "Sky's iPhone"
  type: 'desktop' | 'mobile';
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android';
  
  // Compute capabilities
  llmRuntime: 'ollama' | 'mlx' | 'llamacpp' | null;
  maxModelSize: string;            // '7B', '13B', '70B', '3B'
  gpuAvailable: boolean;
  ramGB: number;
  
  // Connectivity
  isOnline: boolean;
  lastSeen: string;
  networkType: 'wifi' | 'cellular' | 'ethernet' | 'offline';
  
  // Power
  batteryLevel: number | null;     // null for plugged-in desktops
  isCharging: boolean;
  
  // Available features
  features: string[];              // ['email', 'calendar', 'files', 'subscriptions']
  
  // Current load
  activeTasks: number;
  inferenceActive: boolean;
}
```

### B3. Task Complexity Assessment

```typescript
// packages/core/routing/task-assessor.ts

interface TaskAssessor {
  /** Assess what resources a task needs */
  assess(task: TaskDescription): TaskRequirements;
}

interface TaskDescription {
  type: string;                    // 'email.categorize', 'meeting_prep', 'subscription_detect'
  dataSize?: number;               // approximate input size in bytes
  urgency: 'immediate' | 'background' | 'scheduled';
  requiresNetwork: boolean;
  requiresLLM: boolean;
  estimatedInferenceTokens?: number;
}

interface TaskRequirements {
  minRAM: number;                  // GB
  minModelSize: string;            // '3B', '7B', etc.
  requiresGPU: boolean;
  requiresNetwork: boolean;
  estimatedDurationMs: number;
  estimatedBatteryImpact: 'low' | 'medium' | 'high';
  canRunOnMobile: boolean;         // derived from requirements
  canRunOnDesktop: boolean;        // always true
  preferredDevice: 'desktop' | 'mobile' | 'either';
}
```

### B4. Routing Decision Engine

```typescript
// packages/core/routing/router.ts

interface TaskRouter {
  /** Route a task to the best available device */
  route(task: TaskDescription): Promise<RoutingDecision>;
  
  /** Check if a specific device can handle a task */
  canHandle(deviceId: string, task: TaskDescription): Promise<boolean>;
}

interface RoutingDecision {
  targetDevice: DeviceCapabilities;
  reason: string;                  // "Desktop selected: task requires 7B model, mobile only supports 3B"
  confidence: number;              // 0-1
  alternatives: Array<{
    device: DeviceCapabilities;
    reason: string;                // why this wasn't selected
  }>;
}
```

### B5. Task Routing Rules

The routing engine follows these rules in priority order:

1. **Network requirement:** If the task requires network access (email fetch, calendar sync), it MUST route to a device with Gateway access. Currently only desktop has Gateway.
2. **Model size:** If the task requires a model larger than the device supports, route to a device with sufficient model capacity.
3. **Battery:** If mobile battery is below 20% and task is background/non-urgent, prefer desktop.
4. **Connectivity:** If mobile is on cellular and task involves large data transfer, prefer desktop on wifi/ethernet.
5. **Current load:** If one device is already running inference, prefer the idle device for new tasks.
6. **Urgency:** Immediate tasks route to whichever device is currently active (has user attention). Background tasks prefer desktop.
7. **Default:** When requirements are equal, prefer desktop (more compute, more reliable power).

These rules are configurable. Users can override with per-task-type preferences in Settings.

### B6. Cross-Device Communication Protocol

For Sprint 2, the cross-device protocol is defined but not fully implemented. The protocol uses local network discovery (mDNS/Bonjour) for device-to-device communication on the same network, with an optional relay for remote routing (Sprint 3+).

```typescript
// packages/core/routing/protocol.ts

interface TaskDelegationProtocol {
  /** Discover devices on the local network */
  discoverDevices(): Promise<DiscoveredDevice[]>;
  
  /** Delegate a task to another device */
  delegateTask(deviceId: string, task: TaskDescription, payload: any): Promise<DelegationResult>;
  
  /** Check status of a delegated task */
  checkStatus(delegationId: string): Promise<DelegationStatus>;
  
  /** Receive a delegated task (called on the target device) */
  receiveTask(delegation: IncomingDelegation): Promise<void>;
}

type DelegationStatus = 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled';
```

**Sprint 2 scope:** Define the protocol interfaces and implement the device registry and task assessor. The actual delegation (sending tasks between devices) is Sprint 3 — it requires the mobile app to have the features that tasks would be routed to.

### B7. Data Storage

```typescript
// SQLite tables
interface StoredDevice {
  id: string;
  name: string;
  type: string;
  platform: string;
  capabilities: string;           // JSON-serialized DeviceCapabilities
  lastSeen: string;
  registeredAt: string;
}

interface StoredRoutingDecision {
  id: string;
  taskType: string;
  targetDeviceId: string;
  reason: string;
  timestamp: string;
}
```

---

## C. Sprint 2 Integration Polish

Before the validation suite runs, ensure these cross-cutting concerns are solid:

### C1. Autonomy Default Enforcement

**Verify** that the onboarding flow defaults to Partner mode (pre-selected), NOT Guardian. This is a locked-in canonical decision.

- Check `OnboardingScreen.tsx` — Partner tier radio/toggle must be pre-selected
- Check user preferences initialization — new users start at Partner for email and calendar domains
- Check `CLAUDE.md` or equivalent — Guardian for finances/legal, Partner for email/calendar/health
- The autonomy tier selection screen must show: Guardian (available, not default) → Partner (pre-selected, recommended) → Alter Ego (available, aspirational)

### C2. Trust Flywheel Verification

Verify the complete trust flywheel chain works end-to-end:

1. Semblance takes an action (Partner mode auto-executes routine email categorization)
2. Action appears in the action log with full context (what, why, when, data used)
3. User can review and verify the action was correct
4. After 10 consecutive approvals of the same type in Guardian mode (or 14 days clean in Partner), escalation prompt appears
5. User accepts escalation → tier updates → more actions execute autonomously
6. Actions accumulate → weekly digest shows time saved

### C3. Sidebar Navigation

Ensure the sidebar/navigation includes all screens:

- **Chat** (existing) — Primary AI conversation
- **Inbox** (Step 6) — Universal Inbox with Priority/Email/Calendar/Actions
- **Digest** (Step 7) — Weekly digest with time saved
- **Network** (Step 8) — Network Monitor with trust status
- **Settings** (existing) — Preferences, data connections, autonomy configuration

The Network Monitor's persistent status indicator appears in the header/sidebar footer on ALL screens.

### C4. Onboarding Flow Completeness

The complete onboarding flow after Step 8:

1. **Welcome + Naming** — User names their Semblance. Warm Amber.
2. **Data Connection** — Connect email, calendar, files. Privacy indicators.
3. **Indexing + Knowledge Moment** — Initial index runs → compound knowledge demonstration fires (Step 7)
4. **First Autonomous Action** — Semblance categorizes/archives routine emails immediately (Step 7)
5. **Autonomy Selection** — Guardian / Partner (pre-selected) / Alter Ego (Step 7 + this verification)
6. **Ready** — "[Name] is ready. Here's what I've already done:" — shows completed actions

Verify the flow is complete, transitions are smooth, and the Knowledge Moment fires correctly when email + calendar are connected.

---

## D. Sprint 2 Validation Suite

### D1. Exit Criteria Verification Tests

Create a dedicated integration test file that verifies each Sprint 2 exit criterion:

```typescript
// tests/integration/sprint2-exit-criteria.test.ts

describe('Sprint 2 Exit Criteria', () => {
  
  // Exit Criterion 1: Action count
  describe('EC1: Autonomous action capability', () => {
    it('Orchestrator can execute email categorize action in Partner mode', ...);
    it('Orchestrator can execute email archive action in Partner mode', ...);
    it('Orchestrator can execute email draft action', ...);
    it('Orchestrator can execute email send action', ...);
    it('Orchestrator can execute calendar conflict detection', ...);
    it('Orchestrator can execute meeting prep generation', ...);
    it('Subscription detector identifies recurring charges', ...);
    it('Follow-up reminder generates for unanswered emails', ...);
    it('Deadline detector fires for approaching deadlines', ...);
    it('At least 10 distinct action types are available', ...);
  });

  // Exit Criterion 2: Time quantification
  describe('EC2: Time-saved tracking', () => {
    it('Every action type has an estimatedTimeSavedSeconds value', ...);
    it('Weekly digest aggregates time-saved correctly', ...);
    it('Digest formats time-saved as human-readable string', ...);
    it('Digest narrative includes time-saved number', ...);
  });

  // Exit Criterion 3: Knowledge Moment
  describe('EC3: Knowledge Moment', () => {
    it('Knowledge Moment generates compound insight from meeting + emails + docs', ...);
    it('Knowledge Moment falls back to email-only when no meetings', ...);
    it('Knowledge Moment falls back to files-only when no email/calendar', ...);
    it('Knowledge Moment includes suggested action', ...);
    it('Knowledge Moment displays in onboarding flow', ...);
  });

  // Exit Criterion 4: Email is active
  describe('EC4: Active email handling', () => {
    it('Partner mode auto-categorizes emails without approval', ...);
    it('Partner mode auto-archives low-priority emails', ...);
    it('Partner mode drafts responses for substantive emails', ...);
    it('Guardian mode requires approval for all email actions', ...);
    it('Alter Ego mode sends routine replies automatically', ...);
  });

  // Exit Criterion 5: Calendar is active
  describe('EC5: Active calendar', () => {
    it('Conflict detection identifies overlapping events', ...);
    it('Meeting prep generates for upcoming meetings with attendees', ...);
    it('Partner mode resolves scheduling conflicts autonomously', ...);
  });

  // Exit Criterion 6: Subscription detection
  describe('EC6: Subscription detection', () => {
    it('CSV parser handles standard bank statement format', ...);
    it('OFX parser extracts transactions correctly', ...);
    it('Recurring detector identifies monthly subscriptions', ...);
    it('Forgotten subscriptions flagged based on email absence', ...);
    it('Annual cost estimate is calculated correctly', ...);
    it('Subscription insight card renders in inbox', ...);
  });

  // Exit Criterion 7: Autonomy escalation
  describe('EC7: Natural autonomy escalation', () => {
    it('Partner is the default tier for email domain', ...);
    it('Partner is the default tier for calendar domain', ...);
    it('Guardian is the default tier for finance domain', ...);
    it('Escalation triggers after 10 consecutive Guardian approvals', ...);
    it('Escalation prompt includes concrete behavior preview', ...);
    it('Accepting escalation updates the tier and logs to audit trail', ...);
    it('Dismissal starts cooldown — no re-prompt within window', ...);
  });

  // Exit Criterion 8: Network Monitor
  describe('EC8: Network Monitor', () => {
    it('Network Monitor shows active connections', ...);
    it('Network Monitor shows zero unauthorized attempts', ...);
    it('Statistics aggregate correctly from audit trail', ...);
    it('Allowlist shows only user-authorized services', ...);
    it('Privacy report generates with correct summary', ...);
    it('Persistent status indicator renders on all screens', ...);
  });
});
```

### D2. End-to-End Journey Test

A narrative integration test that walks through the complete user journey:

```typescript
// tests/integration/sprint2-journey.test.ts

describe('Sprint 2 Complete User Journey', () => {
  it('Full journey: onboard → inbox → subscribe → escalate → digest → network', async () => {
    // 1. Onboarding
    //    - Name the AI
    //    - Connect email (mock IMAP)
    //    - Connect calendar (mock CalDAV)
    //    - Wait for indexing
    
    // 2. Knowledge Moment fires
    //    - Verify compound insight generated
    //    - Verify suggested action available
    
    // 3. First Autonomous Action
    //    - Verify routine emails categorized
    //    - Verify newsletter archived (Partner mode default)
    
    // 4. Autonomy Selection
    //    - Verify Partner is pre-selected
    //    - Confirm selection
    
    // 5. Universal Inbox
    //    - Priority section shows proactive insights
    //    - Email section shows categorized messages
    //    - Calendar section shows today's events
    //    - Actions Taken section shows autonomous actions
    
    // 6. Subscription Detection
    //    - Import mock bank statement
    //    - Verify recurring charges detected
    //    - Verify forgotten subscriptions flagged
    //    - Verify insight card appears in inbox
    
    // 7. Autonomy Escalation
    //    - Simulate 10 consecutive Guardian approvals
    //    - Verify escalation prompt appears
    //    - Accept escalation
    //    - Verify tier updated
    
    // 8. Weekly Digest
    //    - Trigger digest generation
    //    - Verify action counts correct
    //    - Verify time-saved calculated
    //    - Verify narrative generated
    
    // 9. Network Monitor
    //    - Verify zero unauthorized connections
    //    - Verify authorized services listed
    //    - Verify connection log populated
    //    - Generate privacy report
    //    - Verify report is accurate
    
    // 10. Privacy Audit
    //     - Run full privacy audit
    //     - Verify exit 0
  });
});
```

---

## Testing Requirements

### New Test Suites

| Test Suite | Location | What It Validates |
|------------|----------|-------------------|
| **Network Monitor service** | `tests/gateway/network-monitor.test.ts` | Active connections, history queries, statistics aggregation, allowlist management, unauthorized attempt detection |
| **Audit trail queries** | `tests/gateway/audit-query.test.ts` | Time range queries, service aggregation, timeline generation, count queries |
| **Privacy report** | `tests/gateway/privacy-report.test.ts` | Report generation in all formats, correct summary, audit trail hash, period filtering |
| **Network Monitor UI** | `tests/desktop/network-monitor.test.ts` | Trust status display, active connections list, activity chart, authorized services, connection log, persistent status indicator |
| **Device registry** | `tests/core/device-registry.test.ts` | Device registration, capability updates, best device selection, multi-device scenarios |
| **Task assessor** | `tests/core/task-assessor.test.ts` | Requirements assessment for each task type, mobile compatibility checks, battery impact estimation |
| **Task router** | `tests/core/task-router.test.ts` | Routing rules priority order, network requirement enforcement, battery threshold, model size matching, load balancing |
| **Sprint 2 exit criteria** | `tests/integration/sprint2-exit-criteria.test.ts` | All 8 exit criteria verified with specific test cases |
| **Sprint 2 journey** | `tests/integration/sprint2-journey.test.ts` | End-to-end user journey from onboarding through network monitor |
| **Autonomy defaults** | `tests/integration/autonomy-defaults.test.ts` | Partner pre-selected in onboarding, per-domain defaults correct, escalation thresholds respected |

### Test Target

Expect approximately 80–100 new tests. The total should reach approximately 1,100–1,120 tests passing.

### Existing Test Baseline

- All 1,022 existing tests must continue to pass
- Privacy audit must pass (exit 0)
- No regressions in Steps 5B/6/7 functionality

---

## What This Step Does NOT Include

| Feature | Ships In | Why Not Now |
|---------|----------|-------------|
| Cryptographically signed Proof of Privacy report | Sprint 4 | Requires full Privacy Dashboard infrastructure |
| Real-time packet-level network monitoring | Never | Audit trail approach is architecturally cleaner and more trustworthy |
| Actual task delegation between devices | Sprint 3 | Requires mobile feature implementations to exist first |
| Local network device discovery (mDNS) | Sprint 3 | Protocol defined here, implementation when mobile is ready |
| Mobile feature parity | Sprint 3 | Sprint 2 is desktop-first |
| IMAP IDLE push notifications | Future | Polling sufficient |
| OS-level sandboxing (App Sandbox, seccomp) | Sprint 4 | Configuration, not code — done during launch prep |
| Reproducible builds | Sprint 4 | CI/CD infrastructure |

---

## Escalation Triggers

Stop and escalate to Orbital Directors if:

- The audit trail query layer requires schema changes to the existing audit trail tables
- The Network Monitor needs to access data outside the Gateway's audit trail
- The privacy report format needs cryptographic signing infrastructure (push to Sprint 4)
- Task routing requires a networking library in the Core package (NEVER — escalate immediately)
- You discover the persistent status indicator requires changes to the app shell layout that affect all screens
- The Sprint 2 validation tests reveal a gap in any exit criterion that requires architectural changes

---

## Autonomous Decision Authority

You may proceed without escalating for:

- Network Monitor UI layout details within the design system
- Audit trail query optimization (indexes, pagination)
- Privacy report text/HTML formatting
- Device capability threshold values (battery, RAM, model size)
- Task routing rule priority ordering
- Connection log display format and pagination
- Activity chart granularity and rendering approach
- Test fixture data for mock connections and devices
- SQLite schema for device registry and routing decisions
- Status indicator placement details (header vs sidebar footer)
- Sprint 2 validation test case details

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

1. **Audit trail query extensions** — Add query methods to existing Gateway audit trail. Test with mock entries. Foundation for everything else.
2. **Network Monitor service** — Build on audit queries. Active connections, statistics, allowlist, unauthorized attempt detection.
3. **Privacy report generator** — Structured export of audit trail with summary. JSON + text formats.
4. **Network Monitor UI** — Full screen with trust status, active connections, activity chart, authorized services, connection log.
5. **Persistent status indicator** — Always-visible indicator on all screens. Wire to Network Monitor.
6. **Device registry** — Capability registration and querying. Local desktop device auto-registers.
7. **Task assessor** — Requirements assessment for known task types.
8. **Task router** — Routing decision engine with rule priority.
9. **Sidebar navigation update** — Add Network Monitor to sidebar. Verify all screens accessible.
10. **Onboarding flow verification** — Walk through complete flow, verify Knowledge Moment, first action, Partner default.
11. **Sprint 2 exit criteria tests** — Dedicated test suite for all 8 criteria.
12. **Sprint 2 journey test** — End-to-end narrative test.
13. **Privacy audit** — Run full audit. Exit 0 required.
14. **Final count verification** — All tests pass, all criteria green, all screens render.

---

## Exit Criteria

This step is complete when ALL of the following are true:

### Network Monitor
1. ☐ Network Monitor screen renders with trust status, active connections, activity chart, authorized services, and connection log
2. ☐ Trust status shows "Zero unauthorized connections" (green) when clean
3. ☐ Active connections list shows currently connected services with data transfer stats
4. ☐ Authorized services list shows only user-configured services with connection counts
5. ☐ Connection log displays recent audit trail entries with timestamp, action, service, and status
6. ☐ Activity chart shows connection timeline for today/week/month
7. ☐ Privacy report generates with correct summary, service breakdown, and audit trail hash
8. ☐ Persistent status indicator visible on all screens (Inbox, Chat, Digest, Network, Settings)

### Task Routing Foundation
9. ☐ Device registry stores and retrieves device capabilities
10. ☐ Task assessor correctly evaluates requirements for each task type (email, calendar, meeting prep, subscription)
11. ☐ Task router selects the correct device based on routing rules (network, model size, battery, load)
12. ☐ Local desktop device auto-registers on app startup

### Sprint 2 Exit Criteria — ALL EIGHT MET
13. ☐ **EC1 — Action count:** At least 10 distinct autonomous action types are available and tested
14. ☐ **EC2 — Time quantification:** Weekly digest includes time-saved estimate with per-action-type breakdown
15. ☐ **EC3 — Knowledge Moment:** Compound cross-source demonstration fires during onboarding with fallback hierarchy
16. ☐ **EC4 — Email active:** Partner mode auto-handles routine emails (categorize, archive, draft)
17. ☐ **EC5 — Calendar active:** Conflict detection, meeting prep, scheduling — all autonomous in Partner mode
18. ☐ **EC6 — Subscription detection:** CSV/OFX import → recurring detection → forgotten flagging → annual savings
19. ☐ **EC7 — Autonomy escalation:** Partner default, escalation prompts at thresholds, accept/dismiss with cooldown
20. ☐ **EC8 — Network Monitor:** Zero unauthorized connections, all services on allowlist, persistent status indicator

### Quality Gates
21. ☐ All ~1,100+ tests passing (1,022 existing + ~80-100 new)
22. ☐ Privacy audit passes (exit 0) — Network Monitor reads Gateway audit trail only, no new network code in Core
23. ☐ Sprint 2 end-to-end journey test passes — complete user flow from onboarding through Network Monitor
24. ☐ Autonomy defaults verified — Partner pre-selected in onboarding, per-domain defaults correct
25. ☐ Sidebar navigation complete — all screens accessible (Chat, Inbox, Digest, Network, Settings)

---

## When This Step Is Done

Sprint 2 is closed. The product is ready for Sprint 3.

**What Sprint 2 has delivered:**
- A sovereign personal AI that indexes your email, calendar, and files locally
- An Orchestrator that takes autonomous actions based on your autonomy tier
- Partner mode as default — the product does things, not just shows things
- Email triage, calendar management, meeting prep, follow-up tracking, deadline detection
- Subscription detection from bank statements with annual savings calculation
- Autonomy escalation that guides users from Guardian → Partner → Alter Ego
- The Knowledge Moment — compound cross-source intelligence in the first 5 minutes
- Weekly digest with time-saved metrics and AI narrative
- Network Monitor proving zero unauthorized connections
- 1,100+ tests, privacy audit clean, provable privacy

**What Sprint 3 will deliver:**
- Full Financial Awareness (Plaid, transaction categorization, anomaly detection)
- Form & Bureaucracy Automation
- Digital Representative Mode (customer service, negotiation)
- Health & Wellness tracking
- Communication style learning (for Alter Ego voice matching)
- Mobile feature parity for all Sprint 2 features
- Per-domain autonomy refinement UI
- Daily digest generation

Sprint 2 made Semblance useful. Sprint 3 makes it powerful. Sprint 4 makes it undeniable.

Build the monitor. Close the sprint.
