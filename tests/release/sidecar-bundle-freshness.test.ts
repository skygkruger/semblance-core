import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

describe('tracked production sidecar bundle', () => {
  it('matches bridge.ts and contains only reservation import behavior', () => {
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'bundle-sidecar.js'), '--check'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );

    expect(
      result.status,
      [result.stdout, result.stderr].filter(Boolean).join('\n'),
    ).toBe(0);
    expect(result.stdout).toContain(
      'PASS: tracked bundle is current and reservation-only',
    );
  }, 30_000);
});
