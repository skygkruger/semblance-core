// Quick Capture Widget Tests — Static source audit for iOS WidgetKit code.
// These tests verify the Swift source is structurally complete without compilation.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const widgetDir = path.resolve(__dirname, '../../packages/mobile/ios/SemblanceWidget');

function readSwiftFile(name: string): string {
  return fs.readFileSync(path.join(widgetDir, name), 'utf-8');
}

describe('Quick Capture Widget (iOS) — static source audit', () => {
  it('contains import WidgetKit', () => {
    const source = readSwiftFile('SemblanceWidget.swift');
    expect(source).toContain('import WidgetKit');
  });

  it('contains AppIntentTimelineProvider', () => {
    const source = readSwiftFile('SemblanceWidget.swift');
    expect(source).toContain('AppIntentTimelineProvider');
  });

  it('no TODO, PLACEHOLDER, or FIXME marker comments in widget source', () => {
    const files = ['SemblanceWidget.swift', 'SemblanceWidgetBundle.swift', 'CaptureIntent.swift'];
    // Match only comment-style markers (uppercase), not Swift API names like `placeholder()`
    const markerPattern = /\/\/\s*(TODO|PLACEHOLDER|FIXME)\b|["'](TODO|PLACEHOLDER|FIXME)['"]/;
    for (const file of files) {
      const source = readSwiftFile(file);
      expect(source).not.toMatch(markerPattern);
    }
  });

  it('widget data reaches app via shared container (App Groups)', () => {
    const source = readSwiftFile('SemblanceWidget.swift');
    // Verify shared storage uses App Groups UserDefaults
    expect(source).toContain('UserDefaults(suiteName:');
    expect(source).toContain('group.run.veridian.semblance');
    // Verify save and load functions exist
    expect(source).toContain('func loadCaptures()');
    expect(source).toContain('func saveCapture(');
  });
});
