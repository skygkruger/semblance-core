// Platform Adapters — Concrete React Native implementations for PlatformAdapter.
//
// Wraps react-native-fs, @op-engineering/op-sqlite, react-native-quick-crypto,
// react-native-device-info, and @notifee/react-native into the PlatformAdapter
// interfaces defined in packages/core/platform/types.ts.
//
// CRITICAL: No network imports. All implementations are local-only.

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { open as opSqliteOpen } from '@op-engineering/op-sqlite';
import DeviceInfo from 'react-native-device-info';
import notifee, { TriggerType } from '@notifee/react-native';
import type {
  FileSystemAdapter,
  CryptoAdapter,
  SQLiteAdapter,
  DatabaseHandle,
  PreparedStatement,
  HardwareAdapter,
  NotificationAdapter,
  EncryptedPayload,
} from '@semblance/core/platform/types';

// ─── FileSystem Adapter (wraps react-native-fs) ────────────────────────────

// react-native-fs is async-native. We cache file contents for sync reads
// and provide genuine async methods. Core modules that need sync access
// will use these wrappers; most mobile code paths use async.
const fileCache = new Map<string, string>();
const bufferCache = new Map<string, Buffer>();

export function createRNFSAdapter(): FileSystemAdapter {
  return {
    existsSync(path: string): boolean {
      // RNFS is async-only. We do a synchronous lookup in cache first.
      // The mobile runtime pre-reads needed files via async stat calls.
      // For initial checks, we use a synchronous flag approach.
      try {
        // Can't truly be sync in RN — return cached knowledge or false.
        // This is acceptable because mobile init uses async paths.
        return fileCache.has(path) || bufferCache.has(path);
      } catch {
        return false;
      }
    },

    mkdirSync(path: string, options?: { recursive?: boolean }): void {
      // RNFS.mkdir is async — we fire and forget for sync compat.
      // Mobile runtime calls ensureDirectories() async before Core init.
      void RNFS.mkdir(path, { NSURLIsExcludedFromBackupKey: true });
    },

    readFileSync(path: string, _encoding: 'utf-8'): string {
      const cached = fileCache.get(path);
      if (cached !== undefined) return cached;
      throw new Error(`[RNFSAdapter] readFileSync: ${path} not in cache. Use async readFile() first.`);
    },

    readFileSyncBuffer(path: string): Buffer {
      const cached = bufferCache.get(path);
      if (cached) return cached;
      throw new Error(`[RNFSAdapter] readFileSyncBuffer: ${path} not in cache. Use async readFileBuffer() first.`);
    },

    writeFileSync(path: string, data: string | Buffer): void {
      const content = typeof data === 'string' ? data : data.toString('utf-8');
      fileCache.set(path, content);
      // Async write to disk
      void RNFS.writeFile(path, content, 'utf8');
    },

    unlinkSync(path: string): void {
      fileCache.delete(path);
      bufferCache.delete(path);
      void RNFS.unlink(path).catch(() => {});
    },

    statSync(path: string) {
      // Cannot be truly sync in RN. Throw — mobile code should use async stat().
      throw new Error(`[RNFSAdapter] statSync not available on mobile. Use async stat() instead. Path: ${path}`);
    },

    readdirSync(path: string): string[] {
      throw new Error(`[RNFSAdapter] readdirSync not available on mobile. Use async readdir() instead. Path: ${path}`);
    },

    async readFile(path: string, _encoding: 'utf-8'): Promise<string> {
      const content = await RNFS.readFile(path, 'utf8');
      fileCache.set(path, content);
      return content;
    },

    async readFileBuffer(path: string): Promise<Buffer> {
      const base64 = await RNFS.readFile(path, 'base64');
      const buf = Buffer.from(base64, 'base64');
      bufferCache.set(path, buf);
      return buf;
    },

    async readdir(path: string, _options: { withFileTypes: true }) {
      const items = await RNFS.readDir(path);
      return items.map((item) => ({
        name: item.name,
        isDirectory: () => item.isDirectory(),
        isFile: () => item.isFile(),
      }));
    },

    async stat(path: string) {
      const s = await RNFS.stat(path);
      return {
        size: s.size,
        isDirectory: () => s.isDirectory(),
        isFile: () => s.isFile(),
        mtimeMs: new Date(s.mtime).getTime(),
      };
    },
  };
}

/**
 * Pre-populate the file cache for a set of paths.
 * Call this before Core init to enable sync reads.
 */
export async function prewarmFileCache(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (p) => {
      try {
        const exists = await RNFS.exists(p);
        if (exists) {
          const stat = await RNFS.stat(p);
          if (stat.isFile()) {
            const content = await RNFS.readFile(p, 'utf8');
            fileCache.set(p, content);
          }
        }
      } catch {
        // Non-critical — file just won't be in sync cache
      }
    }),
  );
}

/**
 * Ensure critical directories exist before Core init.
 */
export async function ensureDirectories(dataDir: string): Promise<void> {
  const dirs = [
    dataDir,
    `${dataDir}/knowledge`,
    `${dataDir}/models`,
  ];
  for (const dir of dirs) {
    const exists = await RNFS.exists(dir);
    if (!exists) {
      await RNFS.mkdir(dir, { NSURLIsExcludedFromBackupKey: true });
    }
  }
}

// ─── Crypto Adapter (wraps react-native-quick-crypto) ───────────────────────

export function createCryptoAdapter(): CryptoAdapter {
  // Lazy import — only load if actually used
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('react-native-quick-crypto');

  return {
    sha256(data: string): string {
      const hash = crypto.createHash('sha256');
      hash.update(data, 'utf8');
      return hash.digest('hex');
    },

    hmacSha256(key: Buffer, data: string): string {
      const hmac = crypto.createHmac('sha256', key);
      hmac.update(data, 'utf8');
      return hmac.digest('hex');
    },

    randomBytes(size: number): Buffer {
      return Buffer.from(crypto.randomBytes(size));
    },

    async generateEncryptionKey(): Promise<string> {
      const bytes = crypto.randomBytes(32);
      return Buffer.from(bytes).toString('hex');
    },

    async encrypt(plaintext: string, keyHex: string): Promise<EncryptedPayload> {
      const key = Buffer.from(keyHex, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      const tag = cipher.getAuthTag();
      return {
        ciphertext: encrypted,
        iv: Buffer.from(iv).toString('base64'),
        tag: Buffer.from(tag).toString('base64'),
      };
    },

    async decrypt(payload: EncryptedPayload, keyHex: string): Promise<string> {
      const key = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(payload.iv, 'base64');
      const tag = Buffer.from(payload.tag, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(payload.ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    },

    timingSafeEqual(a: Buffer, b: Buffer): boolean {
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    },
  };
}

// ─── SQLite Adapter (wraps @op-engineering/op-sqlite) ───────────────────────

export function createSQLiteAdapter(): SQLiteAdapter {
  return {
    openDatabase(dbPath: string): DatabaseHandle {
      // op-sqlite expects a db name and directory separately
      const lastSlash = dbPath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? dbPath.substring(0, lastSlash) : '.';
      const name = lastSlash >= 0 ? dbPath.substring(lastSlash + 1) : dbPath;

      const db = opSqliteOpen({ name, location: dir });

      const handle: DatabaseHandle = {
        pragma(statement: string): unknown {
          const result = db.execute(`PRAGMA ${statement}`);
          if (result.rows && result.rows.length > 0) {
            const row = result.rows.item(0);
            const keys = Object.keys(row);
            return keys.length === 1 ? row[keys[0]!] : row;
          }
          return undefined;
        },

        prepare(sql: string): PreparedStatement {
          return {
            get(...params: unknown[]): unknown {
              const result = db.execute(sql, params as never[]);
              if (result.rows && result.rows.length > 0) {
                return result.rows.item(0);
              }
              return undefined;
            },

            all(...params: unknown[]): unknown[] {
              const result = db.execute(sql, params as never[]);
              const rows: unknown[] = [];
              if (result.rows) {
                for (let i = 0; i < result.rows.length; i++) {
                  rows.push(result.rows.item(i));
                }
              }
              return rows;
            },

            run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
              const result = db.execute(sql, params as never[]);
              return {
                changes: result.rowsAffected ?? 0,
                lastInsertRowid: result.insertId ?? 0,
              };
            },
          };
        },

        exec(sql: string): void {
          db.execute(sql);
        },

        transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
          const wrapper = ((...args: unknown[]) => {
            db.execute('BEGIN TRANSACTION');
            try {
              const result = fn(...args);
              db.execute('COMMIT');
              return result;
            } catch (err) {
              db.execute('ROLLBACK');
              throw err;
            }
          }) as unknown as T;
          return wrapper;
        },

        close(): void {
          db.close();
        },
      };

      return handle;
    },
  };
}

// ─── Hardware Adapter (wraps react-native-device-info) ──────────────────────

export function createHardwareAdapter(): HardwareAdapter {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  // Cache values that don't change
  let totalMemCached: number | null = null;
  let cpuCountCached: number | null = null;

  return {
    homedir(): string {
      // On mobile, use DocumentDirectory as "home"
      return RNFS.DocumentDirectoryPath;
    },

    platform(): string {
      return platform;
    },

    totalmem(): number {
      if (totalMemCached !== null) return totalMemCached;
      // Synchronous fallback — real value populated async on init
      totalMemCached = platform === 'ios' ? 6 * 1024 * 1024 * 1024 : 4 * 1024 * 1024 * 1024;
      // Populate real value async
      DeviceInfo.getTotalMemory().then((mem) => {
        totalMemCached = mem;
      }).catch(() => {});
      return totalMemCached;
    },

    freemem(): number {
      // RN doesn't expose free memory synchronously — return conservative estimate
      return Math.round((totalMemCached ?? 4 * 1024 * 1024 * 1024) * 0.3);
    },

    cpus(): number {
      if (cpuCountCached !== null) return cpuCountCached;
      // Async populate
      cpuCountCached = platform === 'ios' ? 6 : 8;
      DeviceInfo.supportedAbis().then((abis: string[]) => {
        // Rough estimate based on typical mobile hardware
        cpuCountCached = abis.length >= 2 ? 8 : 4;
      }).catch(() => {});
      return cpuCountCached;
    },
  };
}

/**
 * Initialize hardware adapter with real async values.
 * Call before creating the platform adapter.
 */
export async function initHardwareInfo(): Promise<{
  totalMemBytes: number;
  deviceName: string;
  platform: 'ios' | 'android';
}> {
  const [totalMem, deviceName] = await Promise.all([
    DeviceInfo.getTotalMemory(),
    DeviceInfo.getDeviceName(),
  ]);
  return {
    totalMemBytes: totalMem,
    deviceName,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

// ─── Notification Adapter (wraps @notifee/react-native) ─────────────────────

export function createNotificationAdapter(): NotificationAdapter {
  return {
    async scheduleLocal(notification) {
      await notifee.createTriggerNotification(
        {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          data: notification.data as Record<string, string> | undefined,
          android: {
            channelId: 'semblance-default',
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: notification.fireDate.getTime(),
        },
      );
    },

    async cancel(id: string) {
      await notifee.cancelNotification(id);
    },

    async cancelAll() {
      await notifee.cancelAllNotifications();
    },
  };
}
