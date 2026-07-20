# Task-Based Accessibility — Automated Execution

Release ID: field-proof-multi-model-2026-07-19
Generated: 2026-07-19T20:21:59.930Z

> Automated fixture checks only. VoiceOver/NVDA manual review is still required for full FieldProven SR pass.

## Automated checks (fixtures)

### chat-landmarks
- [x] skip link present
- [x] skip link target exists
- [x] banner landmark present
- [x] main landmark present
- [x] primary navigation present
- [x] current page marked with aria-current
- [x] label/input associations present
- [x] live region present
- [x] focusable elements discovered (6)
- [x] keyboard tab order includes nav/input controls

### proof-landmarks
- [x] skip link present
- [x] skip link target exists
- [x] banner landmark present
- [x] main landmark present
- [x] primary navigation present
- [x] current page marked with aria-current
- [x] table caption present
- [x] table column headers present
- [x] focusable elements discovered (4)

### settings-landmarks
- [x] skip link present
- [x] skip link target exists
- [x] banner landmark present
- [x] main landmark present
- [x] primary navigation present
- [x] current page marked with aria-current
- [x] label/input associations present
- [x] focusable elements discovered (9)
- [x] keyboard tab order includes nav/input controls

## Manual screen-reader checklist (not automated)

- [ ] VoiceOver (macOS) or NVDA/JAWS (Windows) browse mode validates Chat workflow
- [ ] Proof Center table values readable in screen-reader browse mode
- [ ] Settings section nav announces current section
- [ ] Offline proof inspection with network disabled (manual step)
- [ ] No keyboard traps in production desktop build

## Verdict

- Automated fixture checks: **PASS**
- Full FieldProven screen-reader pass: **NOT CLAIMED** (manual items unchecked)

Reference checklist template: release/evidence/a11y/task-based-checklist.md
Fixture directory: tests/fixtures/a11y/
