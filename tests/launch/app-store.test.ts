/**
 * App Store Metadata Tests — Step 32 Launch Preparation
 *
 * Validates iOS and Android app store metadata exists and meets constraints.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const IOS = join(ROOT, 'docs', 'app-store', 'ios');
const ANDROID = join(ROOT, 'docs', 'app-store', 'android');

describe('App Store Metadata — Step 32', () => {
  it('iOS description exists and is under 4000 characters', () => {
    const path = join(IOS, 'description.txt');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content.length).toBeLessThan(4000);
  });

  it('iOS keywords exist and are under 100 characters', () => {
    const path = join(IOS, 'keywords.txt');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8').trim();
    expect(content.length).toBeGreaterThan(0);
    expect(content.length).toBeLessThan(100);
  });

  it('Android full description exists and is under 4000 characters', () => {
    const path = join(ANDROID, 'full-description.txt');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content.length).toBeLessThan(4000);
  });

  it('TestFlight notes exist and are non-empty', () => {
    const path = join(ROOT, 'docs', 'app-store', 'testflight-notes.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  it('iOS subtitle is under 30 characters', () => {
    const path = join(IOS, 'subtitle.txt');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8').trim();
    expect(content.length).toBeGreaterThan(0);
    expect(content.length).toBeLessThanOrEqual(30);
  });
});
