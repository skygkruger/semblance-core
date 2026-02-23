/**
 * Extension Loader tests.
 * Verifies loadExtensions returns empty when no package installed,
 * getLoadedExtensions provides sync access, and registerExtension works.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadExtensions,
  getLoadedExtensions,
  registerExtension,
  clearExtensions,
} from '@semblance/core/extensions/loader';
import type { SemblanceExtension } from '@semblance/core/extensions/types';

beforeEach(() => {
  clearExtensions();
});

describe('Extension Loader', () => {
  it('loadExtensions returns empty array when no extensions installed', async () => {
    const extensions = await loadExtensions();
    expect(extensions).toEqual([]);
  });

  it('getLoadedExtensions returns empty before loadExtensions is called', () => {
    const extensions = getLoadedExtensions();
    expect(extensions).toEqual([]);
  });

  it('registerExtension adds an extension that getLoadedExtensions returns', () => {
    const mockExtension: SemblanceExtension = {
      id: '@semblance/test-ext',
      name: 'Test Extension',
      version: '1.0.0',
      tools: [],
      insightTrackers: [],
    };

    registerExtension(mockExtension);

    const loaded = getLoadedExtensions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe('@semblance/test-ext');
    expect(loaded[0]!.name).toBe('Test Extension');
  });
});
