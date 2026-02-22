/**
 * Mobile Dependencies Tests — Verify mobile package.json has required native dependencies
 * and that MobileAdapterConfig interface is satisfiable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MobileAdapterConfig } from '../../packages/core/platform/mobile-adapter.js';
import type {
  FileSystemAdapter,
  CryptoAdapter,
  SQLiteAdapter,
  HardwareAdapter,
  NotificationAdapter,
} from '../../packages/core/platform/types.js';
import { createMobileAdapter, mobilePath } from '../../packages/core/platform/mobile-adapter.js';

const ROOT = join(import.meta.dirname, '..', '..');
const MOBILE_PKG = JSON.parse(readFileSync(join(ROOT, 'packages', 'mobile', 'package.json'), 'utf-8')) as {
  dependencies: Record<string, string>;
};

describe('Mobile package.json dependencies', () => {
  const requiredDeps = [
    'react-native-fs',
    '@op-engineering/op-sqlite',
    'react-native-device-info',
    'react-native-quick-crypto',
    '@react-native-community/netinfo',
    'react-native-haptic-feedback',
    '@notifee/react-native',
    'react-native-gesture-handler',
    'react-native-tcp-socket',
  ];

  for (const dep of requiredDeps) {
    it(`should declare ${dep} as a dependency`, () => {
      expect(MOBILE_PKG.dependencies).toHaveProperty(dep);
    });
  }
});

describe('MobileAdapterConfig interface is satisfiable', () => {
  it('can create a mobile adapter with mock implementations', () => {
    // Build mock implementations that satisfy each adapter interface
    const mockFs: FileSystemAdapter = {
      existsSync: () => false,
      mkdirSync: () => {},
      readFileSync: () => '',
      readFileSyncBuffer: () => Buffer.alloc(0),
      writeFileSync: () => {},
      unlinkSync: () => {},
      statSync: () => ({ size: 0, isDirectory: () => false, isFile: () => true, mtimeMs: 0 }),
      readdirSync: () => [],
      readFile: async () => '',
      readFileBuffer: async () => Buffer.alloc(0),
      readdir: async () => [],
      stat: async () => ({ size: 0, isDirectory: () => false, isFile: () => true, mtimeMs: 0 }),
    };

    const mockCrypto: CryptoAdapter = {
      sha256: (data: string) => `sha256(${data})`,
      hmacSha256: (_key: Buffer, data: string) => `hmac(${data})`,
      randomBytes: (size: number) => Buffer.alloc(size),
    };

    const mockSqlite: SQLiteAdapter = {
      openDatabase: () => ({
        pragma: () => undefined,
        prepare: () => ({
          get: () => undefined,
          all: () => [],
          run: () => ({ changes: 0, lastInsertRowid: 0 }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
        exec: () => {},
        close: () => {},
      }),
    };

    const mockHardware: HardwareAdapter = {
      homedir: () => '/data/user/0/com.semblance',
      platform: () => 'android',
      totalmem: () => 6 * 1024 * 1024 * 1024,
      freemem: () => 2 * 1024 * 1024 * 1024,
      cpus: () => 8,
    };

    const mockNotifications: NotificationAdapter = {
      scheduleLocal: async () => {},
      cancel: async () => {},
      cancelAll: async () => {},
    };

    const config: MobileAdapterConfig = {
      name: 'mobile-android',
      fs: mockFs,
      crypto: mockCrypto,
      sqlite: mockSqlite,
      hardware: mockHardware,
      notifications: mockNotifications,
    };

    const adapter = createMobileAdapter(config);
    expect(adapter.name).toBe('mobile-android');
    expect(adapter.fs).toBe(mockFs);
    expect(adapter.path).toBe(mobilePath);
    expect(adapter.crypto).toBe(mockCrypto);
    expect(adapter.sqlite).toBe(mockSqlite);
    expect(adapter.hardware).toBe(mockHardware);
    expect(adapter.notifications).toBe(mockNotifications);
  });

  it('mobile adapter factory uses stubs for unconfigured subsystems', () => {
    const adapter = createMobileAdapter({ name: 'mobile-ios' });
    expect(adapter.name).toBe('mobile-ios');
    expect(adapter.path).toBe(mobilePath);

    // Stubs should throw on use
    expect(() => adapter.fs.existsSync('/tmp')).toThrow('not configured');
    expect(() => adapter.crypto.sha256('test')).toThrow('not configured');
    expect(() => adapter.sqlite.openDatabase('/tmp/test.db')).toThrow('not configured');
    expect(() => adapter.hardware.homedir()).toThrow('not configured');
  });

  it('mobilePath provides correct POSIX path operations', () => {
    expect(mobilePath.join('a', 'b', 'c')).toBe('a/b/c');
    expect(mobilePath.extname('file.txt')).toBe('.txt');
    expect(mobilePath.basename('/path/to/file.txt')).toBe('file.txt');
    expect(mobilePath.basename('/path/to/file.txt', '.txt')).toBe('file');
    expect(mobilePath.dirname('/path/to/file.txt')).toBe('/path/to');
    expect(mobilePath.sep).toBe('/');
  });
});
