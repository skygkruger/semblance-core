/**
 * Step 27 — InheritanceModeGuard tests (Commit 3, part 2).
 * Tests guard toggle and guard throws on protected resource modification.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  enableInheritanceMode,
  disableInheritanceMode,
  isInheritanceModeActive,
  assertNotInInheritanceMode,
  assertCanModify,
} from '@semblance/core/inheritance/inheritance-mode-guard';

afterEach(() => {
  disableInheritanceMode();
});

describe('InheritanceModeGuard (Step 27)', () => {
  it('toggles between enabled and disabled', () => {
    expect(isInheritanceModeActive()).toBe(false);

    enableInheritanceMode();
    expect(isInheritanceModeActive()).toBe(true);

    disableInheritanceMode();
    expect(isInheritanceModeActive()).toBe(false);
  });

  it('blocks protected resource modifications when active', () => {
    enableInheritanceMode();

    // assertNotInInheritanceMode throws
    expect(() => assertNotInInheritanceMode('update config')).toThrow('Inheritance Mode is active');

    // assertCanModify throws for protected resources
    expect(() => assertCanModify('living-will-config')).toThrow('Cannot modify');
    expect(() => assertCanModify('inheritance-config')).toThrow('Cannot modify');
    expect(() => assertCanModify('autonomy-settings')).toThrow('Cannot modify');

    // Non-protected resources should be fine
    expect(() => assertCanModify('some-other-resource')).not.toThrow();

    disableInheritanceMode();

    // After disable, nothing should throw
    expect(() => assertNotInInheritanceMode('update config')).not.toThrow();
    expect(() => assertCanModify('living-will-config')).not.toThrow();
  });
});
