# Step 28 — Semblance Network (Local Consensual Sharing)

## Implementation Prompt for Claude Code

**Sprint:** 5 — Becomes Permanent (FINAL STEP OF SPRINT)  
**Builds on:** mDNS Discovery (Step 12), Encrypted Sync (Step 12/13), Witness (Step 26), Relationship Intelligence (Step 14), Contacts (Step 14), Action Signing (Sprint 1)  
**Test target:** 40+ new tests. All existing 3,376 tests must pass. TypeScript clean. Privacy audit clean.  
**Risk level:** Medium-high. Most architecturally complex remaining feature in Sprint 5. Mitigation: local-network-only for v1. Encrypted relay is a stretch goal, NOT required for this step.

---

## Context

You are implementing Step 28, the final step of Sprint 5. Steps 1–27 are complete with 3,376 tests across 285 files, zero failures.

This feature is **Digital Representative tier** (premium-gated via `PremiumGate.isPremium()`).

This is an **open-core premium feature** — source code lives in `semblance-core` (public, auditable), runtime-gated via PremiumGate. Its value comes from trust: users can verify that sharing is truly consensual, granular, revocable, and auditable. See the repo split policy in CLAUDE.md for classification rules.

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code.

---

## What You're Building

Peer-to-peer contextual sharing between Semblance instances on the same local network. Two users' Semblance instances can voluntarily share specific context categories with each other — calendar availability, communication style awareness, project context, topic expertise. Sharing is consensual, granular, revocable, and fully audited on both sides.

**This is NOT cloud sync.** This is NOT file sharing. This is NOT a messaging system. It is a controlled, consensual exchange of derived context between two sovereign AI instances that happen to be on the same network.

**V1 scope (this step):** Local-network discovery and sharing via mDNS. No relay server. No remote connections. No internet connectivity between instances. If two devices aren't on the same LAN, they can't share. This is intentional — local-network-first establishes the pattern. Remote relay is a post-launch enhancement.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** The sharing protocol code lives in core but all network operations (mDNS discovery, peer connection, data transfer) flow through the Gateway via IPC.
2. **RULE 2 — Gateway Only.** mDNS broadcast/listen and peer-to-peer data exchange are Gateway operations. The AI Core requests discovery and sends/receives sharing payloads through typed IPC action requests.
3. **RULE 3 — Action Signing.** Every sharing action (offer, accept, revoke, transfer) is cryptographically signed and audit-trailed on BOTH sides.
4. **RULE 4 — No Telemetry.** Zero tracking of sharing activity beyond the local audit trail.
5. **RULE 5 — Local Only Data.** Shared context received from a peer is stored locally. There is no central server. There is no cloud coordination.

**CRITICAL:** This is the first feature where the AI Core initiates network-adjacent behavior (discovery, peer communication). All of it MUST flow through the Gateway via IPC. The core contains the sharing logic, consent management, and context assembly. The Gateway handles the actual network operations. Do not blur this boundary.

---

## Existing Code to Reuse

**From Step 12 (mDNS Discovery + Encrypted Sync):**
- mDNS discovery infrastructure in the Gateway — device discovery on local network. Find the existing implementation and extend it for Semblance Network peer discovery.
- Encrypted sync transport — the secure data transfer channel between devices. Reuse for sharing payload delivery.
- Check `packages/gateway/` for the mDNS and sync implementations from Step 12.

**From Step 26 (Attestation):**
- `packages/core/attestation/attestation-signer.ts` — sign sharing offers, acceptances, revocations
- `packages/core/attestation/attestation-verifier.ts` — verify peer's attestations

**From Step 26 (Witness):**
- `packages/core/witness/witness-generator.ts` — generate Witness attestations for significant sharing events

**From Step 14 (Contacts/Relationships):**
- Contact and relationship data for identifying sharing peers by name/relationship

**From Step 13 (Encryption):**
- AES-256-GCM via PlatformAdapter for encrypting sharing payloads in transit

**From Premium infrastructure:**
- `packages/core/premium/premium-gate.ts` — PremiumGate.isPremium()
- `packages/core/extensions/types.ts` — ExtensionInsightTracker

---

## Detailed Specification

### Sharing Model

**Default: Zero sharing.** Every sharing relationship is a deliberate, explicit, opt-in choice. There are no defaults that share anything. There is no "share everything" button. Each sharing relationship and each context category within that relationship requires explicit consent.

**Granularity:** Users share specific context categories, not their entire knowledge graph. Categories:

```typescript
type SharingCategory = 
  | 'calendar-availability'      // Free/busy status, upcoming schedule windows
  | 'communication-style'        // How they write, preferred tone (from style profile)
  | 'project-context'            // Active project names, topics, status
  | 'topic-expertise'            // What they know about, areas of knowledge
  | 'location-context';          // General location awareness (city-level, not GPS)
```

**What is NEVER shared, regardless of settings:**
- Credentials (passwords, API keys, tokens)
- Raw data (actual emails, documents, financial transactions)
- Financial information (account balances, spending, transaction history)
- Health data (any health or wellness information)
- Full knowledge graph (only category-specific derived summaries)
- Audit trail entries
- Living Will contents
- Inheritance Protocol configuration

This exclusion list is architecturally enforced — the context assembly module physically cannot access these data stores. It only queries the stores relevant to the enabled sharing categories.

### Consent Model

```typescript
interface SharingRelationship {
  id: string;
  localUserId: string;            // This Semblance instance
  peerId: string;                  // The other Semblance instance (device identity)
  peerDisplayName: string;         // Human-readable name for the peer
  status: 'pending' | 'active' | 'revoked' | 'expired';
  
  // What I'm sharing with them
  outboundCategories: SharingCategory[];
  
  // What they're sharing with me
  inboundCategories: SharingCategory[];
  
  // Consent chain
  initiatedBy: 'local' | 'peer';
  consentGrantedAt: string;
  lastSyncAt: string | null;
  
  // Cryptographic proof
  consentAttestation: SignedAttestation;   // Signed by both parties
  
  createdAt: string;
  updatedAt: string;
}

interface SharingOffer {
  id: string;
  fromDeviceId: string;
  fromDisplayName: string;
  offeredCategories: SharingCategory[];   // What the initiator offers to share
  requestedCategories: SharingCategory[]; // What the initiator wants in return
  expiresAt: string;                       // Offers expire (default: 24 hours)
  signature: string;                       // Signed by initiator's device key
}

interface SharingAcceptance {
  offerId: string;
  acceptedOutbound: SharingCategory[];    // What the acceptor agrees to share
  acceptedInbound: SharingCategory[];     // What the acceptor agrees to receive
  signature: string;                       // Signed by acceptor's device key
}
```

**Consent is bilateral and asymmetric.** User A might share calendar-availability and project-context with User B, while User B shares only topic-expertise with User A. Each side independently controls what they share. Accepting a sharing request does not require reciprocity — User B can accept User A's offer of calendar data without sharing anything back.

**Consent is revocable.** Either party can revoke any category or the entire relationship at any time. Revocation is instant. When a category is revoked:
1. The revoking party's Semblance stops sending that context category
2. The other party's Semblance deletes the locally cached data for that category from the revoking party
3. A revocation attestation is generated and sent to the peer
4. Both sides log the revocation to their audit trails

**Revocation deletes data.** This is not a soft revocation. When User A revokes sharing of calendar-availability with User B, User B's Semblance instance deletes User A's cached calendar availability. The data is gone. This is architecturally enforced — the revocation handler calls the deletion function, and the deletion is verified.

### Discovery Flow (mDNS via Gateway)

1. User enables Semblance Network in settings (disabled by default)
2. AI Core sends `network.startDiscovery` IPC action to Gateway
3. Gateway broadcasts mDNS service: `_semblance._tcp.local` with device identity metadata
4. Gateway listens for other `_semblance._tcp` services on the network
5. Gateway reports discovered peers to AI Core via IPC callback
6. AI Core presents discovered peers in the Network panel UI
7. Discovery runs only while the Network panel is active or background sharing is enabled (battery consideration)

**Discovery does NOT automatically share anything.** It only reveals that other Semblance instances exist on the network. The user must explicitly initiate a sharing relationship.

### Connection Flow

1. User A selects a discovered peer (User B) in the Network panel
2. User A selects which categories to offer and which to request
3. AI Core builds a `SharingOffer`, signs it with the device key
4. AI Core sends `network.sendOffer` IPC action to Gateway with the offer payload
5. Gateway delivers the offer to User B's Gateway via the peer connection
6. User B's Gateway passes the offer to User B's AI Core via IPC
7. User B sees the offer in their Network panel: "User A wants to share calendar-availability and project-context with you, and requests your topic-expertise"
8. User B selects which categories to accept (can accept some, reject others, or counter-offer)
9. User B's AI Core builds a `SharingAcceptance`, signs it
10. Acceptance delivered back to User A via Gateway
11. Both sides create a `SharingRelationship` with matching consent attestations
12. Both sides log the new relationship to their audit trails

### Data Transfer Flow

Once a relationship is active:

1. AI Core assembles a context payload for the enabled outbound categories
2. Context payloads contain DERIVED SUMMARIES, not raw data:
   - `calendar-availability`: "Free Tuesday 2-4pm, Wednesday all day. Busy Thursday."
   - `communication-style`: "Prefers concise, direct communication. Uses contractions. Signs off with first name."
   - `project-context`: "Working on: Project Alpha (active, design phase), Blog migration (paused)"
   - `topic-expertise`: "Knowledgeable about: TypeScript, privacy engineering, local-first architecture"
   - `location-context`: "Based in Bend, Oregon"
3. AI Core sends `network.syncContext` IPC action to Gateway with encrypted payload
4. Gateway delivers to peer's Gateway
5. Peer's Gateway passes to peer's AI Core
6. Peer's AI Core stores received context in a dedicated `shared-context` store (separate from the user's own knowledge graph)
7. Both sides log the sync to audit trail
8. Sync frequency: configurable (default: every 4 hours while both devices are on the same network)

### Shared Context Store

Received context from peers is stored in a separate, clearly-delineated store. It is NOT merged into the user's knowledge graph. This separation is critical:

- The user can always see exactly what context they've received from each peer
- Revocation cleanly deletes the peer's data without touching the user's own data
- The proactive engine can reference shared context when relevant (e.g., "User B is free Tuesday 2-4pm" when scheduling)
- The knowledge graph remains purely the user's own data

```typescript
interface SharedContextStore {
  getContextFromPeer(peerId: string): SharedContext | null;
  getContextByCategory(category: SharingCategory): SharedContext[];
  storeContext(peerId: string, category: SharingCategory, data: unknown): void;
  deleteContextFromPeer(peerId: string, category?: SharingCategory): void;  // category=undefined deletes all
  listPeersWithContext(): string[];
}
```

### Network Monitor Integration

All Semblance Network activity MUST be visible in the Network Monitor (Sprint 2):
- Discovery broadcasts
- Sharing offers (sent and received)
- Context sync events
- Revocations
- All data stays local — the Network Monitor confirms this visually

---

## File Structure

```
packages/core/network/
├── types.ts                          # All interfaces: SharingRelationship, SharingOffer, SharingCategory, etc.
├── network-config-store.ts           # SQLite-backed config: enabled, sync frequency, relationships
├── sharing-relationship-manager.ts   # CRUD for relationships, consent management
├── sharing-offer-handler.ts          # Create, send, receive, accept/reject offers
├── context-assembler.ts              # Assembles derived context payloads per category
├── shared-context-store.ts           # Stores/retrieves/deletes received peer context
├── revocation-handler.ts             # Processes revocations: delete data, notify peer, audit trail
├── peer-discovery.ts                 # Orchestrates mDNS discovery via Gateway IPC
├── network-sync-engine.ts            # Schedules and executes context sync cycles
├── network-tracker.ts                # ExtensionInsightTracker for sharing suggestions
├── index.ts                          # Barrel exports
└── __tests__/
    # (tests go in tests/core/network/)
```

**Gateway additions:**
```
packages/gateway/services/
├── network-discovery-service.ts      # mDNS broadcast + listen for _semblance._tcp
└── network-transport-service.ts      # Peer-to-peer encrypted payload delivery
```

---

## Commit Strategy

### Commit 1: Types + Config Store (5 tests)

- `types.ts` — all interfaces: SharingCategory, SharingRelationship, SharingOffer, SharingAcceptance, SharedContext, NetworkConfig, etc.
- `network-config-store.ts`:
  - `initSchema()` — creates `network_config` (singleton), `sharing_relationships`, `sharing_offers`, `shared_context_cache` tables
  - `isEnabled()`, `setEnabled()`, `getSyncFrequencyHours()`, `setSyncFrequencyHours()`
  - `saveRelationship()`, `getRelationship()`, `listRelationships()`, `deleteRelationship()`
  - `saveOffer()`, `getOffer()`, `listPendingOffers()`, `expireOldOffers()`

**Tests:** tests/core/network/network-config-store.test.ts
1. Schema creation with correct tables
2. Network disabled by default
3. Relationship CRUD (save, retrieve, list, delete)
4. Offer storage with expiration
5. Sync frequency defaults to 4 hours

### Commit 2: Context Assembler + Shared Context Store (7 tests)

- `context-assembler.ts`:
  - `assembleContext(categories: SharingCategory[])`: queries relevant data stores per category, produces derived summaries
  - `assembleCalendarAvailability()`: queries calendar for free/busy windows (summary, not raw events)
  - `assembleCommunicationStyle()`: extracts summary from style profile
  - `assembleProjectContext()`: queries active projects/topics from knowledge graph
  - `assembleTopicExpertise()`: queries knowledge graph for areas of knowledge
  - `assembleLocationContext()`: city-level location from location data
  - Each assembler produces a text summary + structured metadata, NEVER raw data
  - **Architecturally enforced exclusion:** The assembler does NOT receive references to financial stores, health stores, credential stores, audit trail, Living Will, or Inheritance config. It physically cannot access what it cannot see.

- `shared-context-store.ts`:
  - SQLite-backed store for received peer context
  - `storeContext()`, `getContextFromPeer()`, `getContextByCategory()`, `deleteContextFromPeer()`, `listPeersWithContext()`
  - Separate from the user's knowledge graph — clearly delineated

**Tests:** tests/core/network/context-assembler.test.ts
1. Assembles calendar availability as summary (not raw events)
2. Assembles communication style from style profile
3. Assembles project context from knowledge graph topics
4. Assembles topic expertise as keyword list
5. Returns empty for categories with no data (graceful degradation)

**Tests:** tests/core/network/shared-context-store.test.ts
6. Stores and retrieves peer context
7. Deletes context for specific peer + category (revocation support)

### Commit 3: Sharing Offer Handler + Consent (7 tests)

- `sharing-offer-handler.ts`:
  - `createOffer(peerId, offeredCategories, requestedCategories)`: builds and signs a SharingOffer
  - `receiveOffer(offer)`: validates signature, stores as pending, returns for UI display
  - `acceptOffer(offerId, acceptedOutbound, acceptedInbound)`: builds SharingAcceptance, creates SharingRelationship on both sides
  - `rejectOffer(offerId)`: marks offer as rejected, notifies peer
  - `expireOffers()`: expires offers older than 24 hours
  - Uses AttestationSigner for signing offers and acceptances
  - Bilateral consent: both sides must sign for a relationship to become active
  - Premium gate check on offer creation (not on receiving — you can receive even as free tier, but sharing requires premium)

**Tests:** tests/core/network/sharing-offer-handler.test.ts
1. Creates signed offer with correct categories
2. Receives and validates offer signature
3. Rejects offer with invalid signature
4. Acceptance creates relationship on acceptor side
5. Offer expires after 24 hours
6. Premium gate blocks offer creation for free tier
7. Asymmetric acceptance: acceptor can choose different categories than offered

### Commit 4: Revocation Handler (6 tests)

- `revocation-handler.ts`:
  - `revokeCategory(relationshipId, category)`: removes single category from outbound sharing
  - `revokeRelationship(relationshipId)`: revokes entire relationship
  - `processInboundRevocation(revocation)`: received from peer — deletes their cached data locally
  - Revocation flow:
    1. Build revocation attestation (signed)
    2. Send to peer via Gateway IPC (`network.sendRevocation`)
    3. Update local relationship (remove category or set status='revoked')
    4. Log to audit trail
  - Inbound revocation flow:
    1. Receive revocation from peer via Gateway IPC
    2. Verify revocation attestation signature
    3. Delete cached context for that peer + category from SharedContextStore
    4. Update local relationship record
    5. Log to audit trail

**Tests:** tests/core/network/revocation-handler.test.ts
1. Category revocation removes single category from relationship
2. Full revocation sets relationship status to 'revoked'
3. Inbound revocation deletes cached peer context
4. Revocation generates signed attestation
5. Both sides log revocation to audit trail
6. Revoked relationship blocks further sync

### Commit 5: Peer Discovery (via Gateway IPC) (4 tests)

- `peer-discovery.ts` (in core):
  - `startDiscovery()`: sends `network.startDiscovery` IPC action to Gateway
  - `stopDiscovery()`: sends `network.stopDiscovery` IPC action
  - `getDiscoveredPeers()`: returns list of discovered peer identities
  - `onPeerDiscovered(callback)`: registers callback for new peer events
  - `onPeerLost(callback)`: registers callback for peer departure events

- `packages/gateway/services/network-discovery-service.ts`:
  - `startBroadcast(deviceIdentity)`: advertises `_semblance._tcp.local` via mDNS
  - `startListening()`: listens for other `_semblance._tcp` services
  - `stopAll()`: ceases broadcast and listening
  - Uses existing mDNS infrastructure from Step 12 if available, otherwise implements basic mDNS

- `packages/gateway/services/network-transport-service.ts`:
  - `sendToPeer(peerId, payload)`: encrypted delivery to specific peer
  - `onReceive(callback)`: handler for incoming peer payloads
  - All payloads encrypted with AES-256-GCM using a session key established during offer acceptance
  - Transport is a simple request-response over the local network connection discovered via mDNS

**Tests:** tests/core/network/peer-discovery.test.ts
1. Start discovery sends IPC action to Gateway
2. Stop discovery sends IPC action to Gateway
3. Discovered peers are tracked and retrievable
4. Peer lost event removes from discovered list

### Commit 6: Network Sync Engine (5 tests)

- `network-sync-engine.ts`:
  - `syncWithPeer(relationshipId)`: assembles context for outbound categories → sends via Gateway IPC → processes received context
  - `runScheduledSync()`: checks all active relationships, syncs those that are due (based on sync frequency)
  - `isDue(relationship)`: checks lastSyncAt against configured frequency
  - Context payloads are encrypted before sending and decrypted after receiving
  - Each sync: audit-trailed on both sides, updates lastSyncAt

- `sharing-relationship-manager.ts`:
  - `getActiveRelationships()`: returns relationships with status='active'
  - `updateLastSync(relationshipId)`: updates lastSyncAt timestamp
  - `getRelationshipWithPeer(peerId)`: lookup by peer identity

**Tests:** tests/core/network/network-sync-engine.test.ts
1. Sync assembles context only for outbound categories
2. Sync stores received context in shared context store
3. Scheduled sync skips relationships not yet due
4. Sync updates lastSyncAt timestamp
5. Sync with revoked relationship is blocked

### Commit 7: Extension Registration + Premium Gate + Network Tracker (4 tests)

- Modify `packages/core/premium/premium-gate.ts`: add `'semblance-network'` to PremiumFeature type and FEATURE_TIER_MAP → 'digital-representative' (18 → 19 features)
- Modify `tests/core/premium/premium-gate.test.ts`: update feature count 18 → 19

- `network-tracker.ts` implements ExtensionInsightTracker:
  - `generateInsights()`: if Semblance Network is enabled and contacts exist with known Semblance instances, suggest sharing. If relationships are active but haven't synced recently, suggest checking network connectivity.
  - Only returns results if `premiumGate.isPremium()`

- Register `index.ts` barrel exports

**Tests:** tests/core/network/network-tracker.test.ts
1. NetworkTracker suggests sharing when peers are discovered but no relationships exist
2. NetworkTracker returns empty when premium inactive
3. Premium gate blocks semblance-network for free tier
4. Premium gate allows semblance-network for DR tier

### Commit 8: Integration Verification + Audit Trail (4 tests)

Final integration tests that verify end-to-end flows and audit trail completeness.

**Tests:** tests/core/network/network-integration.test.ts
1. Full flow: discover → offer → accept → sync → verify context received
2. Full flow: establish relationship → revoke category → verify context deleted from peer
3. All sharing events appear in audit trail (offer, accept, sync, revoke)
4. Network activity visible in Network Monitor format (produces correct action types for Network Monitor)

---

## What NOT to Do

1. **Do NOT merge shared context into the user's knowledge graph.** Peer context lives in `SharedContextStore`, completely separate. This ensures clean revocation and clear provenance.
2. **Do NOT share raw data.** Context assemblers produce derived summaries only. No email bodies, no document content, no financial data, no health data. Ever.
3. **Do NOT implement a relay server.** V1 is local-network-only. If devices aren't on the same LAN, they can't share. This is the spec.
4. **Do NOT auto-share on discovery.** Discovery reveals peers. Sharing requires explicit user action (offer → accept flow).
5. **Do NOT put mDNS or network transport code in packages/core/.** Discovery broadcasting and peer transport are Gateway operations. Core orchestrates via IPC; Gateway executes on the network.
6. **Do NOT create a "share everything" option.** Each category is individually selected per relationship. There is no bulk grant.
7. **Do NOT allow sharing without premium.** Offer creation, relationship establishment, and context sync all require `PremiumGate.isPremium()`. Discovery can show peers to free users (it's a teaser), but sharing requires Digital Representative.
8. **Do NOT skip audit trail entries.** Every offer, acceptance, rejection, sync, and revocation must be logged on both sides.
9. **Do NOT cache shared context indefinitely.** If a relationship is revoked or expired, the cached context must be deleted.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- SQLite table schema design for network config and shared context
- Context summary format and content (as long as it's derived, not raw)
- mDNS service name and metadata format
- IPC action type naming for network operations
- Sync scheduling logic
- Internal helper functions

You MUST escalate for:
- Any network code in `packages/core/` (MUST be in Gateway)
- Any change to the IPC protocol schema
- Any new external dependency (especially mDNS libraries)
- Any modification to existing audit trail or attestation behavior
- Any sharing of data outside the defined SharingCategory types
- Any decision to share data from the exclusion list (financial, health, credentials, etc.)
- Any remote/internet connectivity between instances (out of scope for v1)

---

## Exit Criteria Checklist

From `SEMBLANCE_BUILD_MAP_ELEVATION.md` plus integration requirements:

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Default: zero sharing. Every relationship is explicit opt-in | Test: fresh instance shares nothing, no auto-share on discovery |
| 2 | Granular sharing: specific context categories per relationship | Test: offer with selected categories, acceptance with different selection |
| 3 | Bilateral, asymmetric consent | Test: User A shares 3 categories, User B shares 1 — both valid |
| 4 | Revocation is instant and deletes data | Test: revoke → cached context deleted from peer's store |
| 5 | Full audit trail on both sides | Test: all sharing events logged on sender and receiver |
| 6 | mDNS discovery finds peers on local network | Test: discovery via Gateway IPC finds mocked peers |
| 7 | Context payloads are derived summaries, not raw data | Test: assembled context contains summaries, never raw emails/docs/financial |
| 8 | Shared context stored separately from knowledge graph | Test: SharedContextStore is independent, revocation doesn't touch user's KG |
| 9 | No central server required | Test: all operations are peer-to-peer via Gateway, no external service calls |
| 10 | Network activity visible in Network Monitor | Test: sharing events produce correct action types for Network Monitor |
| 11 | Premium-gated (Digital Representative) | Test: free tier can see peers but cannot establish sharing relationships |
| 12 | 40+ new tests. All existing tests pass. Privacy audit clean. | `npx vitest run` — 3,418+ total, 0 failures. `npx tsc --noEmit` clean. |

---

## Repo Enforcement Check

Before committing, verify:

```bash
# Confirm no network code in packages/core/
grep -rn "import.*net\b\|import.*http\|import.*dns\|import.*dgram\|import.*fetch" packages/core/network/ --include="*.ts"  # Must be empty

# Confirm Gateway services are in packages/gateway/
ls packages/gateway/services/network-discovery-service.ts packages/gateway/services/network-transport-service.ts

# Confirm premium gate
grep -n "'semblance-network'" packages/core/premium/premium-gate.ts

# Confirm shared context is separate from knowledge graph
grep -rn "import.*knowledge" packages/core/network/shared-context-store.ts --include="*.ts"  # Must be empty — shared context store doesn't import from knowledge graph

# Confirm all tests pass
npx tsc --noEmit && npx vitest run
```

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 5 | 5 |
| 2 | 7 | 12 |
| 3 | 7 | 19 |
| 4 | 6 | 25 |
| 5 | 4 | 29 |
| 6 | 5 | 34 |
| 7 | 4 | 38 |
| 8 | 4 | 42 |

**Total: 42 new tests. Baseline + new = 3,376 + 42 = 3,418.**

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,418+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. Which existing modules were reused (with file paths)
5. Exit criteria checklist — each criterion (all 12) with PASS/FAIL and evidence
6. Repo enforcement check results (network code not in core, Gateway services exist, premium gate present)
7. Confirmation that SharedContextStore is independent from knowledge graph
