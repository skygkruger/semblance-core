# SEMBLANCE — Design Bible

**Status:** Canonical — supersedes all previous design documentation
**Owner:** Skyler Kruger, Founder — VERIDIAN SYNTHETICS
**Applies To:** All Semblance product surfaces, marketing, documentation, app store presence, semblance.run landing page

---

## 1. Brand Philosophy

Semblance is a Digital Representative — a sovereign AI that runs entirely on the user's hardware, holds their complete life context, and acts on their behalf.

**Primary emotion:** *"I've got this. You don't need to worry."*

Not capability. Not safety. Agency on your behalf — the quiet confidence of something that has already handled the thing you were worried about, using knowledge you forgot you gave it, connecting dots you didn't know existed.

**Core design principle:** Intelligence that doesn't hold its shape. Derived from the logo: wire geometric structure dissolving into organic particle scatter. Form emerging from dissolution. This is the motion language, the texture language, and the interaction language of the entire product.

**Brand tensions:**

| Tension | Wrong | Right |
|---------|-------|-------|
| Privacy | Paranoid, defensive | Confident, sovereign, empowering |
| Sophistication | Cold, clinical, corporate | Warm, modern, premium |
| Intelligence | Showy, over-animated | Understated, anticipatory, already done |
| Technology | Sci-fi, neon, cyberpunk | Grounded, refined, alive |
| Color | Veridian everywhere | Veridian at eight moments only |

---

## 2. Color System

### Foundation

```css
--void: #060809        /* Deepest background — behind everything */
--base: #0B0E11        /* Primary background */
--s1:   #111518        /* Surface 1 — cards, panels */
--s2:   #171B1F        /* Surface 2 — elevated, hover */
--s3:   #1E2227        /* Surface 3 — highest elevation */
--b1:   rgba(255,255,255,0.05)   /* Border — subtle */
--b2:   rgba(255,255,255,0.09)   /* Border — default */
--b3:   rgba(255,255,255,0.15)   /* Border — prominent */
```

### Silver Scale

```css
--slate1: #2A2F35      /* Darkest silver — deep dividers */
--slate2: #3D444C      /* Dark silver — numbered elements at rest */
--slate3: #525A64      /* Mid silver — metadata, timestamps (DM Mono) */
--sv1:    #5E6B7C      /* Silver 1 — muted labels, placeholder text */
--sv2:    #8593A4      /* Silver 2 — supporting body text */
--sv3:    #A8B4C0      /* Silver 3 — body copy, descriptions */
--w-dim:  #CDD4DB      /* Dim white — card titles, secondary headings */
--white:  #EEF1F4      /* White — section headings, hero text */
--white-pure: #F8FAFB  /* Pure white — rare emphasis */
```

### Veridian Signal

```css
--v:          #6ECFA3                      /* Veridian — the life signal */
--v-dim:      rgba(110, 207, 163, 0.10)    /* Dim — subtle backgrounds */
--v-glow:     rgba(110, 207, 163, 0.08)    /* Glow — box-shadow halo */
--v-glow-md:  rgba(110, 207, 163, 0.18)    /* Glow medium — hover halos */
--v-glow-lg:  rgba(110, 207, 163, 0.28)    /* Glow large — focus rings */
--v-wire:     rgba(110, 207, 163, 0.32)    /* Wire — borders, outlines */
```

### Severity

```css
--caution:  #B09A8A    /* Cool Copper — medium risk, notice, pending */
--critical: #B07A8A    /* Antique Rose — high risk, action required, danger */
```

Semantic names decouple from hue. `--caution` is used for warnings, pending states, medium-risk approval cards. `--critical` is used for errors, destructive actions, high-risk approval cards, validation failures.

**Fallback severity palettes (preserved for reference):**

| Palette | Caution | Critical | Notes |
|---------|---------|----------|-------|
| Primary (active) | `#B09A8A` Cool Copper | `#B07A8A` Antique Rose | Current system |
| Opal family | `#9B8FBE` Opal Lilac | `#8E6EA8` Muted Orchid | All-purple |
| Warm silver | `#B09A8A` Cool Copper | `#A87B7F` Dusty Rose | Warm-shifted |
| Pink-purple | `#A8899A` Pewter Rose | `#9A7088` Slate Mauve | Pink-purple |

### Opal Accent Layer

```css
--opal-purple-deep: #4a3f6b    /* Deep purple — wireframe base, gradient anchors */
--opal-purple-mid:  #6b5fa8    /* Mid purple — wireframe stroke color, sweep peaks */
--opal-silver:      #9aa8b8    /* Opal silver — sweep transition, shimmer anchors */
--opal-white:       #d8dde8    /* Opal white — sweep brightness peak */
--opal-peak-opacity: 0.09      /* Maximum opacity of opal sweep layer */
--opal-angle:       105deg     /* Sweep direction — matches all shimmers */
--opal-speed:       16s        /* Sweep cycle — matches shimmer duration */
```

---

## 3. Typography

### Typefaces

**Display: Fraunces** (`--fd`) — Hero headings, section titles, card titles, FAQ questions, step titles. Weight 300, italic variant for secondary display text.

**Wordmark: Josefin Sans** — The brand wordmark "Semblance" wherever it appears (nav, footer, splash). Weight 200 only. Uppercase always. Exclusive to the wordmark — never in body copy, headings, or UI elements.

**Body: DM Sans** (`--fb`) — All body copy, labels, button text, navigation links. Weight 300 for body, 400 for labels/buttons, 500 for medium emphasis.

**Mono: DM Mono** (`--fm`) — Timestamps, section labels, metadata, data, code. Weight 300-400. Always uppercase for labels, 0.08-0.12em tracking.

### CSS Variable Assignments

```css
--fd: 'Fraunces', Georgia, serif;
--fb: 'DM Sans', system-ui, sans-serif;
--fm: 'DM Mono', monospace;
/* Josefin Sans referenced directly as 'Josefin Sans' — no CSS variable */
```

### CJK Font Stacks

```css
--fb-ja: 'DM Sans', 'Noto Sans JP', 'Hiragino Kaku Gothic Pro', system-ui, sans-serif;
--fb-zh: 'DM Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
--fb-ko: 'DM Sans', 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif;
--fd-ja: 'Fraunces', 'Noto Serif JP', Georgia, serif;
--fd-zh: 'Fraunces', 'Noto Serif SC', 'Songti SC', Georgia, serif;
--fd-ko: 'Fraunces', 'Noto Serif KR', Georgia, serif;
```

CJK overrides activate via `[lang^="ja"]`, `[lang^="zh"]`, `[lang^="ko"]` attribute selectors.

### Google Fonts Import String

```
https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Mono:wght@300;400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=Josefin+Sans:wght@100;200;300&display=swap
```

### Type Scale

```
Display
--text-3xl:   52px / 1.05  / Fraunces 300    / -0.04em tracking
--text-2xl:   38px / 1.1   / Fraunces 300    / -0.03em tracking
--text-xl:    28px / 1.2   / Fraunces 300    / -0.03em tracking

Interface
--text-lg:    21px / 1.3   / DM Sans 300     / -0.02em tracking
--text-md:    17px / 1.45  / DM Sans 300     / -0.01em tracking
--text-base:  15px / 1.6   / DM Sans 300     / -0.01em tracking
--text-sm:    13px / 1.6   / DM Sans 400     / -0.01em tracking
--text-xs:    11px / 1.5   / DM Mono 400     / +0.08-0.12em tracking (always uppercase)
```

### Text Hierarchy

| Level | Token | Use |
|-------|-------|-----|
| Primary | `--white` (#EEF1F4) | Section headings, hero headings, page-level titles |
| Secondary | `--w-dim` (#CDD4DB) | Card titles, step titles, FAQ questions at rest |
| Body | `--sv3` (#A8B4C0) | Body copy, descriptions, paragraph text, FAQ answers |
| Supporting | `--sv2` (#8593A4) | Secondary body, em/italic accent text within headings |
| Muted | `--sv1` (#5E6B7C) | Labels, metadata, placeholder text, muted supporting copy |
| Metadata | `--slate3` (#525A64) | Section labels (DM Mono uppercase), timestamps, version info |

**Rules:**
- Italic (`em`) accents within Fraunces headings use `--sv2`, not the surrounding heading color
- Body default (`<body>`) is `--w-dim`
- Never use `--white` for body copy
- `--sv1`/`--sv2` are for contrast and secondary info, not dominant text color

---

## 4. Spacing, Radius, Layout

### Spacing (4px base unit)

```css
--sp-1:  4px     --sp-2:  8px     --sp-3:  12px    --sp-4:  16px
--sp-5:  20px    --sp-6:  24px    --sp-8:  32px    --sp-10: 40px
--sp-12: 48px    --sp-16: 64px    --sp-20: 80px    --sp-24: 96px
```

### Border Radius

```css
--r-sm:   4px      /* Subtle rounding — inputs, small elements */
--r-md:   8px      /* Default — cards, panels, buttons */
--r-lg:   12px     /* Prominent — modal, dialog */
--r-xl:   16px     /* Large — onboarding cards, hero elements */
--r-full: 9999px   /* Pill shape — badges, status dots */
```

### Layout

```
Max content width: 1080px centered
Body padding: 80px top, 40px horizontal

Grid: 4 columns (mobile) / 8 columns (tablet) / 12 columns (desktop)

Breakpoints:
--bp-mobile:   0-767px
--bp-tablet:   768-1023px
--bp-desktop:  1024-1439px
--bp-wide:     1440px+
```

---

## 5. Motion & Animation

### Duration Tokens

```css
--duration-fast:    120ms      /* Hover states, toggles */
--duration-base:    220ms      /* Input transitions, card hovers */
--duration-slow:    400ms      /* Approval states, agent input focus */
--duration-slower:  700ms      /* Page load dissolve-in sequence */
--duration-ambient: 16000ms    /* Shimmer, dot matrix wave, opal sweep */
```

### Easing Curves

```css
--eo:          cubic-bezier(0.16, 1, 0.3, 1)      /* Ease-out — entries, expansions */
--eio:         cubic-bezier(0.45, 0, 0.55, 1)     /* Ease-in-out — state transitions */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)  /* Spring — briefing card arrival ONLY */
```

### Keyframe Definitions

```css
@keyframes shimmer {
  from { background-position: 300% center; }
  to   { background-position: -150% center; }
}

@keyframes dissolve {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes approve-pulse {
  0% { box-shadow: 0 0 0 0 var(--v-glow-lg); }
  100% { box-shadow: 0 0 0 12px transparent; }
}

@keyframes opal-sweep {
  from { background-position: 200% 0; }
  to   { background-position: 0% 0; }
}

@keyframes opal-border-sweep {
  to { --opal-angle: 360deg; }
}
```

**Dissolve-in stagger:** Children stagger by 80ms. Duration 700ms ease-out. Never use spring easing except briefing card arrival.

---

## 6. Shimmer System

All shimmers share the 105deg angle and the `shimmer` keyframe. Duration is always 16s linear infinite unless noted. This is the pace of thinking, not racing.

### Wordmark Shimmer (Josefin Sans)

Blue-grey metallic sweep. `animation-delay: -6s` desyncs from other shimmers.

```css
.wordmark--shimmer {
  font-family: 'Josefin Sans', sans-serif;
  font-weight: 200;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background: linear-gradient(
    105deg,
    #6b7a8a 0%, #9aa8b8 18%, #c8d2d8 30%, #9aa8b8 42%,
    #6b7a8a 58%, #8a97a8 74%, #6b7a8a 100%
  );
  background-size: 250% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 16s linear infinite;
  animation-delay: -6s;
}
```

Footer wordmark: same font/weight/tracking but `color: var(--sv3)` — no shimmer.

### Hero Display Shimmer (Dual-temperature)

Used on italic secondary lines in the hero heading. Blue-grey base with sage-green peak.

```css
.shimmer-line {
  font-style: italic;
  background: linear-gradient(
    105deg,
    #5a6472 0%, #7a8898 15%, #8a9890 28%, #c0cbc4 38%,
    #8f9ba8 50%, #6b7a72 62%, #7a8898 78%, #5a6472 100%
  );
  background-size: 300% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 16s linear infinite;
}
```

### General Shimmer (Silver-white)

Used on "Your Digital Representative" and other designated shimmer text.

```css
.shimmer {
  background: linear-gradient(
    105deg,
    var(--sv2) 0%, #ffffff 22%, var(--sv3) 38%,
    #ffffff 54%, var(--sv2) 70%, #ffffff 85%, var(--sv2) 100%
  );
  background-size: 300% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 16s linear infinite;
}
```

### AI Name Shimmer (Opal purple-to-silver)

Metallic text gradient for all AI name instances. 19s duration, -6s delay.

```css
.ai-name-shimmer {
  font-style: italic;
  background: linear-gradient(
    105deg,
    #625882 0%, #9a94b8 12%, #b8c0cc 24%,
    #d8dde8 38%, #e4e8ee 50%, #d8dde8 62%,
    #b8c0cc 76%, #9a94b8 88%, #625882 100%
  );
  background-size: 300% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 19s linear infinite;
  animation-delay: -6s;
}
```

### Button Metallic Shimmer

Ghost and Solid buttons use a `::after` pseudo-element. Requires `position: relative; overflow: hidden` on `.btn`.

```css
.btn--ghost::after,
.btn--solid::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(200,210,220,0.07) 40%,
    rgba(240,245,250,0.13) 50%,
    rgba(200,210,220,0.07) 60%,
    transparent 100%
  );
  background-size: 250% auto;
  background-position: 200% center;
  transition: background-position 2.2s var(--eo);
  border-radius: inherit;
  pointer-events: none;
}

.btn--ghost:hover::after,
.btn--solid:hover::after {
  background-position: -50% center;
}
```

Peak opacity 13% — reads as a catch of light, not a glow. The 2.2s transition is intentionally slow.

---

## 7. Opal Surface Texture

The opal texture is the ambient visual identity of Semblance surfaces. Two pseudo-element layers create a subtle, living wireframe with a traveling light sweep. It is NOT a Veridian moment — it is always present and recedes when Veridian fires.

### Layer 1: Static Triangulated Wireframe (::after)

Generated from seeded Voronoi-style nearest-neighbor triangulation. Parameters:
- **Seed:** 42
- **Points:** 28
- **Canvas:** 400x400px
- **Stroke:** `#6b5fa8` (opal-purple-mid) at 0.15 opacity, 0.5px width

```css
.opal-surface::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
  background-image: url("data:image/svg+xml,..."); /* Inline SVG — see opal.css */
  background-size: 400px 400px;
  background-position: center;
  opacity: 1;
}
```

The wireframe echoes the Semblance logo's triangulated dissolution aesthetic.

### Layer 2: Opal Sweep (::before)

A traveling gradient that brightens wireframe lines as it passes. Uses `mix-blend-mode: screen`.

```css
.opal-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(
    105deg,
    transparent 0%, transparent 15%,
    rgba(74, 63, 107, 0.0) 20%,
    rgba(107, 95, 168, 0.06) 32%,
    rgba(154, 168, 184, 0.08) 44%,
    rgba(216, 221, 232, 0.11) 52%,
    rgba(216, 221, 232, 0.08) 58%,
    rgba(154, 168, 184, 0.06) 66%,
    rgba(107, 95, 168, 0.03) 76%,
    transparent 85%, transparent 100%
  );
  background-size: 200% 100%;
  animation: opal-sweep 8s linear infinite;
  animation-delay: -4s;
  mix-blend-mode: screen;
  transition: opacity 0.6s ease;
}
```

### Opal Recede

When Veridian fires (focus, activation), the opal sweep fades to zero:

```css
.opal-recede::before {
  opacity: 0;
}
```

### Child Z-Index

All children of `.opal-surface` sit above both texture layers:

```css
.opal-surface > * {
  position: relative;
  z-index: 2;
}
```

### Applying Opal to a New Component

```css
.my-component {
  /* Required base */
  position: relative;
  overflow: hidden;
}
/* Add .opal-surface class in JSX, then content renders above layers automatically */
```

---

## 8. Opal Border System

The opal border uses a rotating conic gradient to create a living, iridescent border effect. It is the standard border treatment for interactive containers (cards, inputs, panels).

### Technique

Uses a transparent CSS border with a `conic-gradient` on `border-box`, masked to show only through the border area:

```css
.my-bordered-element {
  border: 1px solid transparent;
  background:
    linear-gradient(var(--s1), var(--s1)) padding-box,
    conic-gradient(
      from var(--opal-angle),
      rgba(97, 88, 128, 0.35),
      rgba(154, 168, 184, 0.25),
      rgba(216, 221, 232, 0.6),
      rgba(154, 168, 184, 0.3),
      rgba(107, 95, 168, 0.2),
      rgba(97, 88, 128, 0.35)
    ) border-box;
  animation: opal-border-sweep 8s linear infinite;
}
```

The `@property --opal-angle` registration (in tokens.css) enables smooth conic gradient rotation:

```css
@property --opal-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
```

### Veridian Focus Transition

When a bordered element receives focus or activates, the border transitions from opal to Veridian:

```css
.my-bordered-element:focus-within {
  border-color: rgba(110, 207, 163, 0.4);
  box-shadow:
    0 0 0 2px rgba(110, 207, 163, 0.08),
    0 0 16px rgba(110, 207, 163, 0.04);
  animation: none; /* Stop opal rotation */
}
```

Some components add a radial bleed from the bottom on focus:

```css
.my-input:focus-within::after {
  background: radial-gradient(
    ellipse at 50% 100%,
    rgba(110, 207, 163, 0.06) 0%,
    transparent 70%
  );
}
```

---

## 9. The Eight Veridian Moments

Veridian (#6ECFA3) appears ONLY at these eight moments. This constraint is what makes each appearance meaningful.

1. **Approve/Confirm button** — `--v` text, `--v-wire` border, `--v-dim` fill on hover, glow halo
2. **Active badge dot** — pulse animation on Veridian dot
3. **Approval card** — ambient `--v-wire` border glow, intensifying on hover and confirmation
4. **Input focus ring** — `--v-glow-lg` border + `--v-glow` box-shadow halo
5. **Agent-highlighted text** — `--v` color with subtle underline
6. **Active inference indicator** — Veridian pulse dot
7. **Wire-line divider accent** — 72px gradient from `--v` to transparent
8. **Send button in agent input** — same treatment as approve button

**Veridian does NOT appear in:** decorative patterns, section backgrounds, non-approval buttons, icons, or any element not directly related to system action, approval, or direct user interaction (cursor/touch on dot matrix).

### Exact Veridian Activation CSS (reusable)

```css
/* Border */
border-color: rgba(110, 207, 163, 0.35-0.5);

/* Glow halo */
box-shadow:
  0 0 0 2px rgba(110, 207, 163, 0.08),
  0 0 16px rgba(110, 207, 163, 0.04);

/* Text */
color: #6ECFA3;

/* Background tint */
background: rgba(110, 207, 163, 0.04-0.08);
```

---

## 10. Golden Standard Patterns

This section documents the craft patterns from the best components. These patterns are what make Semblance premium and should be applied consistently when building new components.

### What Makes Semblance Premium (Cross-Cutting Principles)

1. **Everything is alive** — opal sweep, shimmer, breathing. Nothing is ever static.
2. **Light is first-class** — shimmer, radial bleeds, glows communicate state via luminosity, not just color.
3. **Geometry has meaning** — golden ratio dodecahedron (WireframeSpinner), Voronoi wireframe (opal surface).
4. **States communicate via visual metaphor** — opal (potential/rest) transitions to Veridian (intention/action).
5. **Spacing breathes** — generous padding (32px cards), intentional gaps. Never cramped.
6. **Typography has personality** — Fraunces for weight, DM Sans for warmth, DM Mono for precision.
7. **Color is restrained** — no neon, no pure primaries. Silver scale + two severity tones + one signal color.
8. **Depth without 3D** — CSS gradients, shadows, blend modes create dimensionality.

### Golden Component Patterns

| Component | Key Pattern | Reusable Principle |
|-----------|------------|-------------------|
| WireframeSpinner | Opal color ramp on 3D geometry, morphing shapes | Loading = alive, not static |
| SkeletonCard | Opal border pulse + shimmer ::before layer | Loading states get full visual treatment |
| ChatBubble | Asymmetric user/AI treatment (user dimmed, AI radiant) | Hierarchy through visual weight |
| AgentInput | Alive before typing (opal + hint cycle), Veridian on content, radial bleed | Inputs are presence, not form fields |
| KnowledgeGraph | Vignette focus, force-directed with micro-drift | Data viz = living map, not chart |
| ArtifactPanel / DocumentPanel | Shared opal container, different info architecture | Same visual language, different content |
| SovereigntyReportCard | Animated left bar (opal at rest, Veridian on action), title shimmer | Trust artifacts get maximum visual ceremony |
| ApprovalCard | Risk-level color bleed via data attributes, opal border sweep | Risk severity affects entire card atmosphere |
| Onboarding | Each screen = threshold, not page | Progressive disclosure with ceremony |
| Settings | Opal containers, badge variants (veridian/caution/muted/critical) | Navigation hierarchy with visual states |

### Left Bar State Pattern (Reusable)

Several components use a narrow left bar as a state machine visualization:

- **At rest:** Opal gradient sweep (8s animation, purple-silver-white)
- **Active/ready:** Solid Veridian, animation pauses
- **The bar communicates readiness** without text

```css
/* At rest — opal sweep */
.component__left-bar {
  width: 3px;
  background: linear-gradient(
    180deg,
    rgba(107, 95, 168, 0.4),
    rgba(154, 168, 184, 0.3),
    rgba(216, 221, 232, 0.5),
    rgba(154, 168, 184, 0.3),
    rgba(107, 95, 168, 0.4)
  );
  background-size: 100% 200%;
  animation: opal-sweep 8s linear infinite;
}

/* Active — solid Veridian */
.component--active .component__left-bar {
  background: var(--v);
  animation: none;
}
```

### Title Shimmer Pattern (Reusable)

Components like SovereigntyReportCard use a silver-teal shimmer on title text:

```css
.component__title {
  background: linear-gradient(
    105deg,
    #8593A4 0%, #9aa8b8 20%, #a8c4b8 40%,
    #b8cdd8 55%, #a8c4b8 70%, #8593A4 100%
  );
  background-size: 300% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 16s linear infinite;
}
```

### Opal Text Sweep Pattern (Reusable)

Used on special buttons (export, action) to give text a living quality:

```css
@keyframes opal-text-sweep {
  from { background-position: 200% center; }
  to   { background-position: -100% center; }
}

.component__action-text {
  background: linear-gradient(
    105deg,
    var(--sv2) 0%, var(--opal-silver) 30%,
    var(--opal-white) 50%,
    var(--opal-silver) 70%, var(--sv2) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: opal-text-sweep 12s linear infinite;
}
```

---

## 11. Component Specifications

### Buttons

Six variants. All require `position: relative; overflow: hidden` for shimmer pseudo-elements.

**Ghost** — transparent background, `--sv2` text, `--b2` border. Hover: `--s2` fill, `--white` text, `--b3` border, metallic shimmer sweep.

**Solid** — `--s3` to dark steel gradient, `--sv3` text, `--b2` border. Hover: darker gradient, `--white` text, metallic shimmer sweep.

**Subtle** — transparent, `--sv1` text, no border. Hover: `rgba(160,175,195,0.05)` fill, `--sv3` text.

**Approve** — transparent, `--v` text, `--v-wire` border. Hover: `--v-dim` fill, `--v-glow-md` + inset `--v-glow` box shadow. Transition 400ms. The only button with color.

**Dismiss** — transparent, `--sv2` text, `--b1` border. Silver peer to approve button.

**Destructive** — transparent, `--sv2` text, `--b1` border. Hover: `--critical` text, critical border and background at 6%.

### Cards

**Default:** `--s1` background, `--b1` border, `--r-lg` radius, 24px padding. Hover: `--s2` background, `--b2` border. Transition 220ms.

**Elevated:** `--s2` background, `--b2` border. Higher visual weight.

**Briefing:** `linear-gradient(135deg, --s2, --s1)` background, `--b2` border. Spring easing on arrival.

### Approval Card (Risk-Level System)

The approval card uses a `data-risk` attribute to control color bleed throughout the card:

```css
/* Low risk — Veridian */
[data-risk="low"] .approval-card__divider { background: linear-gradient(90deg, var(--v), transparent); }
[data-risk="low"] .approval-card__label { color: var(--v); }

/* Medium risk — Caution */
[data-risk="medium"] .approval-card__divider { background: linear-gradient(90deg, var(--caution), transparent); }
[data-risk="medium"] .approval-card__label { color: var(--caution); }

/* High risk — Critical */
[data-risk="high"] .approval-card__divider { background: linear-gradient(90deg, var(--critical), transparent); }
[data-risk="high"] .approval-card__label { color: var(--critical); }
```

The opal border sweep continues at all risk levels. Risk color bleeds through: divider line, labels, item text, and hover button backgrounds.

### Inputs

Opal border at rest, Veridian on focus:

```css
.input { border: 1px solid var(--b2); }
.input:focus { border-color: var(--v-glow-lg); box-shadow: 0 0 0 3px var(--v-glow); }
.input--error { border-color: var(--critical); }
.input__error-text { color: var(--critical); }
```

### Numbered Elements

Any numbered element (feature grid numbers, step numbers, card ordinals) highlights Veridian on parent hover:

```css
.numbered-element { color: var(--slate2); transition: color 220ms var(--eo); }
.parent:hover .numbered-element { color: var(--v); }
```

---

## 12. Reactive Dot Matrix Background

### Specification

```javascript
// Canvas: fixed position, full viewport, pointer-events none, z-index 0

// Desktop
const SP  = 28;    // dot spacing (px)
const DB  = 0.7;   // resting dot radius (px)
const DM  = 2.0;   // max dot radius at cursor (px)
const INF = 150;   // cursor/touch influence radius (px)

// Mobile (max-width: 767px)
const SP  = 40;    // increased spacing
const INF = 100;   // reduced influence radius
```

### Resting State

Each dot breathes individually using a seeded random phase offset. Base opacity `0.05 + 0.03 * breath`. Color at rest: `rgba(85, 95, 108, alpha)` — cool silver.

### Silver Wave

Diagonal wave of brightening silver at 16s pace, 105deg angle (matches shimmer):

```javascript
const WAVE_PERIOD = 16000;
const wavePhase = (performance.now() % WAVE_PERIOD) / WAVE_PERIOD;
const diagonal = W + H;
const waveFront = wavePhase * diagonal * 1.6 - diagonal * 0.3;
const waveWidth = diagonal * 0.28;

// Per dot:
const proj = d.x * 0.259 + d.y * 0.966; // project onto 105deg axis
const waveInf = Math.max(0, 1 - Math.abs(proj - waveFront) / waveWidth);
const wl = waveInf * waveInf * waveInf;  // cubic falloff
const waveLift = wl * 0.18;              // alpha lift at crest

// Color at crest: rgb(85,95,108) -> rgb(210,215,220)
const sr = Math.round(85 + 125 * wl);
const sg = Math.round(95 + 120 * wl);
const sb = Math.round(108 + 112 * wl);
```

The wave only affects resting (non-cursor) dots. Dots within cursor/touch range always render Veridian.

### Cursor / Touch Interaction

```javascript
// Veridian interpolation within influence radius:
const ri = Math.round(110 * inf + 90  * (1 - inf));
const gi = Math.round(207 * inf + 106 * (1 - inf));
const bi = Math.round(163 * inf + 122 * (1 - inf));
```

Touch events map identically to mouse: `touchmove` uses `e.touches[0]` coordinates, `touchend` resets to off-screen `(-999, -999)`.

---

## 13. Shadows

```css
/* Shadow scale — all use dark, low-opacity shadows for depth on dark backgrounds */
--shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md:  0 2px 8px rgba(0, 0, 0, 0.4);
--shadow-lg:  0 4px 16px rgba(0, 0, 0, 0.5);
--shadow-xl:  0 8px 32px rgba(0, 0, 0, 0.6);
```

Veridian glow shadows are separate from depth shadows and use the `--v-glow` tokens.

---

## 14. CSS Architecture

### Class Naming: BEM-Style

```
component__element--modifier

Examples:
.approval-card__header--expanded
.btn--approve
.chat-bubble__content--ai
.settings-badge--caution
```

### CSS Variables Only

Never hardcode token values. Always reference CSS custom properties:

```css
/* Correct */
color: var(--sv2);
background: var(--s1);
border: 1px solid var(--b2);

/* Incorrect */
color: #8593A4;
background: #111518;
```

Exception: inline SVG data URIs and gradient color stops that reference opal palette values may use hex directly since CSS vars don't work inside `url()` strings.

### Platform Split

```
ComponentName/
  ComponentName.web.tsx    — Web implementation (imports .css)
  ComponentName.native.tsx — React Native implementation (uses native tokens)
  ComponentName.css        — Web styles (BEM classes)
  ComponentName.types.ts   — Shared TypeScript types
```

### Opal Application Pattern

When adding opal texture to a new component:

1. Add `opal-surface` class to the container element in JSX
2. Ensure container has `position: relative; overflow: hidden` (provided by `.opal-surface`)
3. Child content automatically sits above texture layers (z-index: 2)
4. For opal borders, add the conic gradient technique from Section 8
5. Add `opal-recede` class conditionally when Veridian should take over

---

## 15. Native / React Native Tokens

All tokens are re-exported as numeric primitives (no CSS units) for `StyleSheet.create()`.

### Colors

```typescript
// From native.ts — brandColors object
{
  void: '#060809',       base: '#0B0E11',
  s1: '#111518',         s2: '#171B1F',        s3: '#1E2227',
  b1-b3: rgba strings,
  slate1-3, sv1-3, wDim, white, whitePure: hex strings,
  veridian: '#6ECFA3',   veridianDim/Glow/GlowMd/GlowLg/Wire: rgba strings,
  caution: '#9E92B8',    critical: '#B07A8A',
  silver: '#8593A4',     text: '#EEF1F4',      muted: '#5E6B7C',
}
```

### Spacing

```typescript
{ s0: 0, s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40, s12: 48, s16: 64, s20: 80, s24: 96 }
```

### Font Sizes

```typescript
{ xs: 11, sm: 13, base: 15, md: 17, lg: 21, xl: 28, '2xl': 38, '3xl': 52 }
```

### Font Families (React Native)

```typescript
{
  ui: 'DMSans-Regular',
  uiMedium: 'DMSans-Medium',
  mono: 'DMMono-Regular',
  display: 'Fraunces-Light',
  displayItalic: 'Fraunces-LightItalic',
  wordmark: 'JosefinSans-ExtraLight',
}
```

### Border Radius

```typescript
{ sm: 4, md: 8, lg: 12, xl: 16, full: 9999 }
```

### Motion Durations (ms)

```typescript
{ fast: 120, base: 220, slow: 400, slower: 700, ambient: 16000, cinematic: 800 }
```

### Opal Surface (Simplified for RN View)

```typescript
{ backgroundColor: '#111518', borderWidth: 1, borderColor: 'rgba(107,95,168,0.15)' }
```

---

## 16. Brand Identity Rules

### VERIDIAN SYNTHETICS

**Always all-caps. No exceptions.** In body copy, footer, legal text, about screens, press materials, code comments, documentation, commit messages.

### "Semblance" Wordmark

When appearing as the product wordmark (nav, footer, splash, app icon label): Josefin Sans 200 uppercase with shimmer. When appearing in body copy as a product name reference: surrounding typeface, normal casing.

### "Digital Representative"

Always capitalized as a proper noun. Never abbreviated to "DR" in user-facing contexts. This is the product tier identity.

### Voice

Direct. Confident. Understated. Warm without familiar. Never apologetic for being capable.

Never uses "!" in UI copy. Never "Great news!" or "Exciting update!" The quality of the action speaks for itself.

---

## 17. Token File Reference

| File | Defines | Authority |
|------|---------|-----------|
| `packages/semblance-ui/tokens/tokens.css` | All CSS custom properties, keyframes, CJK overrides | **Runtime source of truth** |
| `packages/semblance-ui/tokens/opal.css` | `.opal-surface`, `.opal-recede` classes with SVG wireframe | **Runtime source of truth** |
| `packages/semblance-ui/tokens/native.ts` | React Native numeric equivalents | Mirrors tokens.css |
| `packages/semblance-ui/tokens/colors.ts` | **DEPRECATED** — pre-v3 colors, wrong values. Do not use. See tokens.css. |
| `packages/semblance-ui/tokens/typography.ts` | **DEPRECATED** — pre-v3 fonts/sizes, wrong values. Do not use. See tokens.css. |
| `docs/DESIGN_BIBLE.md` | This file — complete specification | **Canonical spec** |

---

*VERIDIAN SYNTHETICS — CODE THAT BREATHES.*
