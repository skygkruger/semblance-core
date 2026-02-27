# SEMBLANCE — Brand & Design System v3

## Canonical Reference Document
**Status:** Locked — v3 Approved by Skyler Kruger, February 25, 2026
**Owner:** Skyler Kruger, Founder — VERIDIAN SYNTHETICS
**Supersedes:** All previous brand documentation including v2
**Applies To:** All Semblance product surfaces, marketing, documentation, app store presence, semblance.run landing page

---

## Changelog: v2 → v3

All changes below were locked during the semblance.run landing page build session on February 25, 2026. They apply to both the landing page (`semblance-run` repo) and the app UI design system (`semblance-core`, `semblance-dr` repos).

| Change | v2 | v3 |
|--------|----|----|
| Wordmark font | Fraunces 300 | Josefin Sans 200 (see Typography) |
| Wordmark treatment | Plain color | Shimmer, blue-grey palette |
| Hero shimmer palette | White-dominant sweep | Blue-grey + sage dual-temperature |
| Button shimmer (Ghost/Solid) | Not specified | Metallic silver sweep on hover, 2.2s |
| Dot matrix — wave | Not specified | Diagonal silver wave, 16s, matches shimmer angle |
| Dot matrix — touch | Mouse only | Mouse + touch (touchmove/touchend) |
| Numbered section elements | No hover color | Hover → `--v` with transition, matches how-it-works |
| Text hierarchy | Two-level (white/sv1) | Four-level (white / w-dim / sv3 / sv2/sv1) |
| Brand name casing | "Veridian Synthetics" | "VERIDIAN SYNTHETICS" always, everywhere |

---

## Brand Philosophy

Semblance is a Digital Representative — a sovereign AI that runs entirely on the user's hardware, holds their complete life context, and acts on their behalf. The brand communicates this relationship through restraint, precision, and quiet authority.

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

## Typography — UPDATED v3

### Typefaces

**Display: Fraunces** — All hero headings, section titles, card titles, FAQ questions, step titles. Weight 300, italic variant for secondary display text.

**Wordmark: Josefin Sans** — ⚠️ NEW in v3. The brand wordmark "Semblance" wherever it appears (nav, footer, splash, about). Weight 200 only. Uppercase always. This font is exclusive to the wordmark — it does not appear in body copy, headings, or UI elements.

**Body: DM Sans** — All body copy, labels, button text, navigation links. Weight 300 for body, 400 for labels/buttons.

**Mono: DM Mono** — Timestamps, section labels, metadata, data, code. Weight 300–400. Always uppercase for labels, 0.08–0.12em tracking.

### Google Fonts Import String

```
https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Mono:wght@300;400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=Josefin+Sans:wght@100;200;300&display=swap
```

### CSS Variable Assignments

```css
--fd: 'Fraunces', Georgia, serif;
--fb: 'DM Sans', system-ui, sans-serif;
--fm: 'DM Mono', monospace;
/* Josefin Sans is referenced directly as 'Josefin Sans' — no CSS variable */
```

### Wordmark Specification — NEW v3

```css
.wordmark {
  font-family: 'Josefin Sans', sans-serif;
  font-size: 15px;         /* nav context — scale to surface */
  font-weight: 200;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  /* Shimmer treatment — blue-grey metallic sweep */
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
  animation-delay: -6s;  /* offset so it doesn't fire in sync with other shimmers */
}
```

Footer instance uses the same font/weight/tracking but `color: var(--sv3)` (no shimmer — appropriate restraint at footer scale).

### Type Scale — Unchanged from v2

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
--text-xs:    11px / 1.5   / DM Mono 400     / +0.08–0.12em tracking (always uppercase)
```

---

## Color System — Unchanged from v2

```css
/* Foundation */
--void:     #060809
--base:     #0B0E11
--s1:       #111518
--s2:       #171B1F
--s3:       #1E2227
--b1:       rgba(255,255,255,0.05)
--b2:       rgba(255,255,255,0.09)
--b3:       rgba(255,255,255,0.15)

/* Silver scale */
--slate1:   #2A2F35
--slate2:   #3D444C
--slate3:   #525A64
--sv1:      #5E6B7C
--sv2:      #8593A4
--sv3:      #A8B4C0
--w-dim:    #CDD4DB
--white:    #EEF1F4
--white-pure: #F8FAFB

/* Signal */
--v:         #6ECFA3
--v-dim:     rgba(110,207,163,0.10)
--v-glow:    rgba(110,207,163,0.08)
--v-glow-md: rgba(110,207,163,0.18)
--v-glow-lg: rgba(110,207,163,0.28)
--v-wire:    rgba(110,207,163,0.32)

/* Status */
--amber:    #C9A85C
--rust:     #C97B6E
```

---

## Text Hierarchy — UPDATED v3

⚠️ v2 used a flat two-level hierarchy. v3 uses four levels. Apply consistently across all surfaces.

| Level | Token | Use |
|-------|-------|-----|
| Primary | `--white` (#EEF1F4) | Section headings, hero headings, page-level titles |
| Secondary | `--w-dim` (#CDD4DB) | Card titles, step titles, FAQ questions at rest, named subtitles |
| Body | `--sv3` (#A8B4C0) | Body copy, descriptions, paragraph text, FAQ answers, step descriptions |
| Supporting | `--sv2` (#8593A4) | Secondary body, em/italic accent text within headings |
| Muted | `--sv1` (#5E6B7C) | Labels, metadata, placeholder text, muted supporting copy |
| Metadata | `--slate3` (#525A64) | Section labels (DM Mono uppercase), timestamps, version info |

**Rules:**
- Italic (`em`) accents within Fraunces headings use `--sv2`, not the same color as the surrounding heading
- Body default (`<body>`) is `--w-dim`
- Never use `--white` for body copy of any kind
- Blue-grey tones (`sv1`/`sv2`) should be used strategically for contrast and secondary information, not as the dominant text color

---

## Shimmer Effects — UPDATED v3

### Core Shimmer Animation

```css
@keyframes shimmer {
  from { background-position: 300% center; }
  to   { background-position: -100% center; }
}
```

Duration: always 16s linear infinite. This is the pace of thinking, not racing.

### Hero Display Shimmer — NEW v3 palette

Used on italic secondary lines in the hero heading. Dual-temperature: blue-grey base with sage peak.

```css
.shimmer-line {
  font-style: italic;
  background: linear-gradient(
    105deg,
    #5a6472 0%,
    #7a8898 15%,
    #8a9890 28%,
    #c0cbc4 38%,
    #8f9ba8 50%,
    #6b7a72 62%,
    #7a8898 78%,
    #5a6472 100%
  );
  background-size: 300% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 16s linear infinite;
  display: inline;
}
```

**Color logic:** Base is cool blue-grey (`#5a6472`, `#7a8898`). Peak passes through a sage-green inflection (`#8a9890`, `#6b7a72`) before the brightness peak (`#c0cbc4`). As the sweep moves the viewer catches both temperature shifts — cooler then warmer then cooler. Subtle but dimensionally richer than a single-temperature silver.

### General Shimmer — Unchanged from v2

Used on "Your Digital Representative" wordmark and other designated shimmer text (not the hero heading):

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

### Wordmark Shimmer

See Typography section. Uses blue-grey palette with `animation-delay: -6s` to desync from other shimmer elements.

---

## Component Specifications — UPDATED v3

### Buttons

Five variants. Ghost and Solid now have metallic sweep on hover.

**Ghost** — transparent background, `--sv2` text, `--b2` border. Hover: `--s2` fill, `--white` text, `--b3` border, metallic shimmer sweep.

**Solid** — `--s3` to dark steel gradient, `--sv3` text, `--b2` border. Hover: darker gradient, `--white` text, metallic shimmer sweep.

**Subtle** — transparent, `--sv1` text, no border. Hover: `rgba(160,175,195,0.05)` fill, `--sv3` text.

**Approve/Confirm** — transparent, `--v` text, `--v-wire` border. Hover: `--v-dim` fill, `--v-glow-md` + inset `--v-glow` box shadow. Transition 400ms. Only button with color.

**Destructive** — transparent, `--sv2` text, `--b1` border. Hover: `--rust` text, rust border and background at 6%.

#### Metallic Button Shimmer — NEW v3

Both Ghost and Solid use this `::after` pseudo-element pattern. The `.btn` base requires `position: relative; overflow: hidden`.

```css
.btn-ghost::after,
.btn-solid::after {
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
  background-position: 200% center;   /* off-screen at rest */
  transition: background-position 2.2s var(--eo);
  border-radius: inherit;
  pointer-events: none;
}

.btn-ghost:hover::after,
.btn-solid:hover::after {
  background-position: -50% center;   /* sweep through on hover */
}
```

Peak opacity is 13% — reads as a catch of light, not a glow. The 2.2s transition is intentionally slow.

#### Numbered Section Elements — NEW v3

Any numbered element (feature grid numbers, step numbers, card ordinals) must highlight Veridian on parent hover:

```css
.numbered-element {
  color: var(--slate2);
  transition: color 220ms var(--eo);
}
.parent-container:hover .numbered-element {
  color: var(--v);
}
```

This pattern is required on feature grids, how-it-works steps, pricing tiers, and any other numbered lists.

### Cards — Unchanged from v2

**Default card:** `--s1` background, `--b1` border, `--r-lg` radius, 24px padding. Hover: `--s2` background, `--b2` border. Transition 220ms.

**Briefing card:** `linear-gradient(135deg, --s2, --s1)` background, `--b2` border.

**Approval card:** `--v-wire` border, full glow system at rest / hover / confirmed states.

### Inputs — Unchanged from v2

Focus ring uses `rgba(110,207,163,0.28)` border with `0 0 0 3px --v-glow` box shadow. The focus ring is the Veridian moment for inputs.

---

## Reactive Dot Matrix Background — UPDATED v3

### Specification

```javascript
// Canvas: fixed position, full viewport, pointer-events none, z-index 0
// Desktop
const SP    = 28;   // dot spacing (px)
const DB    = 0.7;  // resting dot radius (px)
const DM    = 2.0;  // max dot radius at cursor (px)
const INF   = 150;  // cursor/touch influence radius (px)

// Mobile (max-width: 767px)
const SP    = 40;   // increased spacing
const INF   = 100;  // reduced influence radius
```

### Resting State

Each dot breathes individually using a seeded random phase offset. Base opacity 0.05 + 0.03 × breath oscillation. Color at rest: `rgba(85, 95, 108, α)` — cool silver.

### Silver Wave — NEW v3

A diagonal wave of brightening silver sweeps the field at the same 16s pace as the shimmer animation, at the same 105° angle as the shimmer gradient. This creates subliminal visual coherence between the text shimmer and the background.

```javascript
const WAVE_PERIOD = 16000; // ms — matches shimmer duration exactly

// In draw loop:
const wavePhase = (performance.now() % WAVE_PERIOD) / WAVE_PERIOD;
const diagonal = W + H;
const waveFront = wavePhase * diagonal * 1.6 - diagonal * 0.3;
const waveWidth = diagonal * 0.28;

// Per-dot wave influence:
const proj = d.x * 0.259 + d.y * 0.966; // project onto 105deg axis (cos105°, sin105°)
const waveInf = Math.max(0, 1 - Math.abs(proj - waveFront) / waveWidth);
const wl = waveInf * waveInf * waveInf; // cubic falloff — soft bell shape
const waveLift = wl * 0.18;             // alpha lift at wave crest

// Color at wave crest lifts from silver base toward off-white:
// rgb(85,95,108) → rgb(210,215,220)
const sr = Math.round(85 + 125 * wl);
const sg = Math.round(95 + 120 * wl);
const sb = Math.round(108 + 112 * wl);
```

**Critical constraint:** The wave only affects resting (non-cursor) dots. Dots within cursor/touch influence range always render Veridian regardless of wave position.

### Cursor / Touch Interaction

Dots within the influence radius (`INF`) scale up and interpolate toward Veridian. This is the only place Veridian appears in the dot matrix — it is reserved exclusively for direct user interaction.

```javascript
// Veridian interpolation within influence radius:
const ri = Math.round(110 * inf + 90  * (1 - inf));
const gi = Math.round(207 * inf + 106 * (1 - inf));
const bi = Math.round(163 * inf + 122 * (1 - inf));
```

Touch events are registered exactly as mouse events — `touchmove` maps `e.touches[0]` coordinates to the influence position, `touchend` resets to off-screen (-999, -999).

```javascript
window.addEventListener('touchmove', e => {
  if (e.touches.length > 0) {
    mx = e.touches[0].clientX;
    my = e.touches[0].clientY;
  }
}, { passive: true });

window.addEventListener('touchend', () => { mx = -999; my = -999; });
```

---

## Brand Identity Rules — UPDATED v3

### VERIDIAN SYNTHETICS

**Always all-caps. No exceptions.**

Correct: `VERIDIAN SYNTHETICS`
Incorrect: `Veridian Synthetics`, `veridian synthetics`, `Veridian synthetics`

This applies in: body copy, footer, legal text, about screens, press materials, code comments, documentation, commit messages.

### "Semblance" Wordmark

When the word "Semblance" appears as the product wordmark (nav, footer, splash, app icon label), it uses Josefin Sans 200 uppercase. When it appears in body copy as a product name reference, it uses the surrounding typeface normally.

### "Digital Representative"

Always capitalized as a proper noun. Never abbreviated to "DR" in user-facing contexts. This is the product tier identity — treat it like a title.

### Voice — Unchanged from v2

Direct. Confident. Understated. Warm without familiar. Never apologetic for being capable.

Never uses "!" in UI copy. Never "Great news!" or "Exciting update!" The quality of the action speaks for itself.

---

## Motion Language — Unchanged from v2

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1)     /* entries, expansions */
--ease-in-out: cubic-bezier(0.45, 0, 0.55, 1)    /* state transitions */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)  /* briefing card arrival ONLY */

--duration-fast:    120ms   /* hover states, toggles */
--duration-base:    220ms   /* input transitions, card hovers */
--duration-slow:    400ms   /* approval states, agent input focus */
--duration-slower:  700ms   /* page load dissolve-in sequence */
--duration-ambient: 16000ms /* shimmer, dot matrix wave */
```

**Dissolve-in:**
```css
@keyframes dissolve {
  from { opacity: 0; filter: blur(8px); transform: translateY(6px); }
  to   { opacity: 1; filter: blur(0);   transform: translateY(0); }
}
```

Stagger children by 80ms. Duration 700ms ease-out. Never use spring easing except briefing card arrival.

---

## The Eight Veridian Moments — Unchanged from v2

1. Approve/Confirm button — border and glow
2. Active badge dot — pulse animation
3. Approval card — ambient border glow, intensifying on hover and confirmation
4. Input focus ring — `--v-glow` halo
5. Agent-highlighted text — `--v` color with subtle underline
6. Active inference indicator — Veridian pulse dot
7. Wire-line divider accent — 72px gradient from `--v` to transparent
8. Send button in agent input — same as approve button

**Veridian does not appear in:** decorative patterns, section backgrounds, non-approval buttons, icons, or any element not directly related to system action, approval, or direct user interaction (cursor/touch on dot matrix).

---

## semblance.run Landing Page — Reference State

### Files

```
semblance-run/
├── index.html          — single-file implementation, all CSS/JS inline
├── semblance-logo-final-1.png  — 3D wire-dissolution logo, referenced by path
└── vercel.json         — { "version": 2 }
```

### Logo Integration

The logo uses `mix-blend-mode: screen` + `filter: brightness(1.2) contrast(1.15)` to dissolve the dark rectangular background into the page. A `mask-image` radial gradient fades the rectangular boundary at 38% → 72% radius:

```css
.hero-logo-img {
  mix-blend-mode: screen;
  filter: brightness(1.2) contrast(1.15);
  -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 52%, black 38%, transparent 72%);
  mask-image: radial-gradient(ellipse 80% 80% at 50% 52%, black 38%, transparent 72%);
}
```

**Note:** This renders correctly only on a server (relative path). Local `file://` preview will show a broken image — this is expected and not a bug.

### Pending Work (not yet implemented)

- Resend waitlist API integration (`/api/waitlist.js`) — needs `re_` API key and verified `semblance.run` domain in Resend
- Favicon / open graph meta tags
- Footer product columns (VERIDIAN SYNTHETICS ecosystem) — currently stripped to Contact only
- Logo animated variant for hero (static 3D render in use)

### Development Status Note

All 33 development steps are complete with over 3,800 passing tests. The product is in final polish and pre-launch preparation. Landing page copy should reflect this — not "in active development," not "coming soon," but "feature-complete, shipping soon."

---

## Spacing, Layout, Responsive — Unchanged from v2

```
--sp-1: 4px  --sp-2: 8px   --sp-3: 12px  --sp-4: 16px
--sp-5: 20px --sp-6: 24px  --sp-8: 32px  --sp-10: 40px
--sp-12: 48px --sp-16: 64px --sp-20: 80px --sp-24: 96px

--r-sm: 4px  --r-md: 8px  --r-lg: 12px  --r-xl: 16px  --r-full: 9999px

Max content width: 1080px centered
Body padding: 80px top, 40px horizontal

Breakpoints:
--bp-mobile:   0–767px
--bp-tablet:   768–1023px
--bp-desktop:  1024–1439px
--bp-wide:     1440px+
```

---

## Living Reference

The approved reference implementation is `semblance-design-system.html` (in the `semblance-run` repo) — a living HTML document rendering all tokens, components, and interactions. This document and that file are the two authoritative sources. When they diverge, the HTML wins until both are reconciled.

---

*Locked February 25, 2026. v3 supersedes v2 in all respects. All visual work — components, landing page, marketing, app store assets — derives from this specification. Update this document before implementing any visual change. Do not implement visual changes that are not reflected here.*
