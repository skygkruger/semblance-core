// Interpolation marker tests
//
// Verifies that English locale files use i18next interpolation markers
// ({{variable}} patterns) for dynamic values, and that specific keys
// known to require interpolation contain the correct markers.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const EN_DIR = join(ROOT, 'packages', 'semblance-ui', 'locales', 'en');

const INTERPOLATION_RE = /\{\{[a-zA-Z_]+\}\}/;

/**
 * Recursively walk a JSON object and return all leaf string values
 * that contain interpolation markers, along with their key paths.
 */
function findInterpolatedKeys(
  obj: Record<string, unknown>,
  prefix = '',
): { path: string; value: string }[] {
  const results: { path: string; value: string }[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') {
      if (INTERPOLATION_RE.test(val)) {
        results.push({ path: fullPath, value: val });
      }
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      results.push(...findInterpolatedKeys(val as Record<string, unknown>, fullPath));
    }
  }
  return results;
}

describe('interpolation markers', () => {
  it('English common.json contains at least 5 keys with {{variable}} interpolation', () => {
    const common = JSON.parse(readFileSync(join(EN_DIR, 'common.json'), 'utf8'));
    const interpolated = findInterpolatedKeys(common);

    expect(
      interpolated.length,
      `Expected at least 5 interpolated keys, found ${interpolated.length}`,
    ).toBeGreaterThanOrEqual(5);
  });

  it('specific keys known to need interpolation contain {{variable}} markers', () => {
    const common = JSON.parse(readFileSync(join(EN_DIR, 'common.json'), 'utf8'));

    // time.minutes_ago should contain {{count}}
    expect(common.time?.minutes_ago).toMatch(/\{\{count\}\}/);

    // screen.files.indexing_error should contain {{error}}
    expect(common.screen?.files?.indexing_error).toMatch(/\{\{error\}\}/);

    // screen.chat.ask_anything should contain {{name}}
    expect(common.screen?.chat?.ask_anything).toMatch(/\{\{name\}\}/);

    // screen.inbox.time_saved should contain {{time}}
    expect(common.screen?.inbox?.time_saved).toMatch(/\{\{time\}\}/);

    // screen.digest.autonomy_accuracy should contain {{percent}}
    expect(common.screen?.digest?.autonomy_accuracy).toMatch(/\{\{percent\}\}/);
  });
});
