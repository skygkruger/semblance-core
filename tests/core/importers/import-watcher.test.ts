/**
 * ImportWatcher Tests — Watches a folder and auto-routes files to parsers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ImportWatcher } from '../../../packages/core/importers/import-watcher.js';
import type { ImportPipeline, ImportSummary } from '../../../packages/core/importers/import-pipeline.js';
import type { ImportParser, ImportResult, ParseOptions, ImportSourceType } from '../../../packages/core/importers/types.js';

// Mock parser
class MockParser implements ImportParser {
  readonly sourceType: ImportSourceType = 'browser_history';
  readonly supportedFormats = ['mock_json'];
  private canParseResult: boolean;

  constructor(canParse: boolean = true) {
    this.canParseResult = canParse;
  }

  canParse(filePath: string): boolean {
    return this.canParseResult && filePath.endsWith('.json');
  }

  async parse(_path: string, _options?: ParseOptions): Promise<ImportResult> {
    return {
      format: 'mock_json',
      items: [{ id: 'mock_1', sourceType: 'browser_history', title: 'Mock', content: 'test', timestamp: new Date().toISOString(), metadata: {} }],
      errors: [],
      totalFound: 1,
    };
  }
}

// Mock pipeline
function createMockPipeline(): ImportPipeline {
  return {
    runImport: vi.fn().mockResolvedValue({
      importId: 'test-import',
      sourceType: 'browser_history',
      format: 'mock_json',
      totalFound: 1,
      imported: 1,
      skippedDuplicates: 0,
      errors: [],
      durationMs: 10,
      knowledgeMomentFired: false,
    } satisfies ImportSummary),
    registerParser: vi.fn(),
    getAvailableSources: vi.fn(),
    getImportHistory: vi.fn(),
    initSchema: vi.fn(),
  } as unknown as ImportPipeline;
}

describe('ImportWatcher', () => {
  let tmpDir: string;
  let watcher: ImportWatcher;
  let pipeline: ImportPipeline;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semblance-watcher-'));
    pipeline = createMockPipeline();
    watcher = new ImportWatcher({ watchDir: tmpDir, pollIntervalMs: 100 }, pipeline);
    watcher.registerParser(new MockParser());
  });

  afterEach(() => {
    watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates watch directory if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'subdir', 'imports');
    const w2 = new ImportWatcher({ watchDir: newDir }, pipeline);
    w2.registerParser(new MockParser());
    await w2.start();
    expect(fs.existsSync(newDir)).toBe(true);
    w2.stop();
  });

  it('creates processed/ subdirectory', async () => {
    await watcher.start();
    expect(fs.existsSync(path.join(tmpDir, 'processed'))).toBe(true);
    watcher.stop();
  });

  it('detects and processes a new JSON file', async () => {
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, '{"data": "test"}');

    const results = await watcher.scanDirectory();
    expect(results).toHaveLength(1);
    expect(results[0]!.filename).toBe('test.json');
    expect(results[0]!.imported).toBe(1);
  });

  it('moves processed files to processed/ directory', async () => {
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, '{"data": "test"}');

    await watcher.scanDirectory();

    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'processed', 'test.json'))).toBe(true);
  });

  it('skips files that no parser can handle', async () => {
    const filePath = path.join(tmpDir, 'random.xyz');
    fs.writeFileSync(filePath, 'unrecognized data');

    const results = await watcher.scanDirectory();
    expect(results).toHaveLength(0);
    // File should still be in place
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('deduplicates by content hash on subsequent scans', async () => {
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, '{"data": "same-content"}');
    await watcher.scanDirectory();

    // Write same content again with different filename
    const filePath2 = path.join(tmpDir, 'test2.json');
    fs.writeFileSync(filePath2, '{"data": "same-content"}');
    const results = await watcher.scanDirectory();
    expect(results).toHaveLength(0);
  });

  it('processes files with different content', async () => {
    const filePath1 = path.join(tmpDir, 'a.json');
    const filePath2 = path.join(tmpDir, 'b.json');
    fs.writeFileSync(filePath1, '{"data": "content-a"}');
    fs.writeFileSync(filePath2, '{"data": "content-b"}');

    const results = await watcher.scanDirectory();
    expect(results).toHaveLength(2);
  });

  it('skips hidden files (dot-prefixed)', async () => {
    fs.writeFileSync(path.join(tmpDir, '.hidden.json'), '{}');
    const results = await watcher.scanDirectory();
    expect(results).toHaveLength(0);
  });

  it('calls pipeline.runImport with correct args', async () => {
    const filePath = path.join(tmpDir, 'data.json');
    fs.writeFileSync(filePath, '{"test": true}');

    await watcher.scanDirectory();
    expect(pipeline.runImport).toHaveBeenCalledWith(filePath, 'browser_history');
  });

  it('start() and stop() control running state', async () => {
    expect(watcher.isRunning).toBe(false);
    await watcher.start();
    expect(watcher.isRunning).toBe(true);
    watcher.stop();
    expect(watcher.isRunning).toBe(false);
  });
});
