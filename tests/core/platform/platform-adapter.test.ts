// Tests for Commit 6: Platform Adapter abstraction layer.
// Verifies that the platform adapter works on desktop (via Node.js wrappers)
// and that mobile stubs throw clear errors when not configured.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPlatform,
  setPlatform,
  hasPlatform,
  resetPlatform,
  initDesktopPlatform,
  isMobilePlatform,
  isDesktopPlatform,
} from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import { createMobileAdapter, mobilePath } from '@semblance/core/platform/mobile-adapter.js';
import type { PlatformAdapter, FileSystemAdapter, CryptoAdapter } from '@semblance/core/platform/types.js';

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ─── Platform Singleton ─────────────────────────────────────────────────────

describe('Platform Singleton', () => {
  beforeEach(() => {
    resetPlatform();
  });

  afterEach(() => {
    resetPlatform();
  });

  it('hasPlatform returns false before init', () => {
    expect(hasPlatform()).toBe(false);
  });

  it('auto-detects desktop in Node.js environment', () => {
    const platform = getPlatform();
    expect(platform.name).toBe('desktop');
    expect(hasPlatform()).toBe(true);
  });

  it('setPlatform overrides auto-detection', () => {
    const mobile = createMobileAdapter({ name: 'mobile-ios' });
    setPlatform(mobile);
    expect(getPlatform().name).toBe('mobile-ios');
  });

  it('initDesktopPlatform explicitly sets desktop', () => {
    const adapter = initDesktopPlatform();
    expect(adapter.name).toBe('desktop');
    expect(isDesktopPlatform()).toBe(true);
    expect(isMobilePlatform()).toBe(false);
  });

  it('isMobilePlatform detects mobile', () => {
    const mobile = createMobileAdapter({ name: 'mobile-android' });
    setPlatform(mobile);
    expect(isMobilePlatform()).toBe(true);
    expect(isDesktopPlatform()).toBe(false);
  });

  it('resetPlatform clears the singleton', () => {
    initDesktopPlatform();
    expect(hasPlatform()).toBe(true);
    resetPlatform();
    expect(hasPlatform()).toBe(false);
  });
});

// ─── Desktop Adapter — FileSystem ───────────────────────────────────────────

describe('Desktop Adapter — FileSystem', () => {
  let adapter: PlatformAdapter;

  beforeEach(() => {
    adapter = createDesktopAdapter();
  });

  it('existsSync detects existing paths', () => {
    expect(adapter.fs.existsSync(os.homedir())).toBe(true);
    expect(adapter.fs.existsSync('/nonexistent/path/xyzzy')).toBe(false);
  });

  it('readFileSync reads this test file', () => {
    const thisFile = path.resolve(__dirname, 'platform-adapter.test.ts');
    const content = adapter.fs.readFileSync(thisFile, 'utf-8');
    expect(content).toContain('Desktop Adapter — FileSystem');
  });

  it('statSync returns file info', () => {
    const thisFile = path.resolve(__dirname, 'platform-adapter.test.ts');
    const stat = adapter.fs.statSync(thisFile);
    expect(stat.size).toBeGreaterThan(0);
    expect(stat.isFile()).toBe(true);
    expect(stat.isDirectory()).toBe(false);
  });

  it('readdirSync lists directory contents', () => {
    const coreDir = path.resolve(__dirname, '../../../packages/core');
    const entries = adapter.fs.readdirSync(coreDir);
    expect(entries).toContain('index.ts');
    expect(entries).toContain('platform');
  });
});

// ─── Desktop Adapter — Path ─────────────────────────────────────────────────

describe('Desktop Adapter — Path', () => {
  let adapter: PlatformAdapter;

  beforeEach(() => {
    adapter = createDesktopAdapter();
  });

  it('join combines path segments', () => {
    const joined = adapter.path.join('foo', 'bar', 'baz.txt');
    expect(joined).toContain('foo');
    expect(joined).toContain('bar');
    expect(joined).toContain('baz.txt');
  });

  it('extname extracts file extension', () => {
    expect(adapter.path.extname('file.txt')).toBe('.txt');
    expect(adapter.path.extname('archive.tar.gz')).toBe('.gz');
    expect(adapter.path.extname('noext')).toBe('');
  });

  it('basename extracts filename', () => {
    const base = adapter.path.basename('/foo/bar/baz.txt');
    expect(base).toBe('baz.txt');
  });

  it('dirname extracts directory', () => {
    const dir = adapter.path.dirname('/foo/bar/baz.txt');
    expect(dir).toMatch(/foo.bar$/);
  });
});

// ─── Desktop Adapter — Crypto ───────────────────────────────────────────────

describe('Desktop Adapter — Crypto', () => {
  let adapter: PlatformAdapter;

  beforeEach(() => {
    adapter = createDesktopAdapter();
  });

  it('sha256 produces consistent hex hash', () => {
    const hash1 = adapter.crypto.sha256('hello');
    const hash2 = adapter.crypto.sha256('hello');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 256 bits = 64 hex chars
  });

  it('sha256 differs for different inputs', () => {
    const h1 = adapter.crypto.sha256('foo');
    const h2 = adapter.crypto.sha256('bar');
    expect(h1).not.toBe(h2);
  });

  it('hmacSha256 produces consistent signature', () => {
    const key = Buffer.from('test-signing-key');
    const sig1 = adapter.crypto.hmacSha256(key, 'data');
    const sig2 = adapter.crypto.hmacSha256(key, 'data');
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  it('hmacSha256 differs for different keys', () => {
    const key1 = Buffer.from('key-a');
    const key2 = Buffer.from('key-b');
    const sig1 = adapter.crypto.hmacSha256(key1, 'data');
    const sig2 = adapter.crypto.hmacSha256(key2, 'data');
    expect(sig1).not.toBe(sig2);
  });

  it('randomBytes produces correct length', () => {
    const bytes = adapter.crypto.randomBytes(32);
    expect(bytes).toHaveLength(32);
  });
});

// ─── Desktop Adapter — SQLite ───────────────────────────────────────────────

describe('Desktop Adapter — SQLite', () => {
  let adapter: PlatformAdapter;

  beforeEach(() => {
    adapter = createDesktopAdapter();
  });

  it('opens an in-memory database', () => {
    const db = adapter.sqlite.openDatabase(':memory:');
    expect(db).toBeDefined();
    db.pragma('journal_mode = WAL');
    db.close();
  });

  it('creates tables and inserts data', () => {
    const db = adapter.sqlite.openDatabase(':memory:');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const stmt = db.prepare('INSERT INTO test (name) VALUES (?)');
    const result = stmt.run('hello');
    expect(result.changes).toBe(1);

    const row = db.prepare('SELECT name FROM test WHERE id = ?').get(result.lastInsertRowid) as { name: string };
    expect(row.name).toBe('hello');
    db.close();
  });

  it('queries multiple rows', () => {
    const db = adapter.sqlite.openDatabase(':memory:');
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)');
    db.prepare('INSERT INTO items (value) VALUES (?)').run('a');
    db.prepare('INSERT INTO items (value) VALUES (?)').run('b');
    db.prepare('INSERT INTO items (value) VALUES (?)').run('c');

    const rows = db.prepare('SELECT value FROM items ORDER BY id').all() as Array<{ value: string }>;
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.value)).toEqual(['a', 'b', 'c']);
    db.close();
  });
});

// ─── Desktop Adapter — Hardware ─────────────────────────────────────────────

describe('Desktop Adapter — Hardware', () => {
  let adapter: PlatformAdapter;

  beforeEach(() => {
    adapter = createDesktopAdapter();
  });

  it('returns valid homedir', () => {
    expect(adapter.hardware.homedir()).toBe(os.homedir());
  });

  it('returns valid platform', () => {
    expect(['win32', 'darwin', 'linux']).toContain(adapter.hardware.platform());
  });

  it('returns positive memory values', () => {
    expect(adapter.hardware.totalmem()).toBeGreaterThan(0);
    expect(adapter.hardware.freemem()).toBeGreaterThan(0);
  });

  it('returns positive CPU count', () => {
    expect(adapter.hardware.cpus()).toBeGreaterThan(0);
  });
});

// ─── Mobile Path — Pure JS Implementation ───────────────────────────────────

describe('Mobile Path — Pure JS', () => {
  it('joins segments with /', () => {
    expect(mobilePath.join('foo', 'bar', 'baz')).toBe('foo/bar/baz');
  });

  it('collapses duplicate slashes', () => {
    expect(mobilePath.join('foo/', '/bar')).toBe('foo/bar');
  });

  it('extracts extension', () => {
    expect(mobilePath.extname('file.txt')).toBe('.txt');
    expect(mobilePath.extname('no-ext')).toBe('');
    expect(mobilePath.extname('.hidden')).toBe('');
  });

  it('extracts basename', () => {
    expect(mobilePath.basename('/data/app/models/llama.gguf')).toBe('llama.gguf');
    expect(mobilePath.basename('/data/app/models/llama.gguf', '.gguf')).toBe('llama');
  });

  it('extracts dirname', () => {
    expect(mobilePath.dirname('/data/app/models/llama.gguf')).toBe('/data/app/models');
  });

  it('has / as separator', () => {
    expect(mobilePath.sep).toBe('/');
  });
});

// ─── Mobile Adapter — Stubs ─────────────────────────────────────────────────

describe('Mobile Adapter — Unconfigured Stubs', () => {
  it('throws on unconfigured filesystem access', () => {
    const mobile = createMobileAdapter({ name: 'mobile-ios' });
    expect(() => mobile.fs.existsSync('/test')).toThrow('[MobileAdapter] FileSystem not configured');
  });

  it('throws on unconfigured crypto access', () => {
    const mobile = createMobileAdapter({ name: 'mobile-android' });
    expect(() => mobile.crypto.sha256('test')).toThrow('[MobileAdapter] Crypto not configured');
  });

  it('throws on unconfigured sqlite access', () => {
    const mobile = createMobileAdapter({ name: 'mobile-ios' });
    expect(() => mobile.sqlite.openDatabase('/test.db')).toThrow('[MobileAdapter] SQLite not configured');
  });

  it('throws on unconfigured hardware access', () => {
    const mobile = createMobileAdapter({ name: 'mobile-android' });
    expect(() => mobile.hardware.homedir()).toThrow('[MobileAdapter] Hardware not configured');
  });

  it('path works without configuration (pure JS default)', () => {
    const mobile = createMobileAdapter({ name: 'mobile-ios' });
    expect(mobile.path.join('foo', 'bar')).toBe('foo/bar');
  });
});

// ─── Mobile Adapter — With Injected Implementations ─────────────────────────

describe('Mobile Adapter — Injected Implementations', () => {
  it('accepts custom filesystem implementation', () => {
    const mockFs = {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => 'mock content',
      readFileSyncBuffer: () => Buffer.from('mock'),
      writeFileSync: () => {},
      unlinkSync: () => {},
      statSync: () => ({ size: 100, isDirectory: () => false, isFile: () => true, mtimeMs: 0 }),
      readdirSync: () => ['a.txt', 'b.txt'],
      readFile: async () => 'mock content',
      readdir: async () => [],
      stat: async () => ({ size: 100, isDirectory: () => false, isFile: () => true, mtimeMs: 0 }),
    };

    const mobile = createMobileAdapter({
      name: 'mobile-ios',
      fs: mockFs as unknown as FileSystemAdapter,
    });

    expect(mobile.fs.existsSync('/anything')).toBe(true);
    expect(mobile.fs.readFileSync('/file', 'utf-8')).toBe('mock content');
  });

  it('accepts custom crypto implementation', () => {
    const mockCrypto = {
      sha256: (data: string) => `mock-hash-${data}`,
      hmacSha256: (_key: Buffer, data: string) => `mock-hmac-${data}`,
      randomBytes: (size: number) => Buffer.alloc(size, 0x42),
    };

    const mobile = createMobileAdapter({
      name: 'mobile-android',
      crypto: mockCrypto as unknown as CryptoAdapter,
    });

    expect(mobile.crypto.sha256('test')).toBe('mock-hash-test');
    expect(mobile.crypto.randomBytes(4)).toEqual(Buffer.from([0x42, 0x42, 0x42, 0x42]));
  });
});
