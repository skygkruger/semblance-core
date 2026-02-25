/**
 * Marketing & Press Kit Tests — Step 32 Launch Preparation
 *
 * Validates blog post, press kit, and marketing materials.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Marketing & Press Kit — Step 32', () => {
  it('blog post exists and is 1,200-1,800 words', () => {
    const blogPath = join(ROOT, 'docs', 'website', 'blog', 'launch.md');
    expect(existsSync(blogPath)).toBe(true);

    const content = readFileSync(blogPath, 'utf-8');
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(1200);
    expect(wordCount).toBeLessThanOrEqual(1800);
  });

  it('press kit README exists', () => {
    const path = join(ROOT, 'docs', 'press-kit', 'README.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  it('fact sheet contains correct pricing ($18, $349)', () => {
    const path = join(ROOT, 'docs', 'press-kit', 'fact-sheet.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('$18');
    expect(content).toContain('$349');
  });

  it('press release contains "Veridian Synthetics" and "Semblance"', () => {
    const path = join(ROOT, 'docs', 'press-kit', 'press-release.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('Veridian Synthetics');
    expect(content).toContain('Semblance');
  });

  it('FAQ addresses privacy verification', () => {
    const path = join(ROOT, 'docs', 'press-kit', 'faq.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.toLowerCase()).toContain('verify');
    expect(content.toLowerCase()).toContain('privacy');
  });

  it('blog post has no placeholder text', () => {
    const content = readFileSync(join(ROOT, 'docs', 'website', 'blog', 'launch.md'), 'utf-8');
    const placeholders = ['[INSERT', 'TODO', 'PLACEHOLDER', 'TBD', 'FIXME'];
    for (const placeholder of placeholders) {
      expect(content.toUpperCase()).not.toContain(placeholder);
    }
  });
});
