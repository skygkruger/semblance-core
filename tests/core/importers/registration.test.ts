/**
 * Parser Registration Tests — Verifies all parsers register at startup.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAllParsers, registerAllParsers } from '../../../packages/core/importers/registration.js';
import type { ImportPipeline } from '../../../packages/core/importers/import-pipeline.js';

describe('Parser Registration', () => {
  it('createAllParsers() returns all registered parsers', () => {
    const parsers = createAllParsers();
    // 8 original + 7 Phase 6 Batch 1 + 7 Phase 6 Batch 2 + 7 Phase 2 native = 29
    expect(parsers.length).toBe(29);
  });

  it('every parser has a valid sourceType', () => {
    const parsers = createAllParsers();
    const validTypes = ['browser_history', 'notes', 'photos_metadata', 'messaging', 'social', 'health', 'finance', 'productivity', 'research'];
    for (const parser of parsers) {
      expect(validTypes).toContain(parser.sourceType);
    }
  });

  it('every parser has non-empty supportedFormats', () => {
    const parsers = createAllParsers();
    for (const parser of parsers) {
      expect(parser.supportedFormats.length).toBeGreaterThan(0);
    }
  });

  it('registerAllParsers() calls registerParser for each parser', () => {
    const mockPipeline = {
      registerParser: vi.fn(),
    } as unknown as ImportPipeline;

    registerAllParsers(mockPipeline);
    expect(mockPipeline.registerParser).toHaveBeenCalledTimes(29);
  });
});
