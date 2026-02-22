// Mobile Platform Adapter — Stub implementation for React Native.
//
// On mobile, the actual adapter implementations are injected at app startup
// from the React Native layer. This file provides:
// 1. A factory to create the mobile adapter with injected implementations.
// 2. Default stubs that throw clear errors if a subsystem is used before injection.
//
// Usage in React Native:
//   import { createMobileAdapter } from '@semblance/core/platform/mobile-adapter';
//   import { setPlatform } from '@semblance/core/platform';
//
//   const adapter = createMobileAdapter({
//     name: 'mobile-ios',
//     fs: rnfsAdapter,         // wraps react-native-fs
//     path: pathAdapter,       // pure JS path utils
//     crypto: cryptoAdapter,   // wraps react-native-crypto
//     sqlite: sqliteAdapter,   // wraps op-sqlite
//     hardware: deviceInfo,    // wraps react-native-device-info
//     notifications: notifee,  // wraps notifee local notifications
//   });
//   setPlatform(adapter);

import type {
  PlatformAdapter,
  FileSystemAdapter,
  PathAdapter,
  CryptoAdapter,
  SQLiteAdapter,
  DatabaseHandle,
  PreparedStatement,
  HardwareAdapter,
  NotificationAdapter,
  VectorStoreAdapter,
} from './types.js';

// ─── Pure JS Path Implementation ────────────────────────────────────────────

/**
 * Pure JavaScript path utilities that work in any JS environment.
 * Uses POSIX-style paths (forward slashes) which is correct for both iOS and Android.
 */
export const mobilePath: PathAdapter = {
  join: (...segments: string[]) => {
    return segments
      .filter(s => s.length > 0)
      .join('/')
      .replace(/\/+/g, '/');
  },
  extname: (filePath: string) => {
    const lastDot = filePath.lastIndexOf('.');
    const lastSlash = filePath.lastIndexOf('/');
    if (lastDot <= 0 || lastDot <= lastSlash) return '';
    return filePath.slice(lastDot);
  },
  basename: (filePath: string, ext?: string) => {
    let base = filePath.split('/').pop() ?? filePath;
    if (ext && base.endsWith(ext)) {
      base = base.slice(0, -ext.length);
    }
    return base;
  },
  resolve: (...segments: string[]) => {
    // On mobile, resolve relative to '/' (absolute paths expected)
    return '/' + segments
      .filter(s => s.length > 0)
      .join('/')
      .replace(/\/+/g, '/');
  },
  dirname: (filePath: string) => {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  },
  sep: '/',
};

// ─── Stub Adapters (throw on use) ───────────────────────────────────────────

function notConfigured(subsystem: string): never {
  throw new Error(
    `[MobileAdapter] ${subsystem} not configured. ` +
    `Call setPlatform() with a fully configured mobile adapter at app startup.`
  );
}

const stubFs: FileSystemAdapter = {
  existsSync: () => notConfigured('FileSystem'),
  mkdirSync: () => notConfigured('FileSystem'),
  readFileSync: () => notConfigured('FileSystem'),
  readFileSyncBuffer: () => notConfigured('FileSystem'),
  writeFileSync: () => notConfigured('FileSystem'),
  unlinkSync: () => notConfigured('FileSystem'),
  statSync: () => notConfigured('FileSystem'),
  readdirSync: () => notConfigured('FileSystem'),
  readFile: () => notConfigured('FileSystem'),
  readFileBuffer: () => notConfigured('FileSystem'),
  readdir: () => notConfigured('FileSystem'),
  stat: () => notConfigured('FileSystem'),
};

const stubCrypto: CryptoAdapter = {
  sha256: () => notConfigured('Crypto'),
  hmacSha256: () => notConfigured('Crypto'),
  randomBytes: () => notConfigured('Crypto'),
  generateEncryptionKey: () => notConfigured('Crypto'),
  encrypt: () => notConfigured('Crypto'),
  decrypt: () => notConfigured('Crypto'),
};

const stubSqlite: SQLiteAdapter = {
  openDatabase: () => notConfigured('SQLite'),
};

const stubHardware: HardwareAdapter = {
  homedir: () => notConfigured('Hardware'),
  platform: () => notConfigured('Hardware'),
  totalmem: () => notConfigured('Hardware'),
  freemem: () => notConfigured('Hardware'),
  cpus: () => notConfigured('Hardware'),
};

const stubNotifications: NotificationAdapter = {
  scheduleLocal: () => notConfigured('Notifications'),
  cancel: () => notConfigured('Notifications'),
  cancelAll: () => notConfigured('Notifications'),
};

// ─── Mobile Adapter Factory ─────────────────────────────────────────────────

export interface MobileAdapterConfig {
  /** Platform: 'mobile-ios' or 'mobile-android' */
  name: 'mobile-ios' | 'mobile-android';
  /** File system implementation (wraps react-native-fs) */
  fs?: FileSystemAdapter;
  /** Path implementation. Defaults to pure JS POSIX paths. */
  path?: PathAdapter;
  /** Crypto implementation (wraps react-native-crypto or pure JS) */
  crypto?: CryptoAdapter;
  /** SQLite implementation (wraps op-sqlite or react-native-quick-sqlite) */
  sqlite?: SQLiteAdapter;
  /** Hardware info (wraps react-native-device-info) */
  hardware?: HardwareAdapter;
  /** Notifications (wraps notifee for local notifications) */
  notifications?: NotificationAdapter;
  /** Vector store (SQLiteVectorStore for mobile) */
  vectorStore?: VectorStoreAdapter;
}

/**
 * Create a mobile platform adapter.
 * Subsystems not provided will throw clear errors on use.
 * Path defaults to a pure JS implementation.
 */
export function createMobileAdapter(config: MobileAdapterConfig): PlatformAdapter {
  return {
    name: config.name,
    fs: config.fs ?? stubFs,
    path: config.path ?? mobilePath,
    crypto: config.crypto ?? stubCrypto,
    sqlite: config.sqlite ?? stubSqlite,
    hardware: config.hardware ?? stubHardware,
    notifications: config.notifications ?? stubNotifications,
    vectorStore: config.vectorStore,
  };
}
