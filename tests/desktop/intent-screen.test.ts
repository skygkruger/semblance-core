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

  it('includes intent route as settings sub-route', () => {
    // Intent moved from sidebar to Settings sub-route
    expect(appTsx).toContain('/settings/intents');
    expect(appTsx).toContain('<IntentScreen');
  });

  it('intent is NOT in sidebar navSections (moved to settings)', () => {
    // Intent should not be in sidebar nav — it's now under Settings
    const navSectionsMatch = appTsx.match(/const navSections[^=]*=\s*\[([\s\S]*?)\];\s*\n\s*const settingsItem/);
    if (navSectionsMatch) {
      const navBlock = navSectionsMatch[1]!;
      expect(navBlock).not.toContain("id: 'intent'");
    }
  });
});
