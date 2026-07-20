# Task-Based Accessibility Checklist

> **Scope:** Screen-reader and keyboard workflows required for full FieldProven accessibility.
> **Automated gate:** `node scripts/a11y-gate.js` (axe-core on landmark fixtures + Storybook static when built).
> **This checklist:** Human verification — not required for automated gate PASS.

Version: template (complete per release during field review)

## Preconditions

- Desktop build under test installed on target OS
- VoiceOver (macOS) or NVDA/JAWS (Windows) available
- Keyboard-only input (unplug mouse or disable trackpad)

## Chat workflow

- [ ] Skip link moves focus to main conversation region
- [ ] Primary navigation announces current page (Chat)
- [ ] Message log exposes new assistant replies via live region without stealing focus
- [ ] Message input label is announced; Send activates with Enter/Space
- [ ] Tab order: nav → conversation → input → send (no keyboard traps)

## Proof Center workflow

- [ ] Proof table caption and column headers announced correctly
- [ ] Row values readable in screen-reader browse mode
- [ ] Offline proof inspection works with network disabled (manual step)

## Settings workflow

- [ ] Settings section nav distinguishes current section
- [ ] Form fields have visible labels tied to inputs
- [ ] Save action receives focus confirmation / status feedback

## Sign-off

| Reviewer | Date | Build / release ID | Result |
|----------|------|--------------------|--------|
|          |      |                    | PASS / FAIL |

Store completed checklist copy under `release/evidence/a11y/` when field review is executed.

## Capture CLI (follow-up FU-2)

```bash
# After real VoiceOver/NVDA session on production desktop build:
node scripts/capture-a11y-sr.js --interactive
# or fill release/evidence/a11y/sr-signoff.checklist.template.json then:
node scripts/capture-a11y-sr.js --from-checklist release/evidence/a11y/sr-signoff.checklist.template.json
```

Pins `release/evidence/a11y/sr-signoff.v1.json` only when all checks are true.
