# SEMBLANCE — Brand & Design System

## Canonical Reference Document
**Status:** Foundation Draft — Iterate From Here  
**Owner:** Sky Kruger, Orbital Director  
**Last Updated:** February 25, 2026  
**Applies To:** All Semblance product surfaces, marketing, documentation, app store presence

---

## Brand Philosophy

Semblance is a digital twin — a sovereign representation of the user that understands their complete life, acts on their behalf, and is architecturally incapable of betraying their trust. The brand must communicate this relationship.

### What the Brand Must Communicate

**Primary emotion:** *"I've got this. You don't need to worry."*

Not capability ("look what I can do"). Not safety ("we won't hurt you"). **Agency on your behalf** — the quiet confidence of something that has already handled the thing you were worried about, using knowledge you forgot you gave it, connecting dots you didn't know existed.

### Brand Tensions to Navigate

| Tension | Wrong Direction | Right Direction |
|---------|----------------|-----------------|
| Privacy | Paranoid, defensive, fortress | Confident, sovereign, empowering |
| Sophistication | Cold, clinical, corporate | Warm, modern, premium |
| Intelligence | Showy, over-animated, "look at me" | Understated, anticipatory, "already done" |
| Technology | Sci-fi, neon, cyberpunk | Grounded, refined, alive |
| Autonomy | Scary, unpredictable | Trustworthy, competent, deferential |

### Brand Personality

If Semblance were a person, it would be:
- The executive assistant who anticipated what you needed before you asked
- Impeccably organized but never rigid
- Speaks only when it has something worth saying
- Treats you as intelligent and capable — never condescending
- Confident without being arrogant
- Present without being intrusive

### Voice and Tone (In-Product)

- **Direct.** No filler words. No hedging. "Your meeting with Sarah conflicts with the dentist appointment you rescheduled from last week" — not "It looks like there might be a potential scheduling issue."
- **Confident.** Statements, not suggestions. "I've drafted a response" — not "Would you like me to try drafting something?"
- **Understated.** Never uses "!" in UI copy. Never "Great news!" or "Exciting update!" The quality of the action speaks for itself.
- **Warm without being familiar.** Helpful, not chatty. Respectful, not formal.
- **Never apologetic for being capable.** "Here's what I found" — not "I hope this helps!"

---

## Color System

### Design Principle

The palette is built on **warm darkness with luminous accent**. Backgrounds are deep and rich — never pure black (which feels dead on screens) and never cool-gray (which feels corporate). The Veridian accent color provides life, energy, and brand recognition against this foundation.

### The Veridian Accent — Signature Color

The accent color is inherited from the Veridian Synthetics parent brand, creating instant ecosystem recognition across all Veridian products (Semblance, Conduit, MIRRORFALL, Trellis).

The Veridian color is a distinctive emerald-teal — not the generic blue that 80% of tech companies use, not the bright green that reads as "eco/organic." It sits in a unique space that reads as both intelligent and alive.

```
Primary Accent
├── --accent:          #00D4A1    // Primary. Buttons, links, active states, logo mark
├── --accent-bright:   #3DFFA0    // Sparingly. Particle highlights, biometric pulse, success
├── --accent-glow:     #00D4A140  // 25% opacity. Hover halos, bloom effects, particle bg
├── --accent-subtle:   #00D4A114  // 8% opacity. Selected backgrounds, active nav items
└── --accent-muted:    #00D4A10A  // 4% opacity. Ambient dot field resting state
```

**Usage rules:**
- `--accent` is the workhorse. Buttons, links, toggle-on states, the logo S bottom half.
- `--accent-bright` is reserved for moments of emphasis. The biometric approval pulse, success confirmations, particle trail highlights. Overuse dilutes its impact.
- `--accent-glow` is for soft environmental effects. Never used on text or solid UI elements.
- Never place `--accent` text on `--accent` backgrounds. Use `--bg-deep` or `--text-primary` on accent backgrounds.

### Background Palette

```
Backgrounds (warm dark foundation)
├── --bg-deep:         #0A0E14    // Canvas. The deepest layer. Near-black with warm blue undertone
├── --bg-surface:      #111820    // Cards, panels, content containers
├── --bg-elevated:     #1A2230    // Modals, popovers, briefing cards, dropdowns
├── --bg-hover:        #222D3D    // Hover state for interactive surfaces
└── --bg-active:       #2A3750    // Active/pressed state for interactive surfaces
```

**Why not pure black (#000000)?** Pure black creates harsh contrast with text and feels lifeless on modern displays. The warm blue undertone in `#0A0E14` gives depth and prevents the "staring into the void" feeling. Every background step adds warmth and blue, creating a natural sense of elevation and layering.

### Text Palette

```
Text (warm off-whites and muted tones)
├── --text-primary:    #E8ECF1    // Body text, headings, primary content
├── --text-secondary:  #8899AA    // Labels, timestamps, supporting text
├── --text-tertiary:   #556677    // Placeholders, disabled text, de-emphasized content
└── --text-inverse:    #0A0E14    // Text on accent-colored backgrounds
```

**Why not pure white (#FFFFFF)?** Pure white on dark backgrounds creates eye strain and feels harsh. `#E8ECF1` is perceptually near-white but significantly more comfortable for extended reading.

### Semantic Colors

```
Semantic (functional meaning)
├── --success:         #00D4A1    // The accent itself — green-teal reads as positive
├── --warning:         #FFB347    // Warm amber. Attention without alarm
├── --error:           #FF6B6B    // Soft red. Clear without aggressive
├── --info:            #6BB8FF    // Cool blue. Neutral informational
└── --destructive:     #FF4757    // Stronger red. Irreversible actions only
```

### Border and Divider

```
Structural (subtle separation)
├── --border-default:  #1E2A3A    // Card borders, dividers, input outlines
├── --border-hover:    #2A3A4E    // Hovered input outlines
├── --border-focus:    #00D4A1    // Focused inputs — accent color
└── --border-subtle:   #151D28    // Very subtle separators within surfaces
```

---

## Typography

### Design Principle

Typography should be **invisible-good** — it should never be the thing people notice. They should notice the content it carries. The typeface choice serves legibility, modern credibility, and technical substance without calling attention to itself.

### Typeface Selection

**Primary: Geist Sans** (by Vercel)  
Modern, geometric, designed for interfaces. Reads as technically credible and premium without being cold. Free and open source.

**Monospace: Geist Mono** (by Vercel)  
For attestation hashes, technical content, code references, privacy audit output. Consistent visual family with the primary.

**Fallback stack:** `"Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`  
**Mono fallback:** `"Geist Mono", "SF Mono", "Fira Code", "Cascadia Code", monospace`

**Why Geist over Inter?** Both are excellent interface typefaces. Geist is slightly more geometric and feels more forward-looking. It's what Vercel uses across their product, lending developer credibility. The mono variant is a bonus — one family for everything.

**If Geist is unavailable or problematic:** Fall back to Inter (equally good, wider adoption) or Plus Jakarta Sans (slightly warmer, more friendly).

### Type Scale

All sizes in `px` at base. Scale follows a ~1.25 ratio (Major Third) with practical adjustments.

```
Display & Headings
├── --text-display:    64px / 1.1  / weight 600  // Hero sections, landing page
├── --text-h1:         40px / 1.2  / weight 600  // Page titles
├── --text-h2:         32px / 1.25 / weight 600  // Section headings
├── --text-h3:         24px / 1.3  / weight 600  // Subsections
├── --text-h4:         20px / 1.4  / weight 600  // Card titles, group headers
└── --text-h5:         18px / 1.4  / weight 600  // Minor headings

Body & UI
├── --text-body:       16px / 1.6  / weight 400  // Default body text
├── --text-body-sm:    14px / 1.5  / weight 400  // Secondary body, dense UI
├── --text-caption:    12px / 1.4  / weight 400  // Timestamps, labels, metadata
├── --text-overline:   11px / 1.3  / weight 600  // Uppercase labels, letterspaced +0.05em
└── --text-micro:      10px / 1.3  / weight 500  // Badges, status indicators

Interactive
├── --text-button:     14px / 1.0  / weight 500  // Button labels
├── --text-button-sm:  12px / 1.0  / weight 500  // Small button labels
└── --text-input:      16px / 1.4  / weight 400  // Input text (16px minimum for iOS)
```

### Wordmark

**"SEMBLANCE"** — Set in Geist Sans at weight 500, letterspaced `+0.04em`, all uppercase. Clean and understated. The logo mark (mirrored S) does the visual heavy lifting; the wordmark is the complement, not the star.

**"VERIDIAN SYNTHETICS"** — When the parent company name appears (footer, legal, about), same treatment but at `--text-caption` size in `--text-secondary` color. Subsidiary relationship clear but not competing.

---

## Logo

### Concept: The Mirrored S

The S letterform has natural bilateral symmetry on the horizontal axis. This maps directly to the product concept: the top half is you (the user), the bottom half is your digital twin.

### Construction

**The mark:** An "S" divided at the horizontal midpoint.

**Top half — The User:**  
Clean, solid geometry. Crisp edges, defined form. Rendered in `--text-primary` (warm off-white). This is the person — legible, present, concrete.

**Bottom half — The Digital Twin:**  
Mirrors the S shape but rendered in a particle dispersion effect. The form is composed of discrete points that are slightly more scattered at the extremities. Rendered in `--accent` (#00D4A1, the Veridian teal). The digital self — familiar but transformed. Recognizable as the same letter, but existing in a different state.

**The midline transition:**  
The division is not a hard cut. The solid geometry of the top half begins to dissolve into particles right at the horizontal center. The dissolution is gradual — by the bottom curve of the S, the particles are more dispersed but still clearly holding the letterform. It should feel like the solid form is *becoming* something else — not breaking apart, but evolving.

**Color at the transition:**  
The top half's warm off-white fades through a brief gradient into the Veridian accent at the midline. The particles in the bottom half have varying opacity — brightest at the center of the form, softer glow at the dispersed edges. This connects visually to the Veridian Synthetics parent logo aesthetic (luminous particles emerging from darkness).

### Variants

| Variant | Usage | Description |
|---------|-------|-------------|
| Full mark | Hero placements, splash, marketing | Particle S + wordmark below |
| Icon mark | App icon, favicon, small placements | Particle S only, simplified particle density |
| Simplified mark | Favicon (16x16), tab bar, notification | Top half solid / bottom half solid accent color, no particles. Same concept, simpler execution |
| Wordmark only | Inline text references, legal, footer | "SEMBLANCE" in Geist Sans 500, letterspaced |

### Animation

**At rest:** The bottom-half particles hold their shape with a very subtle ambient drift — individual points move 1-2px in random directions and return. The mark breathes.

**On hover/interaction:** The particles expand slightly outward (3-5px) and reconverge over 600ms. The digital twin responds to attention.

**On significant action (biometric approval, Witness attestation):** Brief pulse of `--accent-bright` through the particle field, expanding outward like a ripple. The twin acknowledges the moment.

**Performance:** Particle animation uses CSS transforms and opacity only (GPU-composited). No JavaScript animation loop for the resting state. Interaction animations triggered by CSS `:hover` or JS class toggle.

### Scalability Rules

- **≥64px:** Full particle effect with individual visible dots
- **32–63px:** Reduced particle count, tighter clustering
- **16–31px:** Simplified mark (solid top / solid accent bottom, no particles)
- **<16px:** Solid accent S only (single color, no division)

---

## Spatial System

### Spacing Scale

Base unit: `4px`. All spacing derives from multiples of 4.

```
Spacing tokens
├── --space-0:     0px
├── --space-1:     4px      // Tight: between icon and label
├── --space-2:     8px      // Default gap within components
├── --space-3:     12px     // Between related items in a group
├── --space-4:     16px     // Between sections within a card
├── --space-5:     20px     // Card padding (small)
├── --space-6:     24px     // Card padding (default), between cards
├── --space-8:     32px     // Section separation within a screen
├── --space-10:    40px     // Major section breaks
├── --space-12:    48px     // Screen-level padding (mobile)
├── --space-16:    64px     // Screen-level padding (desktop)
└── --space-20:    80px     // Hero section vertical padding
```

### Border Radius

```
Radius tokens
├── --radius-sm:   4px      // Buttons, badges, small elements
├── --radius-md:   8px      // Cards, inputs, panels
├── --radius-lg:   12px     // Modals, large cards
├── --radius-xl:   16px     // Feature cards, hero elements
└── --radius-full: 9999px   // Circular elements, pills, avatars
```

### Elevation (Shadows)

Dark themes use subtle light-edge glow rather than traditional drop shadows.

```
Elevation tokens
├── --shadow-sm:   0 1px 2px rgba(0,0,0,0.3), 0 0 1px rgba(0,212,161,0.05)
├── --shadow-md:   0 4px 12px rgba(0,0,0,0.4), 0 0 2px rgba(0,212,161,0.08)
├── --shadow-lg:   0 8px 24px rgba(0,0,0,0.5), 0 0 4px rgba(0,212,161,0.1)
└── --shadow-xl:   0 16px 48px rgba(0,0,0,0.6), 0 0 8px rgba(0,212,161,0.12)
```

The secondary shadow in each level adds a barely-perceptible Veridian glow to elevated surfaces. Not enough to consciously notice. Enough to feel.

---

## The Living Background — Particle Dot Field

### Concept

The application background is alive. A subtle dot matrix breathes and responds to the user's presence, creating the feeling that the environment is aware — that the digital twin is always there, always processing, always ready.

This is inspired by the ambient backgrounds in tools like Railway and Claude Cowork, but uniquely Semblance: the dots are rendered in the Veridian accent color and their behavior reflects the product's nature as a living, sovereign intelligence.

### Specification

**Grid:**
- Dot spacing: 28px (adjustable per viewport)
- Dot size: 2px
- Base opacity: `--accent-muted` (4%)
- Dots have a slight random offset from perfect grid positions (±3px), creating an organic field rather than rigid graph paper

**Breathing animation:**
- Opacity oscillates between 4% and 10%
- Traveling wave pattern crossing the screen over 10 seconds
- Direction: diagonal, top-left to bottom-right
- The wave is sinusoidal, not linear — smooth crescendo and decrescendo
- Multiple overlapping waves at different speeds (10s, 14s, 18s) create organic, non-repeating patterns

**Cursor/touch interaction:**
- Nearby dots (within 100px radius) brighten to 15-20% opacity
- Dots within the radius connect to their nearest 2-3 neighbors with faint lines (`--accent-glow`)
- Lines fade in over 200ms, out over 500ms as the cursor moves
- Creates a local constellation that follows attention
- The effect is subtle — the user shouldn't feel like they're playing with the background

**Mobile considerations:**
- Reduce dot density (40px spacing) for performance
- Disable cursor interaction (no hover on touch)
- Breathing animation stays — it's computationally cheap
- Touch interaction: brief constellation on tap, fades over 1 second

**Performance:**
- Render via `<canvas>` element, not DOM nodes
- 60fps on mid-range hardware (Pixel 6a tier)
- Pause animation when tab/app is in background
- Total frame budget: <2ms per frame
- Fallback: static dot field at fixed 6% opacity if canvas performance is insufficient

**Z-index and content relationship:**
- Dot field sits at the lowest z-level
- Content surfaces (cards, panels, modals) have solid backgrounds that fully occlude the field
- The field is visible in margins, gutters, empty states, and negative space
- It is the texture of the environment, never competing with content

---

## The Biometric Approval Briefing Card

### Context

This is Semblance's hero interaction — the moment where the product's value is most viscerally felt. When Semblance drafts an action that requires user authorization (Partner and Guardian autonomy tiers), it presents a **briefing card**: a rich, designed notification that shows what the AI wants to do, why, and what context it connected.

The user reviews, then biometrically authorizes. The action is cryptographically witnessed. This transforms approval from a speed bump into a **power moment** — the user isn't being interrupted, they're being consulted.

### Design Specification

**Card anatomy (top to bottom):**

1. **Status bar** — Thin accent-colored line at top. Pulses slowly while awaiting approval.
2. **Action headline** — What Semblance wants to do. Bold, concise. "Reply to Sarah Chen's email about the Q2 budget."
3. **Context chain** — The *why*. A compact visual showing which data sources Semblance connected. Example: `📧 Email from Sarah (Feb 20) → 📅 Budget meeting (Feb 18) → 📄 Q2 projections.xlsx`. Rendered as a horizontal chain of small pills with connector lines. Tappable to expand details.
4. **Draft preview** — The actual content Semblance will send/execute. Scrollable if long. Full text, not a summary.
5. **Confidence indicator** — How certain Semblance is about this action. Not a percentage (that feels robotic). A simple three-tier indicator: "Standard" / "High confidence" / "Flagged for review" — with a one-line explanation if flagged.
6. **Action bar** — Two options:
   - **Approve** — Accent-colored button. Triggers biometric authentication (FaceID/fingerprint). Not a simple tap.
   - **Review** — Ghost button. Opens the full action detail screen for editing before approval.
7. **Dismiss** — Subtle X or swipe-to-dismiss. Action returns to queue, not rejected.

**The biometric moment:**
- User taps Approve
- Device biometric prompt appears (FaceID, fingerprint, or device passcode fallback)
- On success: the status bar flashes `--accent-bright`, the card smoothly collapses with a subtle scale-down animation, and a brief confirmation appears: "Approved. Sending."
- The biometric authentication is recorded in the Witness attestation (`authMethod: 'biometric'`, timestamp)
- The action is cryptographically signed with proof of biometric authorization

**Card animation:**
- Arrival: slides up from bottom with slight spring physics (not linear). Background dims subtly.
- Awaiting: status bar pulses. The card has a very subtle `--accent-glow` border.
- Approved: flash, collapse, confirmation. Total animation: 800ms.
- Dismissed: slides down and fades. 300ms.

### Architectural Bridge

The briefing card connects three existing systems:

1. **Escalation Engine (Step 15)** — Routes actions that need approval. Provides the action details and context chain.
2. **BiometricAdapter (Step 31)** — `authenticate()` returns `BiometricResult` with success/failure and method used.
3. **Witness Attestation (Step 26)** — `AttestationSigner` signs the action with biometric auth metadata included in the proof.

The design work is connecting these in a visual experience. The code path exists; the UX is the deliverable.

### Why This Matters for Brand

The briefing card is:
- The thing people screenshot and share ("Look what my AI prepared for me")
- The most frequent premium interaction (Partner/Guardian users see this daily)
- The emotional peak of the product experience
- The physical embodiment of "agency on your behalf"
- A conversion driver for free users who see it in marketing

It must be the single most polished interaction in the entire application.

---

## Component Patterns

### Cards

Cards are the primary content container. They sit on `--bg-surface` against the `--bg-deep` canvas with the dot field visible in between.

```
Card anatomy
├── Background:   --bg-surface
├── Border:       1px solid --border-default
├── Radius:       --radius-md (8px)
├── Padding:      --space-6 (24px)
├── Shadow:       --shadow-sm
├── Hover:        border → --border-hover, shadow → --shadow-md
└── Active:       background → --bg-hover
```

**Card variants:**
- **Default** — Standard content container
- **Interactive** — Hover/active states, cursor: pointer
- **Accent** — Left border in `--accent` (2-3px). Used for featured items, active states
- **Briefing** — The approval briefing card. Elevated (`--bg-elevated`), accent glow border, pulse animation
- **Privacy** — Used in Privacy Dashboard. Includes a small shield or checkmark icon in `--success`

### Buttons

```
Button variants
├── Primary:    bg --accent, text --text-inverse, hover → --accent-bright
├── Secondary:  bg --bg-elevated, text --text-primary, border --border-default
├── Ghost:      bg transparent, text --accent, hover → bg --accent-subtle
├── Destructive: bg --destructive, text --text-primary, hover → darken 10%
└── Disabled:   opacity 0.4, cursor not-allowed, no hover state

Button sizes
├── sm:  height 32px, padding 0 12px, --text-button-sm
├── md:  height 40px, padding 0 16px, --text-button
└── lg:  height 48px, padding 0 24px, --text-button
```

### Inputs

```
Input states
├── Default:  bg --bg-surface, border --border-default, text --text-primary
├── Focus:    border --border-focus (accent), shadow → 0 0 0 3px --accent-subtle
├── Error:    border --error, shadow → 0 0 0 3px rgba(--error, 0.1)
├── Disabled: bg --bg-deep, text --text-tertiary, border --border-subtle
└── Placeholder text: --text-tertiary
```

### Status Indicators

```
Status dots
├── Active/Online:    --success (accent green)
├── Warning:          --warning (amber)
├── Error:            --error (red)
├── Neutral/Idle:     --text-tertiary
└── Processing:       --accent with pulse animation
```

### Navigation

- **Tab bar (mobile):** `--bg-surface` background, active tab icon in `--accent`, inactive in `--text-tertiary`
- **Sidebar (desktop):** `--bg-surface`, active item has `--accent-subtle` background + `--accent` text
- **Breadcrumbs:** `--text-secondary`, separator in `--text-tertiary`, current page in `--text-primary`

---

## Motion & Animation

### Principles

1. **Purposeful.** Every animation communicates something. Never animate for decoration.
2. **Quick.** Most transitions complete in 150-300ms. The product should feel responsive, not theatrical.
3. **Smooth.** Ease-out for entrances (decelerating into place), ease-in-out for state changes. Never linear (feels mechanical).
4. **Subtle.** If someone notices the animation itself rather than the state change it communicates, it's too much.

### Duration Scale

```
Timing tokens
├── --duration-instant:  100ms    // Hover states, toggles
├── --duration-fast:     150ms    // Tooltips, small reveals
├── --duration-normal:   250ms    // Page transitions, card appearances
├── --duration-slow:     400ms    // Modal open/close, complex reveals
├── --duration-ambient:  10000ms  // Breathing effects, background waves
```

### Easing

```
Easing tokens
├── --ease-out:     cubic-bezier(0.16, 1, 0.3, 1)      // Entrances. Quick start, gentle stop.
├── --ease-in-out:  cubic-bezier(0.45, 0, 0.55, 1)     // State changes. Smooth throughout.
├── --ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1)  // Emphasis. Slight overshoot. Briefing card arrival.
└── --ease-linear:  linear                               // Background waves only. Never for UI.
```

### Key Animations

| Element | Trigger | Animation | Duration |
|---------|---------|-----------|----------|
| Card appear | Mount | Fade in + translate Y (8px→0) | 250ms ease-out |
| Modal open | User action | Fade in + scale (0.95→1) | 300ms ease-out |
| Modal close | Dismiss | Fade out + scale (1→0.95) | 200ms ease-in |
| Briefing card arrive | Notification | Slide up + spring | 400ms ease-spring |
| Briefing card approve | Biometric success | Flash accent-bright + scale down | 800ms |
| Button hover | Cursor enter | Background color transition | 100ms |
| Tab switch | User action | Content crossfade | 200ms ease-in-out |
| Dot field breathing | Ambient | Opacity wave | 10s ease-linear |
| Dot field interaction | Cursor move | Opacity brighten + line connections | 200ms in, 500ms out |
| Logo particles (rest) | Ambient | Subtle drift | Continuous, 2-3s per cycle |
| Logo particles (hover) | Cursor enter | Expand + reconverge | 600ms ease-in-out |
| Privacy guarantee check | Verification | Checkmark draw-on | 300ms ease-out |

---

## Iconography

### Style

- **Line icons.** 1.5px stroke weight. Rounded caps and joins.
- **24x24 default size.** Scale to 20x20 for dense UI, 32x32 for feature showcases.
- **Color:** `--text-secondary` default, `--text-primary` on hover/active, `--accent` for selected/active states.
- **Source:** Lucide icon set (open source, consistent with the line style). Custom icons for Semblance-specific concepts only.

### Custom Icons Needed

| Icon | Concept | Description |
|------|---------|-------------|
| Alter Ego | Autonomous mode | The mirrored S mark, simplified |
| Living Will | Digital twin export | Document with a lock/shield |
| Witness | Cryptographic attestation | Eye with checkmark (or badge with signature) |
| Inheritance | Posthumous protocol | Key passing from one hand to another |
| Briefing | Action awaiting approval | Document with a signature line |
| Knowledge Graph | Connected understanding | Nodes with edges (simplified) |
| Sovereignty | Data on-device | Shield with a device silhouette |

---

## Responsive Strategy

### Breakpoints

```
Breakpoint tokens
├── --bp-mobile:   0–767px       // Single column, bottom nav, full-width cards
├── --bp-tablet:   768–1023px    // Two-column where appropriate, sidebar optional
├── --bp-desktop:  1024–1439px   // Sidebar + content, comfortable spacing
└── --bp-wide:     1440px+       // Max content width, generous margins
```

### Layout Rules

- **Max content width:** 1200px (centered on wide screens)
- **Mobile-first:** All components designed for mobile first, enhanced for larger screens
- **Cards:** Full-width on mobile, grid on tablet+
- **Navigation:** Bottom tab bar on mobile, sidebar on desktop
- **The dot field:** Visible on all breakpoints. Density reduces on mobile (40px spacing vs 28px)

---

## Dark/Light Theme

### Current Approach

**Dark theme is the primary and default theme.** The entire brand identity, color palette, and interaction design is built around the dark aesthetic. The dot field, the accent glow, the particle logo — all are designed for dark backgrounds.

**Light theme is a future consideration, not a launch priority.** If implemented later:
- Invert the background scale (deep → near-white, surface → light gray)
- Keep the accent color unchanged (Veridian teal works on both dark and light)
- The dot field renders in accent color at reduced opacity on light backgrounds
- The particle logo bottom half stays accent-colored; top half becomes dark

**Do not implement light theme for launch.** Ship dark. It's the brand. Light can come later based on user feedback.

---

## Implementation Phases

### Phase 1 — Token Codification (Post-Step 33)
- Convert all tokens above into `packages/semblance-ui/tokens/`
- Update existing token files to match this specification
- Verify all existing components render correctly with new tokens

### Phase 2 — Logo Creation
- Build the mirrored S as SVG (geometric top, particle bottom)
- Create all four variants (full, icon, simplified, wordmark)
- Generate app icons at all required sizes (iOS, Android, desktop)
- Create favicon from simplified mark
- Animate the particle version for splash screen / hero placements

### Phase 3 — Component Polish (Storybook)
- Apply updated tokens to every existing component
- Build the briefing card component
- Build the dot field background component
- Visual QA every screen in Storybook at all breakpoints
- Ensure all animations are implemented and performant

### Phase 4 — Surface Application
- Landing page (semblance.run) — apply full brand treatment
- App store assets — screenshots with brand styling
- Marketing materials — press kit, social media templates
- Documentation — branded headers/styling for README, PRIVACY.md

---

## Brand Assets Checklist

| Asset | Status | Phase |
|-------|--------|-------|
| Color palette tokens | ✅ Specified | Phase 1 |
| Typography tokens | ✅ Specified | Phase 1 |
| Spacing/radius/shadow tokens | ✅ Specified | Phase 1 |
| Mirrored S logo (SVG) | ⬜ To create | Phase 2 |
| Logo variants (4) | ⬜ To create | Phase 2 |
| App icons (all sizes) | ⬜ To create | Phase 2 |
| Favicon | ⬜ To create | Phase 2 |
| Animated logo | ⬜ To create | Phase 2 |
| Dot field component | ⬜ To build | Phase 3 |
| Briefing card component | ⬜ To build | Phase 3 |
| Component library (Storybook) | ⬜ Step 32 scaffolding, Phase 3 polish | Phase 3 |
| Landing page (branded) | ⬜ Step 32 structure, Phase 4 skin | Phase 4 |
| App store screenshots | ⬜ To create | Phase 4 |
| Social media templates | ⬜ To create | Phase 4 |
| Press kit (branded) | ⬜ Step 32 content, Phase 4 skin | Phase 4 |

---

## Relationship to Veridian Ecosystem

Semblance is a Veridian Synthetics product. The brand relationship:

- **Shared:** The Veridian accent color (`#00D4A1` family). This is the thread connecting Semblance, Conduit, MIRRORFALL, and Trellis.
- **Semblance-specific:** The mirrored S logo, the dark warm palette, the dot field, the briefing card, the overall visual language.
- **Parent brand visibility:** "Veridian Synthetics" appears in footer, about screens, legal text. Never competes with the Semblance brand in product UI. The parent brand is the house; Semblance is the flagship product.

Each Veridian product may develop its own visual identity beyond the shared accent color, but the color family creates ecosystem recognition: if you've seen one Veridian product, the accent color in another feels familiar.

---

*This document is the canonical reference for all Semblance design decisions. All visual work — Storybook stories, landing page, marketing materials, app store assets — derives from this specification. Update this document first, then implement. Never implement a visual change that isn't reflected here.*
