/**
 * Platform Adapter Usage Tests — Verify refactored modules work through PlatformAdapter.
 *
 * These tests verify that core modules produce correct output when accessing
 * platform APIs through getPlatform() instead of direct Node.js imports.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { nanoid } from 'nanoid';

// Import through the platform-adapter-based paths
import { sha256, signRequest, verifySignature, buildSigningPayload } from '../../packages/core/types/signing.js';
import { getModelsDir, getModelPath, isModelDownloaded, listDownloadedModels, deleteModel, getModelFileSize } from '../../packages/core/llm/model-storage.js';
import { resetPlatform, initDesktopPlatform } from '../../packages/core/platform/index.js';

describe('signing.ts via PlatformAdapter', () => {
  beforeEach(() => {
    resetPlatform();
    initDesktopPlatform();
  });

  afterEach(() => {
    resetPlatform();
  });

  it('sha256 produces correct hex output', () => {
    const input = 'hello world';
    const expected = createHash('sha256').update(input, 'utf-8').digest('hex');
    expect(sha256(input)).toBe(expected);
  });

  it('sha256 is deterministic', () => {
    expect(sha256('test')).toBe(sha256('test'));
  });

  it('signRequest produces valid HMAC-SHA256', () => {
    const key = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    const id = 'test-id';
    const timestamp = '2026-01-01T00:00:00Z';
    const action = 'email.send';
    const payload = { to: ['user@example.com'] };

    const signature = signRequest(key, id, timestamp, action, payload);

    // Verify independently using node:crypto
    const sigPayload = buildSigningPayload(id, timestamp, action, payload);
    const expected = createHmac('sha256', key).update(sigPayload, 'utf-8').digest('hex');
    expect(signature).toBe(expected);
  });

  it('verifySignature returns true for valid signature', () => {
    const key = Buffer.from('abcdef0123456789abcdef0123456789', 'hex');
    const id = 'req-1';
    const ts = '2026-02-01T12:00:00Z';
    const action = 'calendar.fetch';
    const payload = { start: '2026-02-01' };

    const sig = signRequest(key, id, ts, action, payload);
    expect(verifySignature(key, sig, id, ts, action, payload)).toBe(true);
  });

  it('verifySignature returns false for tampered payload', () => {
    const key = Buffer.from('abcdef0123456789abcdef0123456789', 'hex');
    const id = 'req-2';
    const ts = '2026-02-01T12:00:00Z';
    const action = 'email.send';
    const payload = { to: ['user@example.com'] };

    const sig = signRequest(key, id, ts, action, payload);
    expect(verifySignature(key, sig, id, ts, action, { to: ['hacker@evil.com'] })).toBe(false);
  });
});

describe('model-storage.ts via PlatformAdapter', () => {
  let testDir: string;

  beforeEach(() => {
    resetPlatform();
    initDesktopPlatform();
    testDir = join(tmpdir(), `semblance-test-${nanoid(8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    resetPlatform();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('getModelsDir creates directory if missing', () => {
    const modelsDir = getModelsDir(testDir);
    expect(existsSync(modelsDir)).toBe(true);
    expect(modelsDir.endsWith('models')).toBe(true);
  });

  it('getModelPath returns correct GGUF path', () => {
    const path = getModelPath('llama3-8b', testDir);
    expect(path).toContain('llama3-8b.gguf');
  });

  it('isModelDownloaded returns false for missing model', () => {
    expect(isModelDownloaded('nonexistent', testDir)).toBe(false);
  });

  it('isModelDownloaded returns true after creating file', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'test-model.gguf'), 'fake model data');
    expect(isModelDownloaded('test-model', testDir)).toBe(true);
  });

  it('getModelFileSize returns correct size', () => {
    const modelsDir = getModelsDir(testDir);
    const data = 'x'.repeat(1024);
    writeFileSync(join(modelsDir, 'sized-model.gguf'), data);
    expect(getModelFileSize('sized-model', testDir)).toBe(1024);
  });

  it('listDownloadedModels returns all GGUF files', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'model-a.gguf'), 'a');
    writeFileSync(join(modelsDir, 'model-b.gguf'), 'bb');
    writeFileSync(join(modelsDir, 'readme.txt'), 'not a model');

    const models = listDownloadedModels(testDir);
    expect(models).toHaveLength(2);
    expect(models.map(m => m.modelId).sort()).toEqual(['model-a', 'model-b']);
  });

  it('deleteModel removes file and returns true', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'delete-me.gguf'), 'data');
    expect(deleteModel('delete-me', testDir)).toBe(true);
    expect(isModelDownloaded('delete-me', testDir)).toBe(false);
  });
});

describe('statement-parser.ts via PlatformAdapter', () => {
  let testDir: string;

  beforeEach(() => {
    resetPlatform();
    initDesktopPlatform();
    testDir = join(tmpdir(), `semblance-test-${nanoid(8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    resetPlatform();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('parseStatement reads CSV via PlatformAdapter', async () => {
    const { StatementParser } = await import('../../packages/core/finance/statement-parser.js');

    const csvPath = join(testDir, 'test.csv');
    writeFileSync(csvPath, 'Date,Amount,Description\n2026-01-15,-9.99,Netflix\n2026-01-16,-14.99,Spotify\n');

    const parser = new StatementParser();
    const result = await parser.parseStatement(csvPath);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.description).toBe('Netflix');
    expect(result.import.fileFormat).toBe('csv');
  });

  it('parseStatement reads OFX via PlatformAdapter', async () => {
    const { StatementParser } = await import('../../packages/core/finance/statement-parser.js');

    const ofxContent = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>-9.99
<NAME>NETFLIX
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const ofxPath = join(testDir, 'test.ofx');
    writeFileSync(ofxPath, ofxContent);

    const parser = new StatementParser();
    const result = await parser.parseStatement(ofxPath);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.description).toContain('NETFLIX');
    expect(result.import.fileFormat).toBe('ofx');
  });
});

describe('file-scanner.ts via PlatformAdapter', () => {
  let testDir: string;

  beforeEach(() => {
    resetPlatform();
    initDesktopPlatform();
    testDir = join(tmpdir(), `semblance-test-${nanoid(8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    resetPlatform();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('scanDirectory finds supported files via PlatformAdapter', async () => {
    const { scanDirectory } = await import('../../packages/core/knowledge/file-scanner.js');

    writeFileSync(join(testDir, 'readme.md'), '# Hello');
    writeFileSync(join(testDir, 'data.json'), '{"key": "value"}');
    writeFileSync(join(testDir, 'ignore.exe'), 'binary');

    const files = await scanDirectory(testDir);
    expect(files).toHaveLength(2);
    expect(files.map(f => f.extension).sort()).toEqual(['.json', '.md']);
  });

  it('readFileContent reads text files via PlatformAdapter', async () => {
    const { readFileContent } = await import('../../packages/core/knowledge/file-scanner.js');

    const mdPath = join(testDir, 'test.md');
    writeFileSync(mdPath, '# Test Document\n\nSome content here.');

    const content = await readFileContent(mdPath);
    expect(content.title).toBe('test');
    expect(content.content).toContain('Test Document');
    expect(content.mimeType).toBe('text/markdown');
  });

  it('scanDirectory skips excluded directories', async () => {
    const { scanDirectory } = await import('../../packages/core/knowledge/file-scanner.js');

    const nodeModules = join(testDir, 'node_modules');
    mkdirSync(nodeModules);
    writeFileSync(join(nodeModules, 'package.json'), '{}');
    writeFileSync(join(testDir, 'real.txt'), 'visible');

    const files = await scanDirectory(testDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('real.txt');
  });
});
