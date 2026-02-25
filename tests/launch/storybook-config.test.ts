/**
 * Storybook Configuration Tests — Step 32 Launch Preparation
 *
 * Validates Storybook setup: config files exist, design tokens applied,
 * stories present, telemetry disabled, no production deps, no core imports.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = join(import.meta.dirname, '..', '..');
const UI_DIR = join(ROOT, 'packages', 'semblance-ui');
const STORYBOOK_DIR = join(UI_DIR, '.storybook');

// Helper: recursively glob for story files
function findStoryFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.stories.tsx')) {
        results.push(full);
      }
    }
  }
  walk(join(UI_DIR, 'components'));
  walk(join(UI_DIR, 'stories'));
  return results;
}

describe('Storybook Configuration — Step 32', () => {
  it('storybook config files exist (.storybook/main.ts, .storybook/preview.ts)', () => {
    expect(existsSync(join(STORYBOOK_DIR, 'main.ts'))).toBe(true);
    expect(existsSync(join(STORYBOOK_DIR, 'preview.ts'))).toBe(true);
  });

  it('preview imports from ../tokens/colors (applies design tokens)', () => {
    const preview = readFileSync(join(STORYBOOK_DIR, 'preview.ts'), 'utf-8');
    expect(preview).toContain('../tokens/colors');
  });

  it('storybook is devDependency only (not in "dependencies")', () => {
    const pkgJson = JSON.parse(readFileSync(join(UI_DIR, 'package.json'), 'utf-8'));
    // Must be in devDependencies
    const devDeps = pkgJson.devDependencies || {};
    const hasStorybookDev = Object.keys(devDeps).some((k) => k.includes('storybook'));
    expect(hasStorybookDev).toBe(true);

    // Must NOT be in regular dependencies
    const deps = pkgJson.dependencies || {};
    const hasStorybookProd = Object.keys(deps).some((k) => k.includes('storybook'));
    expect(hasStorybookProd).toBe(false);
  });

  it('at least 5 story files exist', () => {
    const storyFiles = findStoryFiles(UI_DIR);
    expect(storyFiles.length).toBeGreaterThanOrEqual(5);
  });

  it('design token showcase story exists and references colors/spacing/typography', () => {
    const designTokenStory = join(UI_DIR, 'stories', 'DesignTokens.stories.tsx');
    expect(existsSync(designTokenStory)).toBe(true);

    const content = readFileSync(designTokenStory, 'utf-8');
    expect(content).toContain('colors');
    expect(content).toContain('spacing');
    expect(content).toContain('typography');
  });

  it('stories do not import from packages/core/', () => {
    const storyFiles = findStoryFiles(UI_DIR);
    for (const file of storyFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from\s+['"].*packages\/core/);
      expect(content).not.toMatch(/from\s+['"]@semblance\/core/);
    }
  });

  it('main config disables telemetry (disableTelemetry: true)', () => {
    const mainConfig = readFileSync(join(STORYBOOK_DIR, 'main.ts'), 'utf-8');
    expect(mainConfig).toContain('disableTelemetry: true');
  });

  it('no network imports in story files', () => {
    const storyFiles = findStoryFiles(UI_DIR);
    const networkPatterns = [
      /import.*['"](node:)?https?['"]/,
      /import.*['"]axios['"]/,
      /import.*['"]node-fetch['"]/,
      /import.*['"]undici['"]/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
    ];

    for (const file of storyFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of networkPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
