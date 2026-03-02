// Intent Screen — Structural tests for IntentScreen routing, IPC imports,
// and App.tsx navigation integration.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

// ─── IntentScreen.tsx ──────────────────────────────────────────────────────

describe('IntentScreen — file and exports', () => {
  it('IntentScreen.tsx exists', () => {
    const filePath = join(ROOT, 'packages/desktop/src/screens/IntentScreen.tsx');
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports IntentScreen function', () => {
    const screen = readFile('packages/desktop/src/screens/IntentScreen.tsx');
    expect(screen).toContain('export function IntentScreen');
  });

  it('imports IPC commands for intent management', () => {
    const screen = readFile('packages/desktop/src/screens/IntentScreen.tsx');
    expect(screen).toContain('getIntent');
    expect(screen).toContain('setPrimaryGoal');
    expect(screen).toContain('addHardLimit');
    expect(screen).toContain('removeHardLimit');
    expect(screen).toContain('toggleHardLimit');
    expect(screen).toContain('addPersonalValue');
    expect(screen).toContain('removePersonalValue');
  });
});

// ─── App.tsx Integration ───────────────────────────────────────────────────

describe('IntentScreen — App.tsx routing', () => {
  const appTsx = readFile('packages/desktop/src/App.tsx');

  it('includes intent route', () => {
    expect(appTsx).toContain('/intent');
    expect(appTsx).toContain('<IntentScreen');
  });

  it('has CompassIcon component', () => {
    expect(appTsx).toContain('CompassIcon');
  });

  it('navItems includes intent entry', () => {
    // Verify intent is in the navItems array
    const navItemsMatch = appTsx.match(/const navItems[^=]*=\s*\[([\s\S]*?)\];/);
    expect(navItemsMatch).not.toBeNull();
    const navBlock = navItemsMatch![1]!;
    expect(navBlock).toContain("id: 'intent'");
    expect(navBlock).toContain('<CompassIcon');
  });
});
