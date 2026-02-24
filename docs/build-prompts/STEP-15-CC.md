# Step 15 — SMS/Messaging + Clipboard Intelligence

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Step 14 COMPLETE. 2,810 tests, 0 failures, TypeScript clean. Sprint 4 in progress — "Becomes Part of You." Contacts and relationship intelligence are live. This step adds two native device capabilities: messaging (SMS/text) and clipboard intelligence. Both are things cloud AI physically cannot do. Both turn Semblance from "an app I use" into "the intelligence running on my device."
**Test Baseline:** 2,810 tests, 0 failures, `npx tsc --noEmit` clean.
**Depends on:** Step 14 (ContactResolver for recipient resolution, ContactEntity for phone numbers)

---

## Read First

Before writing any code, read these files:
- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules
- `/docs/DESIGN_SYSTEM.md` — Trellis design system
- `packages/core/platform/types.ts` — PlatformAdapter interface (you will extend)
- `packages/core/knowledge/contacts/contact-resolver.ts` — Name → contact resolution (Step 14)
- `packages/core/knowledge/contacts/contact-store.ts` — Contact data with phone numbers
- `packages/core/agent/orchestrator.ts` — Where "text Sarah" gets processed
- `packages/core/agent/autonomy.ts` — Autonomy tier controls (Guardian/Partner/Alter Ego)

---

## Why This Step Matters

Two scenarios that make the moat visceral:

**Messaging:** User says "text Sarah to confirm Tuesday pickup." Semblance resolves Sarah from contacts (Step 14), finds her phone number, drafts a style-matched message, and either presents it for one-tap send (iOS) or sends it autonomously (Android, Alter Ego mode). ChatGPT can't text anyone.

**Clipboard:** User copies a FedEx tracking number. Semblance recognizes the pattern, offers to track the package. User copies a flight confirmation code — Semblance offers to add it to the calendar. User copies an address — Semblance offers directions. All processed locally, all instant, all ambient. ChatGPT doesn't know your clipboard exists.

---

## Scope Overview

| Section | Description | Tests |
|---------|-------------|-------|
| A | MessagingAdapter on PlatformAdapter | 8+ |
| B | Message drafting + orchestrator integration | 10+ |
| C | ClipboardAdapter on PlatformAdapter | 6+ |
| D | Clipboard pattern recognition engine | 12+ |
| E | Clipboard action handlers + autonomy integration | 8+ |
| F | Messaging + clipboard UI (desktop + mobile) | 8+ |

**Minimum 50 new tests. Target: 60+.**

---

## Section A: MessagingAdapter on PlatformAdapter

### A1: MessagingAdapter Interface

Add to `packages/core/platform/types.ts`:

```typescript
interface MessagingAdapter {
  // Check if messaging capability is available on this platform
  isAvailable(): Promise<boolean>;

  // Get platform messaging constraints
  getCapabilities(): MessagingCapabilities;

  // Send a message (behavior depends on platform)
  // iOS: Opens MFMessageComposeViewController pre-filled — returns 'presented'
  // Android: Sends via SmsManager under Alter Ego/Partner — returns 'sent'
  // Desktop: Opens default messaging app with pre-filled content — returns 'presented'
  sendMessage(request: MessageRequest): Promise<MessageResult>;

  // Read message history (Android only — iOS doesn't allow this)
  // Returns null on platforms that don't support reading
  readMessages?(contactPhone: string, limit?: number): Promise<MessageEntry[] | null>;
}

interface MessagingCapabilities {
  canSendAutonomously: boolean;    // Android: true; iOS/desktop: false
  canReadHistory: boolean;          // Android: true; iOS/desktop: false
  requiresUserConfirmation: boolean; // iOS: true (must tap send); others: depends on tier
}

interface MessageRequest {
  recipientPhone: string;
  recipientName?: string;          // For display/logging
  body: string;
  isStyleMatched?: boolean;        // Whether style profile was applied
}

interface MessageResult {
  status: 'sent' | 'presented' | 'failed' | 'permission_denied';
  messageId?: string;              // Platform message ID if sent
  error?: string;
}

interface MessageEntry {
  id: string;
  body: string;
  timestamp: string;               // ISO datetime
  direction: 'sent' | 'received';
  contactPhone: string;
}
```

Add `messaging?: MessagingAdapter` to PlatformAdapter. Optional, non-breaking.

### A2: iOS Adapter

```typescript
// packages/mobile/src/native/messaging-bridge.ts (iOS path)

// Uses react-native Linking or a thin native module for MFMessageComposeViewController
// Flow:
// 1. Validate phone number format
// 2. Open SMS compose view pre-filled with recipient + body
// 3. User taps Send (Apple requirement — cannot bypass)
// 4. Return 'presented' (we cannot know if user actually tapped send)

// For iOS, canSendAutonomously = false, requiresUserConfirmation = true
// readMessages returns null (iOS doesn't expose message history to apps)
```

**Note on iOS limitation:** Apple does not allow apps to send SMS without user interaction. `MFMessageComposeViewController` pre-fills the message but the user must tap Send. This is a platform constraint, not a Semblance limitation. The UX should make this feel like one-tap convenience, not a restriction. "I've drafted a text to Sarah — tap to send."

### A3: Android Adapter

```typescript
// packages/mobile/src/native/messaging-bridge.ts (Android path)

// Uses react-native-sms or direct SmsManager bridge
// Flow:
// 1. Check SMS permission (SEND_SMS, READ_SMS)
// 2. Under Alter Ego/Partner: SmsManager.sendTextMessage() — fully autonomous
// 3. Under Guardian: open compose view (same as iOS behavior)
// 4. Return 'sent' for autonomous, 'presented' for Guardian

// readMessages: query content://sms/inbox for conversation history with contact
// canSendAutonomously = true (subject to autonomy tier)
```

### A4: Desktop Adapter

```typescript
// packages/core/platform/desktop-messaging.ts

// Desktop cannot send SMS directly
// Flow: open system default messaging app (iMessage on Mac, Your Phone on Windows)
// via shell command or Tauri plugin
// Fallback: copy message to clipboard + show "Message copied — paste in your messaging app"
// canSendAutonomously = false, requiresUserConfirmation = true
```

### A5: Tests (8+)

- MessagingAdapter interface compliance (mock adapter)
- iOS: sendMessage returns 'presented' (never 'sent')
- Android: sendMessage with Alter Ego tier returns 'sent'
- Android: sendMessage with Guardian tier returns 'presented'
- Desktop: sendMessage returns 'presented' or falls back to clipboard
- Permission denied → returns 'permission_denied'
- Invalid phone number → returns 'failed' with error
- getCapabilities returns correct platform constraints

---

## Section B: Message Drafting + Orchestrator Integration

### B1: Message Drafter

```typescript
// packages/core/agent/messaging/message-drafter.ts

export class MessageDrafter {
  // Drafts a text message using the style profile if available
  // Messages are shorter and more casual than emails — different prompt template

  async draftMessage(request: DraftMessageRequest): Promise<DraftedMessage>;
}

interface DraftMessageRequest {
  recipientName: string;
  recipientRelationship?: RelationshipType;  // From contact entity
  purpose: string;                           // "confirm Tuesday pickup"
  conversationContext?: string;              // Recent message history if available
  styleProfile?: StyleProfile;              // User's communication style
}

interface DraftedMessage {
  body: string;
  isStyleMatched: boolean;
  alternatives?: string[];         // 2-3 alternative phrasings
}
```

**Style adaptation for SMS:** Text messages are structurally different from emails. The LLM prompt must specify:
- Short (1-3 sentences typical)
- Casual register (even for work contacts)
- No salutation/sign-off unless the user's style shows them
- Match the user's texting patterns (abbreviations, emoji usage, punctuation style)

If style profile is not yet built (new user), use a neutral casual tone.

### B2: Orchestrator Integration

When the user says "text Sarah to confirm Tuesday pickup":

1. **Intent classification:** Orchestrator's `classifyQueryFast()` detects messaging intent
2. **Contact resolution:** `ContactResolver.resolve("Sarah")` → gets ContactEntity with phone
3. **Draft message:** `MessageDrafter.draftMessage()` with purpose + relationship context
4. **Autonomy check:** `AutonomyManager.checkPermission('messaging', 'send')` 
5. **Action execution:**
   - Guardian: Show draft in chat, ask for approval → on approval, call `MessagingAdapter.sendMessage()`
   - Partner: Show draft briefly, auto-send after 5-second countdown (cancel to stop)
   - Alter Ego: Send immediately, show confirmation in chat

**Action types to add:**
- `messaging.draft` — Draft a message (always allowed)
- `messaging.send` — Send a message (autonomy-controlled)
- `messaging.read` — Read message history (Android only, autonomy-controlled)

Add to `AutonomyDomain`: `'messaging'`
Add to `ACTION_DOMAIN_MAP` and `ACTION_RISK_MAP`:
- `messaging.draft` → domain: 'messaging', risk: 'read'
- `messaging.send` → domain: 'messaging', risk: 'execute'
- `messaging.read` → domain: 'messaging', risk: 'read'

### B3: Audit Trail Integration

Every messaging action logged:
```typescript
{
  actionType: 'messaging.send',
  payload: {
    recipientName: 'Sarah Chen',
    recipientPhone: '+1555...',  // Partially masked in log: '+1555***1234'
    bodyPreview: 'Hey Sarah, confirming Tuesday pickup...',  // First 50 chars
    platform: 'ios',
    result: 'presented'
  },
  autonomyTier: 'partner',
  timestamp: '...',
  estimatedTimeSavedSeconds: 60  // Drafting + sending a text
}
```

Phone numbers are partially masked in audit trail (show last 4 digits only) for privacy even in local logs.

### B4: Tests (10+)

- "text Sarah to confirm Tuesday" → intent classified as messaging
- ContactResolver finds Sarah with phone number
- MessageDrafter produces short casual message
- Style profile applied when available
- No style profile → neutral casual tone
- Guardian: draft shown, requires approval before send
- Partner: auto-send with countdown
- Alter Ego: immediate send
- Audit trail entry created with masked phone number
- No phone number → graceful error ("Sarah doesn't have a phone number in contacts")
- Ambiguous recipient → disambiguation question (reuses ContactResolver)

---

## Section C: ClipboardAdapter on PlatformAdapter

### C1: ClipboardAdapter Interface

Add to `packages/core/platform/types.ts`:

```typescript
interface ClipboardAdapter {
  // Check if clipboard monitoring is permitted
  hasPermission(): Promise<boolean>;

  // Request permission to monitor clipboard
  requestPermission(): Promise<boolean>;

  // Read current clipboard contents
  readClipboard(): Promise<ClipboardContent>;

  // Watch for clipboard changes (returns unsubscribe function)
  // Callback fires when clipboard content changes
  onClipboardChanged(callback: (content: ClipboardContent) => void): () => void;

  // Write to clipboard
  writeClipboard(text: string): Promise<void>;
}

interface ClipboardContent {
  text: string | null;
  hasText: boolean;
  timestamp: string;      // When this content was detected
  source?: string;         // 'user_copy' | 'app_paste' — if determinable
}
```

Add `clipboard?: ClipboardAdapter` to PlatformAdapter. Optional, non-breaking.

### C2: Desktop Adapter (Tauri)

```typescript
// packages/core/platform/desktop-clipboard.ts

// Tauri provides clipboard access via @tauri-apps/plugin-clipboard-manager
// or via Rust clipboard crate

// Monitoring approach:
// Poll clipboard every 2 seconds (not continuous — battery friendly)
// Compare hash of current content vs last known content
// If changed → fire callback
// Only monitors text content (not images/files)
```

### C3: Mobile Adapter (React Native)

```typescript
// packages/mobile/src/native/clipboard-bridge.ts

// Uses @react-native-clipboard/clipboard
// iOS 14+: clipboard access shows paste permission banner (system-managed)
// Android: clipboard access requires no special permission

// Monitoring:
// AppState change listener (foreground → check clipboard)
// Not continuous polling (iOS would block this, and it drains battery)
// Check on: app foreground, chat screen focus, inbox screen focus
```

**Important iOS note:** Starting iOS 14, accessing the clipboard shows a system banner "App pasted from [source app]." Starting iOS 16, apps need UIPasteControl or explicit user paste action. The adapter must handle this gracefully — on iOS, clipboard reading should be triggered by user action (tap "Analyze clipboard") rather than automatic monitoring. On Android and desktop, monitoring can be more ambient.

### C4: Tests (6+)

- ClipboardAdapter interface compliance (mock adapter)
- readClipboard returns current text
- onClipboardChanged fires when content changes
- onClipboardChanged unsubscribe stops callbacks
- Permission denied → hasPermission false, readClipboard returns null
- writeClipboard sets clipboard content

---

## Section D: Clipboard Pattern Recognition Engine

This is the intelligence layer. When clipboard content changes, Semblance analyzes it for actionable patterns.

### D1: Pattern Recognizer

```typescript
// packages/core/agent/clipboard/pattern-recognizer.ts

export class ClipboardPatternRecognizer {
  // Analyzes clipboard text and identifies actionable patterns
  // Uses regex for high-confidence patterns, LLM for ambiguous ones

  async analyze(text: string): Promise<ClipboardAnalysis>;
}

interface ClipboardAnalysis {
  patterns: RecognizedPattern[];
  hasActionableContent: boolean;
}

interface RecognizedPattern {
  type: ClipboardPatternType;
  value: string;              // Extracted value (tracking number, flight code, etc.)
  confidence: 'high' | 'medium';
  suggestedAction: SuggestedClipboardAction;
  displayText: string;        // Human-readable: "FedEx tracking number detected"
}

type ClipboardPatternType =
  | 'tracking_number'        // FedEx, UPS, USPS, DHL
  | 'flight_code'            // AA1234, UA567
  | 'address'                // Street address
  | 'phone_number'           // Phone number not in contacts
  | 'url'                    // URL (offer to summarize)
  | 'email_address'          // Email not in contacts
  | 'date_time'              // Date/time reference (offer to create event)
  | 'price'                  // Price/amount (offer to track)
  | 'code_snippet'           // Code (offer to save)
  | 'unknown_actionable';    // LLM detected something actionable but uncategorized

interface SuggestedClipboardAction {
  actionType: string;         // 'track_package' | 'add_to_calendar' | 'get_directions' | etc.
  label: string;              // "Track this package"
  description: string;        // "FedEx tracking number 1234567890"
  payload: Record<string, unknown>;  // Action-specific data
}
```

### D2: Pattern Definitions (Regex-Based)

High-confidence patterns that don't need LLM:

```typescript
const PATTERNS = {
  // FedEx: 12-34 digits
  fedex: /\b(\d{12,34})\b/,
  // UPS: 1Z followed by 16 alphanumeric
  ups: /\b(1Z[A-Z0-9]{16})\b/i,
  // USPS: 20-30 digits
  usps: /\b(\d{20,30})\b/,
  // Flight: 2 letter carrier + 1-4 digit flight number
  flight: /\b([A-Z]{2}\s?\d{1,4})\b/,
  // Phone: various formats
  phone: /\b(\+?1?\s?[-.]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/,
  // URL
  url: /https?:\/\/[^\s<>]+/i,
  // Email
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  // Price
  price: /\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/,
};
```

For ambiguous content (possible address, possible date, possible actionable text): use a fast LLM classification call. Single inference call, structured output: `{ patterns: [{ type, value, confidence }] }`.

### D3: Action Mapping

Each pattern type maps to a concrete action:

| Pattern | Action | Implementation |
|---------|--------|---------------|
| tracking_number | Track package | Web search via Gateway: "FedEx tracking [number]" |
| flight_code | Track flight | Web search via Gateway: "flight status [code]" |
| address | Get directions | Open maps app / show location |
| phone_number | Add to contacts or call | ContactStore check → if unknown, offer to add |
| url | Summarize article | Existing web fetch pipeline (Step 10) |
| email_address | Compose email | Existing email draft pipeline |
| date_time | Create calendar event | Existing calendar pipeline |
| price | Track/note | Quick capture into knowledge graph |
| code_snippet | Save to notes | Quick capture |

### D4: Tests (12+)

- FedEx tracking number recognized with high confidence
- UPS tracking number recognized
- Flight code "AA1234" recognized
- Phone number various formats recognized
- URL recognized
- Email address recognized
- Price "$49.99" recognized
- Plain text with no patterns → hasActionableContent false
- Multiple patterns in same text → all detected
- LLM fallback for ambiguous address text
- Action mapping: tracking number → 'track_package' action type
- Action mapping: flight code → 'track_flight' action type

---

## Section E: Clipboard Action Handlers + Autonomy Integration

### E1: Clipboard Action Handler

```typescript
// packages/core/agent/clipboard/clipboard-handler.ts

export class ClipboardActionHandler {
  // Processes a recognized pattern and executes the suggested action
  // Respects autonomy tier for each action

  async handlePattern(
    pattern: RecognizedPattern,
    autonomyTier: AutonomyTier
  ): Promise<ClipboardActionResult>;
}

interface ClipboardActionResult {
  executed: boolean;
  action: string;
  result?: string;           // Human-readable result
  requiresApproval: boolean; // If Guardian tier blocked execution
  pendingApprovalId?: string; // Reference for user to approve
}
```

### E2: Autonomy Integration

Clipboard actions are a new domain: `'clipboard'`

Add to `AutonomyDomain`: `'clipboard'`
Add to `ACTION_DOMAIN_MAP`:
- `clipboard.analyze` → domain: 'clipboard', risk: 'read'
- `clipboard.act` → domain: 'clipboard', risk: 'write'
- `clipboard.web_action` → domain: 'clipboard', risk: 'execute' (for tracking/search)

**Tier behavior:**
- **Guardian:** Shows clipboard insight card in inbox, requires tap to execute any action
- **Partner:** Executes routine actions automatically (track package, save code), shows notification. Asks before actions that create data (add calendar event, add contact).
- **Alter Ego:** Executes all clipboard actions automatically. Shows confirmation in audit trail.

### E3: Audit Trail

Every clipboard analysis and action logged:
```typescript
{
  actionType: 'clipboard.act',
  payload: {
    patternType: 'tracking_number',
    carrier: 'FedEx',
    action: 'track_package',
    // Content NOT logged in full — only pattern type and extracted value
    // This prevents clipboard from becoming a keylogger
  },
  autonomyTier: 'partner',
  estimatedTimeSavedSeconds: 120
}
```

**Critical privacy rule:** The full clipboard text is NEVER stored in the audit trail or knowledge graph. Only the recognized pattern type and extracted value are logged. This prevents the clipboard monitoring from functioning as a keylogger. The analysis happens in memory and is discarded after pattern extraction.

### E4: Tests (8+)

- Tracking number → web search action executed (Partner/Alter Ego)
- Tracking number → insight card shown (Guardian)
- URL → web fetch action triggered
- Phone number not in contacts → offer to add contact
- Phone number in contacts → show contact card
- Clipboard content NOT stored in full (privacy test)
- Only pattern + value in audit trail (privacy test)
- Autonomy tier respected: Guardian requires approval, Partner auto-executes routine

---

## Section F: Messaging + Clipboard UI

### F1: Message Compose in Chat

When the orchestrator resolves a messaging intent:

**Desktop:**
- Chat shows message draft card:
  ```
  📱 Text to Sarah Chen (+1555***1234)
  ─────────────────────────────────
  Hey Sarah, confirming Tuesday pickup at 3pm. See you then!
  ─────────────────────────────────
  [Send]  [Edit]  [Cancel]
  ```
- Guardian: Send button requires click
- Partner: Auto-sends with 5-second countdown (cancel button visible)
- Alter Ego: Shows confirmation card after send

**Mobile:**
- Same card in chat
- Send button opens MFMessageComposeViewController (iOS) or sends directly (Android Partner/Alter Ego)
- Haptic feedback on send

### F2: Clipboard Insight Cards

When clipboard pattern is detected:

**Desktop:**
- Toast notification (non-intrusive, bottom-right):
  ```
  📋 FedEx tracking number detected
  [Track Package]  [Dismiss]
  ```
- Toast auto-dismisses after 8 seconds if not interacted with
- If acted on: action result shown in inbox as completed card

**Mobile:**
- System notification (if app is backgrounded)
- In-app banner (if app is foregrounded)
- Tap opens action

### F3: Clipboard Settings

Settings → Privacy & Permissions → Clipboard Intelligence:
- Toggle: "Clipboard monitoring" (on/off, default off — user must opt in)
- Description: "When enabled, Semblance analyzes copied text for actionable content like tracking numbers, flight codes, and addresses. Clipboard content is analyzed in memory and never stored."
- Shows last 5 clipboard actions (pattern type + action taken, NOT clipboard text)

**Default OFF is critical.** Clipboard monitoring is a sensitive capability. Users must explicitly opt in. The setting description must be honest about what it does.

### F4: Sidecar Bridge Commands

Add to the Tauri sidecar bridge:
```
messaging:draft       — Draft a message for a contact
messaging:send        — Execute message send
messaging:history     — Read message history (Android only)
clipboard:analyze     — Analyze current clipboard content
clipboard:getSettings — Get clipboard monitoring settings
clipboard:setSettings — Update clipboard monitoring settings
clipboard:getRecent   — Get recent clipboard actions (pattern + action, not content)
```

### F5: Tests (8+)

- Message draft card renders in chat with correct recipient and body
- Send button behavior matches platform (iOS: presented, Android Alter Ego: sent)
- Clipboard toast notification renders with pattern description
- Toast auto-dismisses after timeout
- Clipboard settings toggle persists
- Clipboard monitoring off by default
- Recent clipboard actions show pattern type, not content (privacy)
- Sidecar bridge commands return correct data

---

## Commit Strategy

8 commits. Each compiles, passes all tests, leaves codebase working.

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A | MessagingAdapter interface + iOS/Android/desktop adapters | 8+ |
| 2 | B | Message drafter + orchestrator integration + audit trail | 10+ |
| 3 | C | ClipboardAdapter interface + desktop/mobile adapters | 6+ |
| 4 | D | Pattern recognizer (regex patterns + LLM fallback) | 8+ |
| 5 | D | Action mapping + remaining pattern tests | 5+ |
| 6 | E | Clipboard action handler + autonomy integration + privacy | 8+ |
| 7 | F | Messaging UI + clipboard UI (desktop + mobile) + settings | 8+ |
| 8 | F | Sidecar bridge + integration tests + privacy verification | 7+ |

**Minimum 50 new tests. Target: 60+.**

---

## Exit Criteria

Step 15 is complete when ALL of the following are true:

### Messaging
1. ☐ MessagingAdapter on PlatformAdapter with platform-specific implementations
2. ☐ iOS: sendMessage opens compose view pre-filled (returns 'presented')
3. ☐ Android: sendMessage sends autonomously under Partner/Alter Ego (returns 'sent')
4. ☐ Desktop: sendMessage opens default messaging app or copies to clipboard
5. ☐ "Text Sarah" → ContactResolver finds Sarah → phone number → draft message
6. ☐ MessageDrafter produces short, casual, style-matched messages
7. ☐ Autonomy tiers enforced: Guardian approves, Partner auto-sends with countdown, Alter Ego immediate
8. ☐ Audit trail logs messaging actions with masked phone numbers

### Clipboard
9. ☐ ClipboardAdapter on PlatformAdapter with desktop/mobile implementations
10. ☐ Pattern recognizer detects: tracking numbers, flight codes, URLs, phone numbers, email addresses, prices
11. ☐ Each pattern maps to a concrete suggested action
12. ☐ Clipboard actions respect autonomy tiers
13. ☐ Clipboard monitoring default OFF — requires explicit opt-in
14. ☐ Full clipboard text NEVER stored in audit trail or knowledge graph (privacy)
15. ☐ Only pattern type + extracted value logged

### UI
16. ☐ Message draft card renders in chat with send/edit/cancel
17. ☐ Clipboard toast notification with action button
18. ☐ Clipboard settings in Settings → Privacy & Permissions
19. ☐ Sidecar bridge commands functional

### Engineering
20. ☐ `npx tsc --noEmit` → zero errors
21. ☐ 50+ new tests from this step
22. ☐ All existing 2,810 tests pass — zero regressions
23. ☐ Total test suite passes with zero failures
24. ☐ Privacy audit clean — clipboard content never stored, phone numbers masked in logs
25. ☐ No network access in clipboard/messaging Core code (Gateway only for web actions)

---

## Approved Dependencies

### New (if needed)
- `react-native-sms` or equivalent — SMS sending on Android. Must be pure native, no cloud.
- `@react-native-clipboard/clipboard` — Clipboard access for React Native. Well-maintained, no network.

### NOT Approved
- Any cloud messaging API (Twilio, MessageBird, etc.)
- Any cloud clipboard service
- Any analytics or telemetry

---

## Autonomous Decision Authority

Proceed without escalating for:
- Choosing between react-native-sms vs direct SmsManager native module
- Clipboard polling interval tuning (1-5 seconds)
- Regex pattern refinements for tracking numbers
- Toast notification timing and positioning
- Message draft prompt engineering
- UI layout within Trellis design system

## Escalation Triggers — STOP and Report

- iOS clipboard access consistently triggers permission banners in a way that degrades UX → need architectural discussion on iOS-specific flow
- Android SMS permission model changes block autonomous sending → need platform research
- Pattern recognition false positive rate >15% → regex tuning needed
- Any clipboard content being persisted anywhere (database, file, log) → CRITICAL PRIVACY VIOLATION, stop immediately
- TypeScript errors introduced → fix before committing

---

## Verification Requirements

When complete, provide raw output for:

1. `git log --oneline -10` — all commits visible
2. `npx tsc --noEmit 2>&1; echo "EXIT_CODE=$?"` — TypeScript clean
3. `npx vitest run 2>&1 | tail -15` — test count and results
4. `grep -rn "clipboard" packages/core/agent/clipboard/ --include="*.ts" -l` — clipboard module files exist
5. `grep -rn "messaging" packages/core/agent/messaging/ --include="*.ts" -l` — messaging module files exist
6. `grep -rn "fetch\|http\|https\|axios" packages/core/agent/clipboard/ packages/core/agent/messaging/ --include="*.ts"` — zero network access in these modules
7. `grep -rni "TODO\|PLACEHOLDER\|FIXME\|stub\|not implemented" packages/core/agent/clipboard/ packages/core/agent/messaging/ --include="*.ts"` — zero stubs
8. `grep -n "clipboardText\|clipboard_text\|full_text\|raw_text" packages/core/agent/clipboard/ --include="*.ts" -r` — verify no full clipboard storage

All 25 exit criteria must be individually confirmed.

---

## The Bar

After this step, Semblance can text people for you and it pays attention to what you copy. "Text Sarah to confirm Tuesday pickup" — done in one sentence. Copy a tracking number — Semblance offers to track it. Copy a flight code — it adds it to your calendar. All local, all private, all ambient.

These are things you do ten times a day without thinking. Cloud AI can't do any of them. Semblance does them all.
