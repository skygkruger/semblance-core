/**
 * Landing Page Tests — Step 32 Launch Preparation
 *
 * Validates landing page structure, content, size, and absence of tracking.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const LANDING_PAGE = join(ROOT, 'docs', 'website', 'index.html');

describe('Landing Page — Step 32', () => {
  it('index.html exists and is valid HTML', () => {
    expect(existsSync(LANDING_PAGE)).toBe(true);

    const content = readFileSync(LANDING_PAGE, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<html');
    expect(content).toContain('<head');
    expect(content).toContain('<body');
  });

  it('no tracking scripts', () => {
    const content = readFileSync(LANDING_PAGE, 'utf-8').toLowerCase();
    const trackingPatterns = [
      'google-analytics',
      'gtag(',
      'googletagmanager',
      'facebook',
      'pixel',
      'mixpanel',
      'segment',
      'amplitude',
      'posthog',
      'hotjar',
    ];

    for (const pattern of trackingPatterns) {
      expect(content).not.toContain(pattern);
    }

    // No external script sources (all JS should be inline)
    const externalScripts = content.match(/<script[^>]+src\s*=/gi);
    expect(externalScripts).toBeNull();
  });

  it('contains pricing ($18, $349, $199)', () => {
    const content = readFileSync(LANDING_PAGE, 'utf-8');
    expect(content).toContain('$18');
    expect(content).toContain('$349');
    expect(content).toContain('$199');
  });

  it('contains Alter Ego feature content', () => {
    const content = readFileSync(LANDING_PAGE, 'utf-8');
    expect(content).toContain('Alter Ego');
  });

  it('under 150KB', () => {
    const content = readFileSync(LANDING_PAGE);
    const sizeKB = Buffer.byteLength(content) / 1024;
    expect(sizeKB).toBeLessThan(150);
  });

  it('contains OG meta tags (og:title, og:description, og:type)', () => {
    const content = readFileSync(LANDING_PAGE, 'utf-8');
    expect(content).toMatch(/og:title/);
    expect(content).toMatch(/og:description/);
    expect(content).toMatch(/og:type/);
  });
});
