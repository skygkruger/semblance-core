# SEMBLANCE FOR BUSINESS
## VERIDIAN SYNTHETICS — Sovereign AI for Organizations That Handle Private Information
### Specification v1.0 — Post-Launch Roadmap Item

> **Status:** Architecture locked. Implementation deferred until after consumer launch.  
> **Authority:** Sky Kruger (Human Orbital Director) + Claude (AI Orbital Director)  
> **Critical distinction:** Semblance for Business is a completely isolated product variant — not the consumer app with features hidden or unlocked. It shares the sovereign architecture. The product model is fundamentally different.

---

## The Distinction That Matters

Consumer Semblance: one user, one knowledge graph, personal life orchestration.  
Semblance for Business: multiple users, partitioned knowledge graphs, shared organizational intelligence with role-based access, compliance-grade audit chain.

The sovereign architecture is identical. The data model, access control, and compliance surface are completely different. Building Business as a toggle on Consumer would compromise both products. It is a separate build.

---

## The Market Problem

Small organizations that handle private information — law firms, medical practices, financial advisors, investigative journalists — face a specific and acute problem with AI adoption:

Cloud AI is structurally incompatible with their professional obligations.

- **Law firms:** ABA Model Rule 1.6 requires reasonable measures to prevent unauthorized disclosure of client information. Sending client matter data to OpenAI or Anthropic is not a "reasonable measure." State bar ethics opinions are increasingly hostile to cloud AI for client work.
- **Medical practices:** HIPAA requires a Business Associate Agreement before PHI touches any service. Major cloud AI providers have limited BAA coverage. More importantly, the fundamental architecture — your data on their servers — is incompatible with the spirit of patient privacy.
- **Financial advisors:** SEC custody rules and fiduciary standards create friction with cloud AI for client data. Client financial information processed by a third party raises custody and confidentiality questions.
- **Investigative journalists:** Source protection is the foundation of the profession. Cloud AI processing communications about sources creates records the provider holds.

These organizations want AI. They cannot use cloud AI without compromising their professional obligations. Semblance for Business is the only AI that is structurally compatible with those obligations.

---

## What Semblance for Business Adds

### 1. Multi-User Knowledge Graph with Partitioned Access Control

The firm's shared intelligence — document archive, client records, matter files, precedent database, institutional knowledge — is indexed into a shared knowledge substrate. Access control is enforced at the knowledge graph partition level by the Core.

```
Partition structure (law firm example):
├── firm/                    — all attorneys can read
│   ├── precedents/
│   ├── templates/
│   └── policies/
├── matter/portland-corp/    — matter team only
│   ├── emails/
│   ├── documents/
│   └── timeline/
├── matter/seattle-med/      — different matter team
│   └── [partition isolated]
└── admin/                   — admin role only
    ├── billing/
    └── personnel/
```

The AI cannot cross partition boundaries regardless of prompting. Cross-partition retrieval is blocked at the knowledge graph layer — the model never sees data it isn't authorized to see because the retrieval system doesn't return it. This is enforced by architecture, not by instruction.

### 2. Role-Based Autonomy Framework

Different employees have different trust levels with different action types. Role configuration is an admin function.

| Role | Email | Calendar | Matter docs | Client comms | Billing |
|------|-------|----------|-------------|-------------|---------|
| Founding Partner | Alter Ego | Alter Ego | Alter Ego | Alter Ego | Alter Ego |
| Associate | Partner | Partner | Partner | Guardian | No access |
| Paralegal | Partner | Partner | Guardian | Guardian | No access |
| Office Manager | Partner | Alter Ego | No access | No access | Partner |
| Client | Guardian | Guardian | Read-only own matter | Guardian | Read-only own |

Autonomy tiers are set per-role per-domain by the admin. Individual employees cannot elevate their own tier. Tier changes are logged to the audit chain as admin actions.

### 3. Compliance Audit Chain

The Merkle audit chain becomes a compliance artifact rather than just a user-facing transparency tool.

**For law firms:** Every AI action touching a client matter is logged, signed, and exportable as a compliance record. Billing records can be auto-generated from the audit trail — "Semblance prepared meeting brief for Portland Corp matter: 0.3 hours AI-assisted research."

**For medical practices:** Every AI action touching a patient record carries a timestamp, provider identity, and action type that satisfies HIPAA audit requirements. The audit chain is HIPAA-compliant without additional configuration.

**For financial advisors:** Every AI action is logged for SEC examination readiness. The sovereignty report demonstrates that client data never touched a cloud service — material for examination documentation.

The compliance audit chain is exportable in structured formats: JSON-LD for legal e-discovery, HL7-compatible for healthcare audit, CSV for financial compliance.

### 4. Client Matter Isolation

Each client, patient, or account has an isolated knowledge graph partition managed by the admin. Partition creation and deletion are admin-only actions, logged to the audit chain.

- Adding a new client matter: admin creates partition, assigns matter team, sets access rules
- Closing a matter: admin can archive partition (retained, read-only) or delete (purged with certificate)
- Matter handoff: admin transfers partition access to new team member
- Conflict check: before opening a new matter, the system checks all partition metadata for conflict signals — without exposing the conflicting matter's contents

### 5. Shared Organizational Intelligence

The `firm/` partition is the shared knowledge substrate all authorized users contribute to and read from. The AI can reason across the firm's institutional knowledge — precedents, templates, past matter outcomes — when working on any matter the user is authorized to access.

This is the capability that makes the product genuinely powerful for professional service firms. The AI knows the firm's work, the firm's style, the firm's history — and applies it to new matters. No cloud AI can offer this for a small firm because the data required to build that intelligence is exactly the data they can't send to the cloud.

### 6. Team Coordination via Headscale Mesh

Each employee's Semblance instance is a node on the firm's private mesh. The firm runs its own Headscale coordination server (VERIDIAN can host it as a managed service, or the firm runs it on-premises). Context sharing between team members is role-governed.

Partners see across all matters. Associates see only assigned matters. Context flows through the Semblance Network architecture adapted for organizational rather than personal consent — role assignment is the consent mechanism.

---

## The Sales Motion

The pitch to a small law firm is five sentences:

> "Your firm wants to use AI. You can't use ChatGPT or Copilot because your ethics obligations require reasonable measures to protect client confidentiality. Semblance for Business processes everything on your firm's servers. Your client data never touches any cloud service. Here is your monthly sovereignty report, signed with your firm's device key, proving it."

The sovereignty report is the closing argument. No competing product can produce it because no competing product has the architecture that makes it true.

---

## Pricing Model

| Tier | Price | Notes |
|------|-------|-------|
| Small firm (2–10 users) | $X/user/month | Minimum 2 users |
| Mid-size firm (11–50 users) | $X/user/month (volume discount) | Includes dedicated support |
| Enterprise deployment (50+ users, on-premises) | Custom / annual contract | On-premises Headscale, custom compliance reporting |
| Managed compliance reporting add-on | $X/month | Automated monthly compliance exports in required formats |

Exact pricing set at launch. The small firm tier must be priced below what a solo associate costs per hour — the ROI calculation must be immediate and obvious.

---

## Target Verticals in Priority Order

1. **Small law firms (2–20 attorneys):** Highest urgency — ethics rules create explicit cloud AI friction. State bar guidance is increasingly concrete. The attorney-client privilege protection story is immediately compelling to the target buyer (managing partner).

2. **Independent financial advisors (RIA, wealth management):** SEC fiduciary standard + client data sensitivity. Smaller firms with 1–5 advisors are underserved by enterprise compliance software. Semblance for Business fits their scale.

3. **Private medical practices (5–50 providers):** HIPAA compliance + patient trust differentiation. Community practices competing against hospital systems can use sovereign AI as a patient trust differentiator.

4. **Investigative journalism organizations:** Source protection is existential. Smaller investigative outlets (The Intercept, ProPublica, regional investigative teams) have the sensitivity concern without enterprise IT infrastructure to evaluate solutions.

5. **Executive assistants at sensitive organizations:** Individual EA managing confidential information for a C-suite — the consumer app with business extensions may suffice, but the org's IT department needs the compliance story.

---

## Build Sequence

Semblance for Business shares the sovereign architecture and the SDK. It cannot be built before both are stable.

**Prerequisites:**
- Consumer app shipped and in production
- SDK architecture complete (even if SDK not yet launched)
- Tunnel infrastructure stable
- Minimum 6 months consumer production data

**Estimated timeline:** 12–18 months post consumer launch.

**Go-to-market path:** Start with 3–5 pilot law firms at reduced pricing in exchange for compliance feedback. Use their sovereignty reports and compliance experience to build the sales narrative for broader rollout.

---

*VERIDIAN SYNTHETICS — semblance.run*  
*Your intelligence. Your devices. Your rules. Your firm.*
