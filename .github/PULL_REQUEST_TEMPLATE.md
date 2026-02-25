## Summary

Brief description of what this PR does and why.

## Changes

-
-
-

## Checklist

- [ ] `tsc --noEmit` passes with no errors
- [ ] `vitest run` passes — all tests green
- [ ] `node scripts/privacy-audit/index.js` passes — privacy audit clean
- [ ] No `packages/core/` files import networking libraries
- [ ] No `@semblance/dr` imports in `packages/core/`
- [ ] No hardcoded secrets (API keys, tokens, passwords)
- [ ] No telemetry or analytics packages added
- [ ] Conventional commit messages used (`feat:`, `fix:`, `security:`, etc.)

## Testing

Describe how you tested these changes.

## Privacy Impact

- [ ] This PR does not affect the AI Core, Gateway, or IPC protocol
- [ ] This PR touches security-critical components (describe below)

## Screenshots

If applicable, add screenshots of UI changes.
