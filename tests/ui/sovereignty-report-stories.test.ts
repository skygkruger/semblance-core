/**
 * Sovereignty Report — Storybook stories and component tests.
 * Validates that the SovereigntyReportCard component, stories, and
 * supporting files exist and have the required structure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const UI_DIR = join(ROOT, 'packages', 'semblance-ui');
const COMPONENT_DIR = join(UI_DIR, 'components', 'SovereigntyReportCard');

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('SovereigntyReportCard component files exist', () => {
  it('component directory exists', () => {
    expect(existsSync(COMPONENT_DIR)).toBe(true);
  });

  it('types file exists with required props', () => {
    const types = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.types.ts'));
    expect(types).toContain('SovereigntyReportCardProps');
    expect(types).toContain('periodStart: string');
    expect(types).toContain('periodEnd: string');
    expect(types).toContain('generatedAt: string');
    expect(types).toContain('deviceId: string');
    expect(types).toContain('knowledgeSummary');
    expect(types).toContain('autonomousActions');
    expect(types).toContain('hardLimitsEnforced');
    expect(types).toContain('auditChainStatus');
    expect(types).toContain('onExportPDF');
    expect(types).toContain('loading?: boolean');
  });

  it('web component renders all report sections', () => {
    const web = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.web.tsx'));
    expect(web).toContain('Sovereignty Report');
    expect(web).toContain('Knowledge Summary');
    expect(web).toContain('Autonomous Actions');
    expect(web).toContain('Hard Limits Enforced');
    expect(web).toContain('Audit Chain Status');
    expect(web).toContain('Chain Verified');
    expect(web).toContain('Comparison Statement');
    expect(web).toContain('Export PDF');
  });

  it('CSS file exists with correct class names', () => {
    const css = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.css'));
    expect(css).toContain('.sovereignty-report');
    expect(css).toContain('.sovereignty-report__title');
    expect(css).toContain('.sovereignty-report__section-title');
    expect(css).toContain('.sovereignty-report__chain-badge--verified');
    expect(css).toContain('.sovereignty-report__export-btn');
  });

  it('index.ts exports component and types', () => {
    const index = readFile(join(COMPONENT_DIR, 'index.ts'));
    expect(index).toContain('SovereigntyReportCard');
    expect(index).toContain('SovereigntyReportCardProps');
  });

  it('component is exported from semblance-ui index', () => {
    const mainIndex = readFile(join(UI_DIR, 'index.ts'));
    expect(mainIndex).toContain('SovereigntyReportCard');
    expect(mainIndex).toContain('SovereigntyReportCardProps');
  });
});

describe('SovereigntyReportCard Storybook stories', () => {
  it('stories file exists', () => {
    expect(existsSync(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'))).toBe(true);
  });

  it('contains SovereigntyReportPreview story', () => {
    const stories = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'));
    expect(stories).toContain('SovereigntyReportPreview');
  });

  it('contains SovereigntyReportEmpty story', () => {
    const stories = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'));
    expect(stories).toContain('SovereigntyReportEmpty');
  });

  it('contains SovereigntyReportGenerator story', () => {
    const stories = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'));
    expect(stories).toContain('SovereigntyReportGenerator');
  });

  it('SovereigntyReportPreview has populated data', () => {
    const stories = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'));
    // Must have real sample data
    expect(stories).toContain('email');
    expect(stories).toContain('calendar');
    expect(stories).toContain('comparisonStatement');
    expect(stories).toContain('onExportPDF');
  });

  it('SovereigntyReportGenerator uses loading prop', () => {
    const stories = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'));
    expect(stories).toContain('loading: true');
  });

  it('uses Trellis background color', () => {
    const stories = readFile(join(COMPONENT_DIR, 'SovereigntyReportCard.stories.tsx'));
    expect(stories).toContain('#0B0E11');
  });
});
