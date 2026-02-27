# Step 32 — Launch Preparation

## Implementation Prompt for Claude Code

**Sprint:** 6 — Becomes Undeniable  
**Builds on:** Everything. Every sprint, every step. This is the step that makes 31 steps of engineering visible to the world.  
**Test target:** 50+ new tests. All existing 3,638 tests must pass. TypeScript clean. Privacy audit clean.

---

## Context

You are implementing Step 32 of the Semblance build. Steps 1–31 are complete with 3,638 tests across 331 files, zero failures. This is the penultimate step — after this, only Step 33 (Final Validation + Ship) remains.

This step is unique: it produces both **code infrastructure** (Storybook, CI/CD, documentation generation, launch tests) and **content** (README, PRIVACY.md, landing page, blog post, press kit, app store descriptions). Claude Code is generating the content because it has read every file in the codebase and knows the architecture intimately — this produces more accurate documentation than writing it separately.

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code or content.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Nothing in `packages/core/` touches the network.
2. **RULE 2 — Gateway Only.** All external network calls flow through the Gateway via IPC.
3. **RULE 3 — Action Signing.** Every Gateway action is signed and audit-trailed.
4. **RULE 4 — No Telemetry.** Zero analytics or tracking.
5. **RULE 5 — Local Only Data.** All data on-device only.

These rules are referenced extensively in the generated documentation. Every privacy claim in the README, landing page, blog post, and press kit must be architecturally verifiable. Do NOT make claims that aren't enforced by the codebase.

---

## What You're Building

### Deliverable 1: Storybook Setup (semblance-ui)

Set up Storybook in `packages/semblance-ui/` for visual component development and review. This enables visual polish of every screen before device testing and app store submission.

**Requirements:**
- Storybook 8.x configured for React + TypeScript
- Stories for every shared component in `packages/semblance-ui/components/`
- Design token visualization (colors, spacing, typography from `packages/semblance-ui/tokens/`)
- Stories organized by category: Primitives, Composites, Screens
- Trellis design system theme applied globally
- `npm run storybook` launches from `packages/semblance-ui/`
- Storybook is dev-only — NOT included in production builds

**Key stories to create:**
- Design token showcase (all colors, spacing scale, typography scale)
- Button variants (primary, secondary, ghost, destructive)
- Card variants (standard, privacy dashboard card, attestation card)
- Navigation components (tab bar, settings list, sovereignty navigator)
- Screen layouts: Morning Brief, Privacy Dashboard, Living Will settings, Knowledge Graph, Adversarial Dashboard
- Responsive breakpoints demonstration

**Do NOT:**
- Add Storybook dependencies to production build
- Create stories that import from `packages/core/` (Storybook is UI-only)
- Use mock data that contains real user patterns (use obviously synthetic data)

### Deliverable 2: CI/CD Pipeline

Create GitHub Actions workflows for automated quality enforcement.

**Workflows to create:**

`.github/workflows/ci.yml` — Runs on every PR and push to main:
```yaml
# 1. TypeScript compilation check
# 2. Full test suite (npx vitest run)
# 3. Privacy audit (scripts/privacy-audit/)
# 4. Lint check
# 5. Build verification (Tauri build, React Native build check)
```

`.github/workflows/privacy-audit.yml` — Dedicated privacy enforcement:
```yaml
# 1. Scan packages/core/ for network imports (must find 0)
# 2. Scan packages/core/ for @semblance/dr imports (must find 0)
# 3. Scan for telemetry packages in dependencies (must find 0)
# 4. Verify audit trail integrity check passes
# 5. Report results as PR comment
```

`.github/workflows/release.yml` — Triggered on version tag:
```yaml
# 1. Full CI checks
# 2. Tauri build for macOS, Windows, Linux
# 3. Generate release notes from git log
# 4. Create GitHub release with binaries
```

**Important CI constraints:**
- CI runs entirely locally — no cloud build services that receive source code
- No secrets or tokens in CI output
- Privacy audit failure blocks merge (required check)
- Test failure blocks merge (required check)

### Deliverable 3: Documentation Suite

Generate these documentation files at the repo root. Content must be accurate to the actual codebase — read the code, don't guess.

#### README.md

**Structure:**
1. **Hero section** — One-line description: "The world's first sovereign digital twin." Tagline: "Knowledge you forgot you gave it. Connections you didn't know were there."
2. **What Semblance Is** — 2-3 paragraphs. Not a chatbot. Not an assistant. A digital twin that understands your complete life, acts on your behalf, and is architecturally incapable of betraying your trust. Every byte stays on your device. Forever.
3. **The Five Inviolable Rules** — List the 5 architecture rules with one-sentence explanations. These are the core trust claims. Link to PRIVACY.md for verification instructions.
4. **Feature Overview** — Organized by sprint/capability tier:
   - Free tier: Universal Inbox, File Intelligence, Proactive Morning Brief, native device integration (contacts, calendar, location, weather, messaging, clipboard, voice), Visual Knowledge Graph, Import Everything
   - Digital Representative ($18/month or $349 lifetime): Alter Ego Mode, Financial Intelligence, Digital Representative email mode, Form Automation, Health Tracking, Subscription Management, Living Will, Semblance Witness, Inheritance Protocol, Semblance Network, Adversarial Self-Defense, Proof of Privacy reports
5. **Architecture Overview** — Brief description of the Core/Gateway/Desktop/Mobile split. Link to docs/ARCHITECTURE.md for details.
6. **Privacy Claims — Verifiable** — Explain how to verify: "Don't trust us. Read the code." Link to the privacy audit pipeline in `scripts/privacy-audit/`. Explain how to run it locally.
7. **Quick Start** — Prerequisites (Rust, Node.js, Ollama), clone, install, run. Keep it to 10 lines or fewer.
8. **Building from Source** — Tauri build for desktop, React Native for mobile. Platform-specific notes.
9. **Contributing** — Link to CONTRIBUTING.md.
10. **License** — MIT/Apache 2.0 dual license for semblance-core. Mention that Digital Representative features are premium-gated at runtime but source is auditable.
11. **Pricing** — $18/month, $349 lifetime, $27/$499 family. Launch discount: $249 lifetime for first 30 days.

**Tone:** Direct, confident, zero marketing fluff. Technical credibility first. The founding story is implicit — one person built this, but the README doesn't say that. The README says what the product does and how to verify the claims.

#### docs/PRIVACY.md

**Structure:**
1. **Privacy Architecture** — The 5 rules, explained in technical detail with code references
2. **Data Flow** — How data moves through the system: ingestion → Core processing → Gateway actions. Diagrams welcome (Mermaid).
3. **What Semblance Stores** — Complete list of data categories with where they're stored (SQLite tables, LanceDB embeddings, file paths)
4. **What Semblance Never Does** — Never sends data to cloud servers. Never phones home. Never tracks usage. Never shares data without explicit consent.
5. **Verification Instructions** — Step-by-step guide to verify privacy claims yourself:
   - Run the privacy audit: `npm run privacy-audit`
   - Scan for network imports: `grep -rn "import.*net\b" packages/core/`
   - Check the Gateway allowlist
   - Verify audit trail integrity
   - Read the Network Monitor in real-time
6. **Third-Party Dependencies** — List all dependencies and their privacy implications. Note that Ollama/llama.cpp/MLX run inference locally.
7. **Proof of Privacy Report** — Explain the cryptographically signed report and how to verify it

#### CONTRIBUTING.md

**Structure:**
1. **Code of Conduct** — Standard respectful contributor agreement
2. **Development Setup** — Prerequisites, clone, install, run tests
3. **Architecture Overview** — Brief guide to package structure (core, gateway, desktop, mobile, semblance-ui)
4. **Testing** — How to run tests, how to write tests, test naming conventions, privacy test requirements
5. **Pull Request Process** — PR template, required checks (CI, privacy audit, TypeScript), review process
6. **What Belongs Where** — The classification table for open-core vs proprietary code
7. **Design System** — Link to DESIGN_SYSTEM.md, how to use Storybook

#### GitHub Templates

Create these in `.github/`:
- `ISSUE_TEMPLATE/bug_report.md` — Bug report with platform, version, steps to reproduce
- `ISSUE_TEMPLATE/feature_request.md` — Feature request with use case focus
- `PULL_REQUEST_TEMPLATE.md` — Checklist: tests pass, TypeScript clean, privacy audit clean, no network imports in core

### Deliverable 4: Landing Page (semblance.run)

Generate a single-file HTML landing page at `docs/website/index.html`. This will be deployed to semblance.run.

**Page structure:**

1. **Hero** — "Knowledge you forgot you gave it. Connections you didn't know were there." + "Alter Ego Mode is live." CTA: Download (macOS, Windows, Linux, iOS, Android)
2. **The Problem** — "Every AI assistant you use sends your data somewhere. Semblance doesn't. Ever." Brief, punchy, 2-3 sentences.
3. **Feature Showcase** — Visual cards for top 6 features:
   - Alter Ego Mode (your AI takes the wheel)
   - Visual Knowledge Graph (see your life as a living map)
   - Living Will (your digital twin, exported and encrypted)
   - Adversarial Self-Defense (detects and neutralizes dark patterns)
   - Proof of Privacy (cryptographic proof your data never left)
   - Morning Brief (anticipates your day from everything it knows)
4. **The Privacy Promise** — The 5 rules as a designed element. "Read the code. Verify every claim." Link to GitHub.
5. **Pricing** — Three tiers:
   - Free: "Extraordinary. Better than anything at any price."
   - Digital Representative: $18/month — "Your AI advocate."
   - Lifetime: $349 ($249 launch price) — "Own it forever."
   - Family: $27/month or $499 lifetime — up to 5 users
6. **Open Source** — "The core is open source. Read every line. Trust nothing we say — verify it." Link to GitHub repo.
7. **Enterprise/SDK** — "Your CISO blocked ChatGPT. Your team still needs AI. Semblance's architecture is the answer." Contact link for $25K–$100K annual licensing.
8. **Footer** — Veridian Synthetics. Links to GitHub, Privacy, Documentation. "Built by one person. No VC. No compromises."

**Design requirements:**
- Trellis design system colors and typography
- Dark theme with deep backgrounds (the design system specifies these)
- Responsive: works on mobile, tablet, desktop
- No JavaScript frameworks — pure HTML/CSS with minimal JS for mobile menu and smooth scroll
- No tracking scripts. No analytics. No cookies. The website practices what the product preaches.
- Fast: <100KB total. No external fonts (use system font stack or embed a single weight).
- Include Open Graph meta tags for social sharing

### Deliverable 5: Launch Blog Post

Generate at `docs/website/blog/launch.md`:

**Title:** "Alter Ego Mode Is Live"

**Structure:**
1. **The Hook** — What would an AI that understood your entire life do differently? Not answer questions better. Act on your behalf, using knowledge you forgot you gave it, connecting dots you didn't know existed. Today, that AI exists. It runs on your hardware. It never sends your data anywhere. And it's open source.
2. **What Semblance Is** — Digital twin, not chatbot. Sovereign, not cloud. Brief, powerful explanation.
3. **The Alter Ego Moment** — Describe the experience: you wake up, check your Morning Brief, and discover your Semblance already drafted a response to that email using context from 6 months ago that you'd forgotten about. It connected your calendar conflict with a meeting you moved last week and proactively suggested a resolution. That's Alter Ego Mode.
4. **Why This Matters** — The privacy argument. Not as a defensive posture but as a capability unlock. Cloud AIs can't do what Semblance does because they don't have what Semblance has — your complete context, with zero data leaving your device.
5. **The Architecture** — Brief technical overview. Core/Gateway split. Five rules. Open source. Verify it yourself.
6. **The Sovereignty Features** — Living Will, Witness, Inheritance Protocol, Adversarial Self-Defense. These aren't features — they're rights. The right to export your digital self. The right to cryptographic proof of what your AI did. The right to pass your digital twin to someone you trust. The right to fight back against manipulation.
7. **Pricing and Access** — $18/month, $349 lifetime ($249 for launch). Free tier is extraordinary on its own.
8. **The Founding Story** (final paragraph) — "One person. No formal background. No venture capital. Built in weeks with the help of AI tools. If one person can build this, imagine what happens when a community of contributors joins in. The core is open source. Come help us make it better."

**Tone:** Not a press release. Not marketing copy. A person talking directly to people who care about this. Confident without being arrogant. Technical substance when it matters. The blog post should feel like the person who built it explaining why they built it.

**Length:** 1,200–1,800 words.

### Deliverable 6: Press Kit

Generate at `docs/press-kit/`:

**Files:**
- `README.md` — Press kit overview
- `fact-sheet.md` — Product facts, pricing, technical specs, founder info
- `press-release.md` — Standard press release format
- `faq.md` — Anticipated press questions and answers

**Fact Sheet contents:**
- Product: Semblance — The world's first sovereign digital twin
- Developer: Veridian Synthetics (veridian.run)
- Platforms: macOS, Windows, Linux, iOS, Android
- Pricing: Free tier / $18 month / $349 lifetime
- Open source: semblance-core on GitHub (MIT/Apache 2.0)
- Test count: 3,638+ automated tests
- Architecture: Local-only inference, Gateway isolation, zero telemetry
- Key features: Alter Ego Mode, Living Will, Semblance Witness, Inheritance Protocol, Adversarial Self-Defense, Proof of Privacy
- Contact: [sky@veridian.run or appropriate contact]

**Press Release:**
- Headline: "Veridian Synthetics Launches Semblance, the World's First Sovereign Digital Twin"
- Subhead: "Open-source personal AI runs entirely on user hardware, with cryptographic proof that data never leaves the device"
- Standard PR format: dateline, body (what/why/how), founder quote, availability, about section
- Founder quote should reflect the mission: sovereignty, privacy as capability, open source trust

**FAQ:**
- "How is this different from ChatGPT/Siri/Alexa?" — Architecture. They send your data to servers. Semblance doesn't. This isn't a policy — it's physics. The AI Core cannot reach the network.
- "If it's open source, how do you make money?" — Premium features (Digital Representative) are runtime-gated. The code is auditable. Revenue comes from the product experience, not hidden source code.
- "Can I verify the privacy claims?" — Yes. Run the privacy audit. Read the code. Check the Network Monitor. Generate a Proof of Privacy report.
- "Who built this?" — One person, with AI assistance. No venture capital. No enterprise backing. Just conviction that this technology should exist.
- "What AI models does it use?" — Runs Ollama/llama.cpp/MLX locally. No cloud inference. The models run on your hardware.

### Deliverable 7: App Store Preparation

Generate app store metadata files. These are NOT submissions — they're the content that Sky will use when submitting.

**`docs/app-store/ios/`:**
- `app-name.txt` — "Semblance"
- `subtitle.txt` — "Your Sovereign Digital Twin" (30 char max)
- `description.txt` — Full App Store description (4000 char max). Lead with the value prop, not the feature list. Privacy claims. Feature highlights. Pricing.
- `keywords.txt` — Up to 100 characters, comma-separated. Target: privacy, AI assistant, local AI, digital twin, personal AI, offline AI, sovereign, encrypted
- `promotional-text.txt` — 170 char promotional text for featuring
- `whats-new.txt` — "Initial release" with 3-5 key features
- `privacy-url.txt` — "https://semblance.run/privacy"
- `support-url.txt` — "https://semblance.run/support"

**`docs/app-store/android/`:**
- `title.txt` — "Semblance — Your Sovereign AI"
- `short-description.txt` — 80 char description
- `full-description.txt` — Full Play Store description (4000 char max)
- `tags.txt` — Play Store category tags

**TestFlight/Internal Testing notes:**
- `docs/app-store/testflight-notes.md` — Internal testing instructions, what to test, known limitations, feedback channels

### Deliverable 8: Repo Cleanup & License

**License files:**
- `LICENSE-MIT` — MIT License text
- `LICENSE-APACHE` — Apache 2.0 License text
- `LICENSE` — Dual license notice pointing to both files

**Git cleanup:**
- `.gitignore` review — ensure no build artifacts, node_modules, .env files, test databases, Storybook build output
- Verify no secrets in git history (grep for API keys, tokens, passwords in tracked files)

**Package.json updates:**
- Update `package.json` at root with correct metadata: name, version (1.0.0), description, repository, license, author (Veridian Synthetics), homepage (semblance.run)
- Update any sub-package `package.json` files similarly

---

## Commit Strategy

### Commit 1: Storybook Setup + Component Stories (8 tests)

Set up Storybook in `packages/semblance-ui/`.

- Install Storybook 8.x with React + TypeScript + Vite builder
- Configure `.storybook/main.ts` and `.storybook/preview.ts`
- Apply Trellis design system theme globally in preview
- Create design token showcase story (colors, spacing, typography)
- Create stories for 5+ core components (Button, Card, SettingsList, TabBar, etc.)
- Add `storybook` script to `packages/semblance-ui/package.json`
- Verify Storybook not in production dependencies

**Tests:** tests/launch/storybook-config.test.ts
1. Storybook config files exist
2. Preview applies Trellis theme
3. Storybook is devDependency only (not in production)
4. At least 5 story files exist
5. Design token showcase story exists
6. Stories do not import from packages/core/
7. Storybook build produces output (static build check)
8. No network imports in story files

### Commit 2: CI/CD Workflows (6 tests)

Create GitHub Actions workflow files.

- `.github/workflows/ci.yml`
- `.github/workflows/privacy-audit.yml`
- `.github/workflows/release.yml`
- GitHub issue templates and PR template

**Tests:** tests/launch/ci-config.test.ts
1. CI workflow file exists and is valid YAML
2. Privacy audit workflow exists and is valid YAML
3. Release workflow exists and is valid YAML
4. CI includes TypeScript check step
5. CI includes test run step
6. Privacy audit includes network import scan

### Commit 3: Documentation — README + PRIVACY.md (6 tests)

Generate README.md and docs/PRIVACY.md.

- README.md at repo root — complete product documentation
- docs/PRIVACY.md — detailed privacy architecture and verification
- Both reference actual code paths and architecture

**Tests:** tests/launch/documentation.test.ts
1. README.md exists and is non-empty
2. README.md contains the 5 inviolable rules
3. README.md contains pricing information ($18/month, $349 lifetime)
4. PRIVACY.md exists and is non-empty
5. PRIVACY.md contains verification instructions
6. PRIVACY.md references scripts/privacy-audit/

### Commit 4: Documentation — CONTRIBUTING + Templates (4 tests)

- CONTRIBUTING.md at repo root
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

**Tests:** tests/launch/community.test.ts
1. CONTRIBUTING.md exists and contains development setup
2. Bug report template exists
3. Feature request template exists
4. PR template includes privacy audit checklist item

### Commit 5: Landing Page (6 tests)

Generate `docs/website/index.html`.

- Single-file HTML/CSS landing page
- Trellis design system styling
- Responsive layout
- No tracking scripts
- All content inline (no external dependencies)
- Open Graph meta tags

**Tests:** tests/launch/landing-page.test.ts
1. index.html exists and is valid HTML
2. Page contains no tracking scripts (no analytics, no cookies)
3. Page contains pricing information
4. Page contains "Alter Ego Mode" headline
5. Page is under 150KB total
6. Page contains Open Graph meta tags

### Commit 6: Blog Post + Press Kit (6 tests)

Generate launch blog post and press kit files.

- `docs/website/blog/launch.md`
- `docs/press-kit/README.md`
- `docs/press-kit/fact-sheet.md`
- `docs/press-kit/press-release.md`
- `docs/press-kit/faq.md`

**Tests:** tests/launch/marketing.test.ts
1. Blog post exists and is 1,200–1,800 words
2. Press kit README exists
3. Fact sheet contains correct pricing
4. Press release follows standard format (headline, dateline, body, about)
5. FAQ addresses privacy verification question
6. Blog post does not contain placeholder text

### Commit 7: App Store Metadata (5 tests)

Generate app store content files.

- `docs/app-store/ios/` — all metadata files
- `docs/app-store/android/` — all metadata files
- `docs/app-store/testflight-notes.md`

**Tests:** tests/launch/app-store.test.ts
1. iOS description exists and is under 4000 characters
2. iOS keywords exist and are under 100 characters
3. Android full description exists and is under 4000 characters
4. TestFlight notes exist
5. iOS subtitle is under 30 characters

### Commit 8: Repo Cleanup + License + Package Updates (5 tests)

Final repo housekeeping.

- License files (MIT + Apache 2.0 dual)
- .gitignore review and update
- package.json metadata updates (version 1.0.0, repository, homepage, author)
- Secret scan (grep for potential leaked keys/tokens)
- Verify all documentation links are internally consistent

**Tests:** tests/launch/repo-hygiene.test.ts
1. LICENSE file exists with dual license notice
2. LICENSE-MIT exists with MIT text
3. LICENSE-APACHE exists with Apache 2.0 text
4. Root package.json has version "1.0.0"
5. No files contain potential secret patterns (API keys, tokens)

### Commit 9: Launch Readiness Verification (4 tests)

Final cross-cutting verification.

**Tests:** tests/launch/launch-readiness.test.ts
1. All documentation files reference correct domain (semblance.run)
2. Privacy claims in README match actual privacy audit results
3. Feature list in landing page matches actual codebase capabilities
4. Test count exceeds 3,688 (3,638 + 50 new)

---

## Content Guidelines for All Generated Text

**Voice:** Direct, confident, technical. Semblance is not marketed — it's explained. The architecture speaks for itself. Privacy claims are always accompanied by verification instructions. Features are described by what they do for the user, not by technical implementation details.

**What NOT to write:**
- "Revolutionary" / "groundbreaking" / "game-changing" — let the product speak
- Vague privacy claims without verification paths
- Feature lists without context for why they matter
- Comparisons that name competitors by name (say "cloud AI" not "ChatGPT" in formal docs — blog post can be more specific)
- Marketing superlatives that can't be verified

**What TO write:**
- Specific technical claims that can be verified by reading code
- The "why" behind features, not just the "what"
- Verification instructions for every privacy claim
- The connection between privacy and capability: local data = better AI

**Pricing — LOCKED, do not modify:**
- Free: $0 (everything through Sprint 3 + Sprint 4-5 free features)
- Digital Representative: $18/month
- Lifetime: $349 (launch discount $249 for first 30 days)
- Family: $27/month or $499 lifetime (up to 5 users)
- Enterprise: $25K–$100K annual SDK licensing (year 2, not launch focus)

**Naming — LOCKED:**
- Product: "Semblance" (never "Semblance AI" or "Semblance App")
- Company: "Veridian Synthetics"
- Premium tier: "Digital Representative" (never "Premium")
- Domain: semblance.run (parent: veridian.run)

---

## What NOT to Do

1. **Do NOT add tracking or analytics to the landing page or any generated content.** The website practices what the product preaches.
2. **Do NOT generate placeholder content.** Every word must be final copy ready for launch. No "[INSERT HERE]" or "TODO" markers.
3. **Do NOT include Storybook in production builds.** It is dev-only tooling.
4. **Do NOT make privacy claims that aren't architecturally enforced.** If the code doesn't enforce it, don't claim it.
5. **Do NOT use the word "Premium" in any user-facing content.** The paid tier is "Digital Representative."
6. **Do NOT add external dependencies to Storybook that would affect the main build.** Storybook deps are isolated to semblance-ui devDependencies.
7. **Do NOT generate documentation that contradicts CLAUDE.md or DESIGN_SYSTEM.md.** These are the canonical references.
8. **Do NOT include specific journalist names or media outlet contact information in generated content.** The press kit is general — specific outreach is handled separately.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Storybook configuration details and story organization
- CI/CD workflow structure and step ordering
- Documentation wording and structure within the guidelines above
- Landing page CSS/layout decisions within the Trellis design system
- Blog post tone and narrative flow
- App store description optimization
- .gitignore updates

You MUST escalate for:
- Any new production dependency
- Any change to the architecture rules or privacy claims
- Any pricing changes (pricing is LOCKED)
- Any modification to existing source code beyond package.json metadata
- Any addition of tracking or analytics
- Any change to the repo split policy

---

## Repo Enforcement Check

Before committing, verify:

```bash
# All tests pass
npx tsc --noEmit && npx vitest run

# No network imports in core (existing check)
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bdns\b\|import.*\bfetch\b" packages/core/ --include="*.ts"

# No DR imports in core (existing check)
grep -rn "from.*@semblance/dr" packages/core/ --include="*.ts"

# No tracking in landing page
grep -n "analytics\|google-analytics\|gtag\|facebook\|pixel\|tracking" docs/website/index.html

# Storybook not in production deps
grep -n "storybook" packages/semblance-ui/package.json | grep -v devDependencies

# No secrets in repo
grep -rn "sk-\|api_key.*=\|PRIVATE_KEY\|password.*=" --include="*.ts" --include="*.md" --include="*.html" --include="*.json" . | grep -v node_modules | grep -v ".git/"
```

---

## Exit Criteria Checklist

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Storybook runs with component stories | `cd packages/semblance-ui && npm run storybook` launches |
| 2 | CI/CD workflows are valid YAML | Parse test passes |
| 3 | README.md is complete with features, pricing, quick start | Content test passes |
| 4 | PRIVACY.md has verification instructions | Content test passes |
| 5 | CONTRIBUTING.md guides new contributors | File exists with dev setup |
| 6 | Landing page is under 150KB with no tracking | Size + content tests pass |
| 7 | Blog post is 1,200–1,800 words with correct tone | Word count test passes |
| 8 | Press kit has fact sheet, press release, FAQ | All files exist |
| 9 | App store metadata generated for iOS and Android | Files exist, length constraints met |
| 10 | License files present (MIT + Apache 2.0) | File existence tests pass |
| 11 | package.json updated to 1.0.0 | Version check passes |
| 12 | No secrets in repo | Secret scan passes |
| 13 | 50+ new tests. All existing tests pass. | `npx vitest run` — 3,688+ total, 0 failures |

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 8 | 8 |
| 2 | 6 | 14 |
| 3 | 6 | 20 |
| 4 | 4 | 24 |
| 5 | 6 | 30 |
| 6 | 6 | 36 |
| 7 | 5 | 41 |
| 8 | 5 | 46 |
| 9 | 4 | 50 |

**Total: 50 new tests. Baseline + new = 3,638 + 50 = 3,688.**

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,688+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. Word count for blog post (must be 1,200–1,800)
5. Landing page file size (must be under 150KB)
6. Exit criteria checklist — each criterion with PASS/FAIL and evidence
7. Repo enforcement check results
8. Confirmation that no tracking exists in any generated content
9. Confirmation that all pricing references match the locked pricing
10. Confirmation that "Premium" does not appear in any user-facing content (only "Digital Representative")
