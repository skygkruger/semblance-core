// Desktop Platform Adapter — Wraps Node.js APIs for the PlatformAdapter interface.
//
// This is the default adapter used on desktop (Tauri).
// All Node.js-specific imports are isolated here.

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';

import type {
  PlatformAdapter,
  FileSystemAdapter,
  PathAdapter,
  CryptoAdapter,
  SQLiteAdapter,
  DatabaseHandle,
  HardwareAdapter,
  NotificationAdapter,
} from './types.js';

// ─── File System ────────────────────────────────────────────────────────────

const desktopFs: FileSystemAdapter = {
  existsSync: (p: string) => fs.existsSync(p),
  mkdirSync: (p: string, options?: { recursive?: boolean }) => {
    fs.mkdirSync(p, options);
  },
  readFileSync: (p: string, encoding: 'utf-8') => fs.readFileSync(p, encoding),
  readFileSyncBuffer: (p: string) => fs.readFileSync(p),
  writeFileSync: (p: string, data: string | Buffer) => {
    fs.writeFileSync(p, data);
  },
  unlinkSync: (p: string) => {
    fs.unlinkSync(p);
  },
  statSync: (p: string) => {
    const stat = fs.statSync(p);
    return {
      size: stat.size,
      isDirectory: () => stat.isDirectory(),
      isFile: () => stat.isFile(),
      mtimeMs: stat.mtimeMs,
    };
  },
  readdirSync: (p: string) => fs.readdirSync(p),
  readFile: (p: string, encoding: 'utf-8') => fsPromises.readFile(p, encoding),
  readdir: async (p: string, _options: { withFileTypes: true }) => {
    const entries = await fsPromises.readdir(p, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: () => e.isDirectory(),
      isFile: () => e.isFile(),
    }));
  },
  stat: async (p: string) => {
    const stat = await fsPromises.stat(p);
    return {
      size: stat.size,
      isDirectory: () => stat.isDirectory(),
      isFile: () => stat.isFile(),
      mtimeMs: stat.mtimeMs,
    };
  },
};

// ─── Path ───────────────────────────────────────────────────────────────────

const desktopPath: PathAdapter = {
  join: (...segments: string[]) => path.join(...segments),
  extname: (filePath: string) => path.extname(filePath),
  basename: (filePath: string, ext?: string) => ext ? path.basename(filePath, ext) : path.basename(filePath),
  resolve: (...segments: string[]) => path.resolve(...segments),
  dirname: (filePath: string) => path.dirname(filePath),
  sep: path.sep,
};

// ─── Crypto ─────────────────────────────────────────────────────────────────

const desktopCrypto: CryptoAdapter = {
  sha256: (data: string) => createHash('sha256').update(data, 'utf-8').digest('hex'),
  hmacSha256: (key: Buffer, data: string) => createHmac('sha256', key).update(data, 'utf-8').digest('hex'),
  randomBytes: (size: number) => randomBytes(size),
};

// ─── SQLite ─────────────────────────────────────────────────────────────────

const desktopSqlite: SQLiteAdapter = {
  openDatabase: (dbPath: string): DatabaseHandle => {
    const db = new Database(dbPath);
    return {
      pragma: (statement: string) => db.pragma(statement),
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        return {
          get: (...params: unknown[]) => stmt.get(...params),
          all: (...params: unknown[]) => stmt.all(...params),
          run: (...params: unknown[]) => stmt.run(...params),
        };
      },
      exec: (sql: string) => {
        db.exec(sql);
      },
      close: () => {
        db.close();
      },
    };
  },
};

// ─── Hardware ───────────────────────────────────────────────────────────────

const desktopHardware: HardwareAdapter = {
  homedir: () => os.homedir(),
  platform: () => os.platform(),
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem(),
  cpus: () => os.cpus().length,
};

// ─── Notifications ──────────────────────────────────────────────────────────

const desktopNotifications: NotificationAdapter = {
  async scheduleLocal(_notification) {
    // Desktop notifications handled by Tauri's notification API.
    // This is a stub — actual implementation lives in packages/desktop/.
    console.warn('[DesktopAdapter] Notifications should be handled by Tauri frontend.');
  },
  async cancel(_id) {
    // Stub
  },
  async cancelAll() {
    // Stub
  },
};

// ─── Combined Adapter ───────────────────────────────────────────────────────

/**
 * Create the desktop platform adapter wrapping all Node.js APIs.
 */
export function createDesktopAdapter(): PlatformAdapter {
  return {
    name: 'desktop',
    fs: desktopFs,
    path: desktopPath,
    crypto: desktopCrypto,
    sqlite: desktopSqlite,
    hardware: desktopHardware,
    notifications: desktopNotifications,
  };
}
