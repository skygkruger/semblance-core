/**
 * Activity Screen — Reasoning Context tests.
 * Validates that ActivityScreen renders reasoning context detail when
 * LogEntry has a reasoningContext field, and that the IPC types support it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const DESKTOP_DIR = join(ROOT, 'packages', 'desktop', 'src');
const UI_DIR = join(ROOT, 'packages', 'semblance-ui');

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('ActivityScreen reasoning context', () => {
  it('ActivityScreen renders reasoning context when present on entry', () => {
    const screen = readFile(join(DESKTOP_DIR, 'screens', 'ActivityScreen.tsx'));
    // Must check for reasoningContext on entry
    expect(screen).toContain('entry.reasoningContext');
    // Must show "This action was based on:" text
    expect(screen).toContain('reasoning_based_on');
    // Must render query text
    expect(screen).toContain('reasoningContext.query');
    // Must render chunk sources
    expect(screen).toContain('reasoningContext.chunks');
    expect(screen).toContain('chunk.source');
    expect(screen).toContain('chunk.title');
    expect(screen).toContain('chunk.chunkId');
  });

  it('LogEntry IPC type includes optional reasoningContext', () => {
    const types = readFile(join(DESKTOP_DIR, 'ipc', 'types.ts'));
    // LogEntry must have reasoningContext field
    expect(types).toContain('reasoningContext?: ReasoningContext');
  });

  it('ReasoningContext type has query and chunks fields', () => {
    const types = readFile(join(DESKTOP_DIR, 'ipc', 'types.ts'));
    expect(types).toContain('interface ReasoningContext');
    expect(types).toContain('query: string');
    expect(types).toContain('chunks: ReasoningChunkRef[]');
    expect(types).toContain('retrievedAt: string');
  });

  it('ReasoningChunkRef type has source, title, chunkId', () => {
    const types = readFile(join(DESKTOP_DIR, 'ipc', 'types.ts'));
    expect(types).toContain('interface ReasoningChunkRef');
    expect(types).toContain('chunkId: string');
    expect(types).toContain('title: string');
    expect(types).toContain('source: string');
  });

  it('common locale has reasoning_based_on key', () => {
    const locale = JSON.parse(readFile(join(UI_DIR, 'locales', 'en', 'common.json')));
    expect(locale.screen.activity.reasoning_based_on).toBeTruthy();
    expect(locale.screen.activity.reasoning_based_on).toContain('based on');
  });
});
