// No hardcoded English strings tests
//
// Verifies that user-facing .tsx files use i18n translation keys
// instead of hardcoded English text in JSX. Scans for the pattern
// >[A-Z][a-z] which catches JSX text like >Settings< or >Continue<.
// Stories files are excluded since they are development-only fixtures.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

// Pattern: closing bracket followed by an uppercase letter then lowercase
// This catches hardcoded English text in JSX like: >Settings</h1>
const HARDCODED_PATTERN = />[A-Z][a-z]/;

/**
 * Recursively collect .tsx files from a directory, excluding stories and style files.
 */
function collectTsxFiles(dir: string, excludePatterns: RegExp[] = []): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
          files.push(...collectTsxFiles(fullPath, excludePatterns));
        } else if (entry.endsWith('.tsx')) {
          const shouldExclude = excludePatterns.some((p) => p.test(entry));
          if (!shouldExclude) {
            files.push(fullPath);
          }
        }
      } catch {
        // skip inaccessible
      }
    }
  } catch {
    // dir doesn't exist
  }
  return files;
}

/**
 * Finds lines with hardcoded English text in JSX.
 * Returns an array of "file:line — content" strings for failures.
 */
function findHardcodedStrings(files: string[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && HARDCODED_PATTERN.test(line)) {
        // Filter out common false positives:
        // - SVG paths/attributes (e.g., viewBox, clipPath)
        // - HTML entities (e.g., >&amp;)
        // - Type annotations, generics, comments
        // - CSS class names or data attributes
        // - aria-label (these use t() in practice, the raw string is the key)
        const trimmed = line.trim();
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*') ||
          trimmed.includes('viewBox') ||
          trimmed.includes('clipPath') ||
          trimmed.includes('xmlns') ||
          trimmed.includes('d="') ||
          trimmed.includes('className') ||
          />\s*\{/.test(trimmed)  // JSX expression like >{t('key')}<
        ) {
          continue;
        }
        violations.push(`${file}:${i + 1} — ${trimmed}`);
      }
    }
  }
  return violations;
}

describe('no hardcoded English strings in JSX', () => {
  it('semblance-ui components have zero hardcoded English text (excluding stories)', () => {
    const componentsDir = join(ROOT, 'packages', 'semblance-ui', 'components');
    const files = collectTsxFiles(componentsDir, [/\.stories\.tsx$/]);
    const violations = findHardcodedStrings(files);

    expect(
      violations,
      `Found ${violations.length} hardcoded string(s) in semblance-ui components:\n${violations.join('\n')}`,
    ).toHaveLength(0);
  });

  it('desktop screens have zero hardcoded English text', () => {
    const screensDir = join(ROOT, 'packages', 'desktop', 'src', 'screens');
    const files = collectTsxFiles(screensDir, [/\.stories\.tsx$/]);
    const violations = findHardcodedStrings(files);

    expect(
      violations,
      `Found ${violations.length} hardcoded string(s) in desktop screens:\n${violations.join('\n')}`,
    ).toHaveLength(0);
  });

  it('mobile screens have zero hardcoded English text', () => {
    const screensDir = join(ROOT, 'packages', 'mobile', 'src', 'screens');
    const files = collectTsxFiles(screensDir, [/\.stories\.tsx$/, /\.styles\.ts$/]);
    const violations = findHardcodedStrings(files);

    expect(
      violations,
      `Found ${violations.length} hardcoded string(s) in mobile screens:\n${violations.join('\n')}`,
    ).toHaveLength(0);
  });
});
