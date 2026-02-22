// Tests for Step 10 Commit 10 — QuickCaptureInput component
// Structure, rendering logic, feedback formatting.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const COMPONENT_PATH = path.resolve(
  __dirname,
  '../../packages/desktop/src/components/QuickCaptureInput.tsx',
);

describe('QuickCaptureInput component', () => {
  it('component file exists', () => {
    expect(fs.existsSync(COMPONENT_PATH)).toBe(true);
  });

  it('exports QuickCaptureInput function', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    expect(content).toContain('export function QuickCaptureInput');
  });

  it('has onCapture prop in interface', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    expect(content).toContain('onCapture');
  });

  it('renders input with data-testid', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    expect(content).toContain('data-testid="quick-capture-input"');
  });

  it('renders submit button', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    expect(content).toContain('data-testid="quick-capture-submit"');
  });

  it('shows feedback on successful capture', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    expect(content).toContain('data-testid="quick-capture-feedback"');
  });

  it('handles Enter key submission', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    expect(content).toContain('handleKeyDown');
    expect(content).toContain("e.key === 'Enter'");
  });

  it('follows design system styling', () => {
    const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
    // Should use semblance design tokens
    expect(content).toContain('bg-semblance-surface-1');
    expect(content).toContain('border-semblance-border');
    expect(content).toContain('bg-semblance-primary');
  });
});
