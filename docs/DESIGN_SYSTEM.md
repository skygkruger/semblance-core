# Semblance Design System

**Your Intelligence. Your Device. Your Rules.**

This document is the canonical visual reference for all Semblance UI work. Read this document in full before creating or modifying any UI component. If a scenario is not covered here, escalate to Orbital Directors — do not improvise.

---

## Design Philosophy

Semblance must feel like it belongs alongside Claude, Arc, Linear, and Notion — products where the design itself communicates quality and trustworthiness.

The visual identity communicates three things simultaneously:

1. **Intelligence** — This is not a toy. It is a sophisticated system that understands and acts.
2. **Warmth** — This is yours. It cares about you. It feels like an extension of yourself.
3. **Security** — This is a vault, not a sieve. Your data is safe here.

### Core Principles

| Principle | Meaning | Application |
|-----------|---------|-------------|
| Calm confidence | Never loud, never cluttered, never anxious | Restrained layouts, generous white space, clear hierarchy |
| Warm intelligence | Approachable and personal, not clinical or corporate | Rounded corners, soft shadows, gentle gradients, warm accents |
| Transparency by design | User always knows what their Semblance is doing | Privacy/activity indicators always visible, never hidden |
| Motion with purpose | Animations communicate state, never decorate | Smooth transitions, alive loading states, meaningful feedback |
| Progressive disclosure | Power users see depth, casual users see simplicity | Expandable panels, layered detail, smart defaults |

---

## Color System

### Primary Palette

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-bg-dark` | Deep Ink | `#1A1D2E` | Primary background (dark mode). Rich, not black. Conveys depth. |
| `--color-bg-light` | Soft White | `#FAFBFC` | Primary background (light mode). Warm, not sterile. |
| `--color-primary` | Semblance Blue | `#4A7FBA` | Primary brand color. Actions, links, brand moments. Trustworthy, calm. |
| `--color-accent` | Warm Amber | `#E8A838` | Secondary accent. Notifications, highlights, user's named twin. Human touch. |
| `--color-success` | Living Green | `#3DB87A` | Active/healthy status. Privacy confirmed, action successful. |
| `--color-attention` | Alert Coral | `#E85D5D` | Attention needed — not alarm. Permission requests, anomalies, review. |
| `--color-muted` | Muted Slate | `#8B93A7` | Secondary text, borders, disabled states. Quiet supporting role. |

### Extended Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary-hover` | `#3D6CA3` | Primary color hover state |
| `--color-primary-active` | `#325A8A` | Primary color active/pressed state |
| `--color-primary-subtle` | `#EBF2F9` | Primary tint for backgrounds and highlights (light mode) |
| `--color-primary-subtle-dark` | `#1E2A3E` | Primary tint for backgrounds (dark mode) |
| `--color-accent-hover` | `#D4952F` | Accent hover state |
| `--color-accent-subtle` | `#FFF6E8` | Accent tint for backgrounds (light mode) |
| `--color-success-subtle` | `#EDFAF2` | Success background tint (light mode) |
| `--color-attention-subtle` | `#FEF0F0` | Attention background tint (light mode) |
| `--color-surface-1` | `#FFFFFF` | Card/panel surface (light mode) |
| `--color-surface-1-dark` | `#222538` | Card/panel surface (dark mode) |
| `--color-surface-2` | `#F5F6F8` | Nested/secondary surface (light mode) |
| `--color-surface-2-dark` | `#2A2D42` | Nested/secondary surface (dark mode) |
| `--color-border` | `#E2E4E9` | Default border (light mode) |
| `--color-border-dark` | `#363952` | Default border (dark mode) |
| `--color-text-primary` | `#1A1D2E` | Primary text (light mode) |
| `--color-text-primary-dark` | `#ECEDF0` | Primary text (dark mode) |
| `--color-text-secondary` | `#5A6070` | Secondary text (light mode) |
| `--color-text-secondary-dark` | `#9BA0B0` | Secondary text (dark mode) |
| `--color-text-tertiary` | `#8B93A7` | Tertiary/disabled text (both modes) |

### Dark Mode Strategy

Semblance supports both light and dark modes. Dark mode is not an inversion — it is a distinct palette designed for the same emotional qualities (warmth, trust, intelligence) in low-light contexts.

- Dark mode backgrounds use Deep Ink (`#1A1D2E`), never pure black (`#000000`)
- Surfaces layer: `--color-bg-dark` → `--color-surface-1-dark` → `--color-surface-2-dark`
- Text uses off-white (`#ECEDF0`), never pure white (`#FFFFFF`)
- Primary and accent colors remain the same in both modes
- Borders use `--color-border-dark`, never opacity-based borders

---

## Typography

### Font Stack

| Role | Font | Fallback | Usage |
|------|------|----------|-------|
| **UI** | Inter | system-ui, -apple-system, sans-serif | All interface text |
| **Monospace** | JetBrains Mono | ui-monospace, Consolas, monospace | Code, logs, network monitor, technical data |
| **Display** | DM Serif Display | Fraunces, Georgia, serif | Onboarding, naming screen, marketing, empty states |

### Type Scale

Base unit: 16px (1rem). Scale uses a 1.25 ratio (Major Third).

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 11px / 0.6875rem | 400 | 1.45 | Captions, timestamps, metadata |
| `--text-sm` | 13px / 0.8125rem | 400 | 1.45 | Secondary labels, help text |
| `--text-base` | 16px / 1rem | 400 | 1.5 | Body text, input values |
| `--text-md` | 18px / 1.125rem | 500 | 1.4 | Emphasized body, card titles |
| `--text-lg` | 20px / 1.25rem | 600 | 1.35 | Section headers, modal titles |
| `--text-xl` | 24px / 1.5rem | 600 | 1.3 | Page titles |
| `--text-2xl` | 30px / 1.875rem | 700 | 1.25 | Major headings |
| `--text-3xl` | 38px / 2.375rem | 700 | 1.2 | Hero text, onboarding |
| `--text-display` | 48px / 3rem | 700 | 1.1 | Display (DM Serif Display), brand moments only |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `--font-regular` | 400 | Body text, descriptions |
| `--font-medium` | 500 | Emphasized text, active nav items |
| `--font-semibold` | 600 | Headings, button labels, card titles |
| `--font-bold` | 700 | Major headings, brand text |

---

## Spacing System

Base unit: 4px. All spacing uses multiples of this base.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | No spacing |
| `--space-1` | 4px | Tightest grouping (icon + label inline) |
| `--space-2` | 8px | Compact grouping (between related elements) |
| `--space-3` | 12px | Default inner padding (buttons, badges) |
| `--space-4` | 16px | Standard gap between elements |
| `--space-5` | 20px | Card inner padding |
| `--space-6` | 24px | Section spacing within a card |
| `--space-8` | 32px | Gap between cards/sections |
| `--space-10` | 40px | Major section separation |
| `--space-12` | 48px | Page-level section breaks |
| `--space-16` | 64px | Hero spacing, page top padding |
| `--space-20` | 80px | Maximum spacing (hero/onboarding) |

### Layout Grid

- **Desktop (>1024px):** 12-column grid, 24px gutters, max content width 1200px, centered
- **Tablet (768–1024px):** 8-column grid, 20px gutters, 16px page margins
- **Mobile (<768px):** 4-column grid, 16px gutters, 16px page margins

### Container Widths

| Token | Value | Usage |
|-------|-------|-------|
| `--container-sm` | 640px | Narrow content (settings, forms) |
| `--container-md` | 768px | Standard content (chat, detail views) |
| `--container-lg` | 1024px | Wide content (dashboard, inbox) |
| `--container-xl` | 1200px | Maximum content width |

---

## Responsive Breakpoints

| Token | Value | Target |
|-------|-------|--------|
| `--bp-sm` | 640px | Large phones (landscape) |
| `--bp-md` | 768px | Tablets (portrait) |
| `--bp-lg` | 1024px | Tablets (landscape), small laptops |
| `--bp-xl` | 1280px | Laptops |
| `--bp-2xl` | 1536px | Desktops |

Mobile-first approach: base styles are mobile, use `min-width` media queries to add complexity.

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements (badges, chips, tags) |
| `--radius-md` | 8px | Buttons, inputs, small cards |
| `--radius-lg` | 12px | Cards, panels, modals |
| `--radius-xl` | 16px | Large cards, feature panels |
| `--radius-full` | 9999px | Pill buttons, avatars, status dots |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift (buttons, small elements) |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.08)` | Cards, panels at rest |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.12)` | Elevated cards, dropdowns, popovers |
| `--shadow-xl` | `0 8px 32px rgba(0,0,0,0.16)` | Modals, dialogs |
| `--shadow-focus` | `0 0 0 3px rgba(74,127,186,0.3)` | Focus ring (Semblance Blue at 30%) |

Dark mode shadows use `rgba(0,0,0,0.3)` base instead of `0.05`–`0.16`.

---

## Motion

All animations serve a communication purpose. If an animation doesn't convey information about state change, remove it.

### Timing

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | Micro-interactions (hover, toggle, checkbox) |
| `--duration-normal` | 250ms | Standard transitions (panels, tabs, cards) |
| `--duration-slow` | 400ms | Major transitions (page changes, modal open/close) |
| `--duration-cinematic` | 800ms | Onboarding, first-run experience only |

### Easing

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default for most transitions. Feels responsive. |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Symmetrical moves (accordion, expand/collapse) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Subtle bounce for success states and playful moments |

### Patterns

| Pattern | Motion | Timing |
|---------|--------|--------|
| **Card hover** | Translate Y -2px + shadow-lg | `--duration-fast`, `--ease-out` |
| **Panel expand** | Height auto + fade content | `--duration-normal`, `--ease-in-out` |
| **Modal open** | Scale 0.95→1 + fade | `--duration-normal`, `--ease-out` |
| **Modal close** | Fade + scale 1→0.98 | `--duration-fast`, `--ease-out` |
| **Loading pulse** | Opacity 0.4↔1 in Semblance Blue | 1.5s loop, ease-in-out |
| **Success check** | Path draw + scale bounce | `--duration-slow`, `--ease-spring` |
| **Attention glow** | Box-shadow pulse in Alert Coral at 20% | 2s loop, ease-in-out |
| **Toast enter** | Slide up 16px + fade | `--duration-normal`, `--ease-out` |
| **Onboarding transitions** | Crossfade + subtle parallax | `--duration-cinematic`, `--ease-out` |

---

## Components

All components are built as part of `semblance-ui`, using Radix UI primitives for accessibility and Tailwind CSS for styling. Components must support both light and dark modes.

### Cards

The primary content container.

- Border radius: `--radius-lg` (12px)
- Shadow: `--shadow-md` at rest, `--shadow-lg` on hover
- Background: `--color-surface-1` (light) / `--color-surface-1-dark` (dark)
- Padding: `--space-5` (20px)
- Hover: translate Y -2px transition, `--duration-fast`
- Border: 1px `--color-border` / `--color-border-dark`

### Action Cards

Expandable cards showing what Semblance did. These are a core UI pattern.

- Same base as Cards
- Collapsed: shows action summary, timestamp, status dot
- Expanded: full context (what, why, data used), undo button
- Status dot: `--color-success` (completed), `--color-accent` (pending review), `--color-attention` (needs action)
- Expand/collapse: `--duration-normal`, `--ease-in-out`

### Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| **Primary** | `--color-primary` | White | None | Primary actions (Send, Confirm, Save) |
| **Secondary** | Transparent | `--color-primary` | 1px `--color-primary` | Secondary actions (Cancel, Back) |
| **Ghost** | Transparent | `--color-text-secondary` | None | Tertiary actions, icon buttons |
| **Danger** | `--color-attention` | White | None | Destructive actions (Delete, Revoke) |

- Border radius: `--radius-full` (pill) for primary, `--radius-md` for secondary/ghost
- Padding: `--space-3` vertical, `--space-5` horizontal
- Font: `--text-base`, `--font-semibold`
- Hover: darken 10%, `--duration-fast`
- Focus: `--shadow-focus` ring
- Disabled: 50% opacity, no pointer events

### Inputs

- Border radius: `--radius-md` (8px)
- Border: 1px `--color-border` → `--color-primary` on focus
- Padding: `--space-3` vertical, `--space-4` horizontal
- Background: `--color-surface-1`
- Focus: `--shadow-focus` ring + border color change
- Error: border `--color-attention`, subtle `--color-attention-subtle` background
- Font: `--text-base`

### Status Indicators

Small colored dots indicating system state. Always visible.

- Size: 8px circle
- Colors: `--color-success` (active/healthy), `--color-accent` (processing/pending), `--color-attention` (attention needed), `--color-muted` (inactive/idle)
- Optional pulse animation for active states (1.5s loop)

### Privacy Badge

A persistent indicator showing local-only status. Always visible in the interface — never hidden, never optional.

- Position: Fixed in sidebar or header
- Content: Lock icon + "Local Only" text (or "X actions today — tap to review")
- Background: `--color-success-subtle` with `--color-success` text
- Font: `--text-xs`, `--font-medium`
- Always visible. This is a trust mechanism, not a feature.

### Navigation

- Sidebar width: 240px (desktop), collapsible to 64px (icons only)
- Active item: `--color-primary-subtle` background, `--color-primary` text
- Hover: `--color-surface-2` background
- Mobile: Bottom tab bar, 56px height, max 5 items

### Toasts / Notifications

- Position: Bottom-right (desktop), top-center (mobile)
- Max width: 400px
- Border radius: `--radius-lg`
- Shadow: `--shadow-lg`
- Auto-dismiss: 5s for info, persistent for actions
- Enter: slide up + fade, `--duration-normal`
- Exit: fade, `--duration-fast`

---

## Iconography

- Icon set: Lucide Icons (open source, consistent, clean)
- Size: 16px (inline), 20px (buttons), 24px (navigation), 32px (empty states)
- Stroke width: 1.5px (matches Inter's visual weight)
- Color: inherits from text color by default

---

## Accessibility

- All interactive elements must be keyboard navigable
- Focus states must be visible (`--shadow-focus`)
- Color contrast minimum: WCAG AA (4.5:1 for text, 3:1 for large text)
- All images and icons must have appropriate alt text or aria-label
- Radix UI primitives handle ARIA attributes — do not override without reason
- Motion: respect `prefers-reduced-motion` — disable animations, keep state changes instant
- Screen reader: all status changes must be announced via aria-live regions

---

## The Onboarding Experience

The first-run experience is a cinematic moment, not a setup wizard. It uses `--duration-cinematic` timing and the Display font (DM Serif Display).

### Flow

1. **Welcome screen:** Centered text, DM Serif Display. "This is your Semblance." Pause. Fade transition.
2. **Promise screen:** "It will learn who you are, manage your world, and represent you. It will never share what it knows." Pause. Fade.
3. **Naming screen:** "What would you like to call it?" Single input field, centered. The name appears in Warm Amber after entry. This is the most important interaction in the entire product.
4. **Connection screen:** "Let's connect [name] to your world." Data source cards (email, calendar, files, etc.) with clear privacy indicators for each.
5. **Autonomy screen:** Choose starting autonomy tier (Guardian/Partner/Alter Ego) with clear explanations and the ability to set per-domain.
6. **Ready screen:** "[name] is ready." First proactive action shown immediately — even if it's just "I've found X files on your device."

### Visual Treatment

- Background: Subtle gradient from Deep Ink to a slightly lighter shade
- Text: DM Serif Display for headlines, Inter for body
- Transitions: Crossfade with 800ms timing
- The naming moment should feel significant — like naming a ship or a new companion
- After naming, the name appears in Warm Amber throughout the rest of onboarding

---

## File Organization

```
packages/semblance-ui/
├── tokens/
│   ├── colors.ts          # All color tokens (light + dark)
│   ├── typography.ts       # Type scale, weights, fonts
│   ├── spacing.ts          # Spacing scale
│   ├── shadows.ts          # Shadow definitions
│   ├── motion.ts           # Duration, easing, animation presets
│   └── breakpoints.ts      # Responsive breakpoints
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.stories.tsx
│   │   └── index.ts
│   ├── Card/
│   ├── ActionCard/
│   ├── Input/
│   ├── StatusIndicator/
│   ├── PrivacyBadge/
│   ├── Toast/
│   ├── Navigation/
│   └── ... (each component follows same structure)
├── hooks/
│   ├── useTheme.ts         # Light/dark mode management
│   ├── useMediaQuery.ts    # Responsive breakpoint hooks
│   └── useReducedMotion.ts # Motion preference detection
└── index.ts                # Public API exports
```

---

## Rules for Claude Code

1. **Read this entire document** before creating any UI component
2. **Use tokens, not raw values.** Never hardcode colors, spacing, or font sizes. Always reference the design token.
3. **Both modes.** Every component must render correctly in both light and dark mode. Test both.
4. **Accessibility first.** Use Radix UI primitives. Don't override ARIA attributes. Ensure keyboard navigation works.
5. **Respect motion preferences.** All animations must check `prefers-reduced-motion`.
6. **Privacy badge is non-negotiable.** It must be visible on every screen. If a layout doesn't accommodate it, the layout is wrong.
7. **When in doubt, escalate.** If the design system doesn't cover a scenario, ask Orbital Directors. Do not improvise visual decisions.
