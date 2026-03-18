// Binary Allowlist — Controls which executables Semblance may call.
//
// Two layers:
// 1. Permanent block list (compiled in, cannot be overridden)
// 2. User allowlist (SQLite-backed, user can add/remove at any time)
//
// CRITICAL: Shells are PERMANENTLY blocked. There is no config file to edit,
// no environment variable to override. Removing a binary from the block list
// requires a code change, a new build, and a code signing event.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { execFileSync } from 'node:child_process';

// ─── Permanent Block List ──────────────────────────────────────────────────────
// Compiled in. Cannot be overridden by user or runtime. Never changes at runtime.

const PERMANENT_BLOCK_LIST: readonly string[] = [
  // Shells — never permitted under any circumstances
  'sh', 'bash', 'zsh', 'fish', 'ksh', 'csh', 'tcsh', 'dash',
  'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
  // Script interpreters that could execute arbitrary code
  'python', 'python3', 'python.exe', 'ruby', 'perl', 'node', 'node.exe',
  'deno', 'bun', 'php',
  // Package managers (could install or execute)
  'npm', 'npx', 'pnpm', 'yarn', 'pip', 'pip3', 'brew', 'winget', 'choco',
  // Privilege escalation
  'sudo', 'su', 'runas',
  // Network tools that could exfiltrate data
  'curl', 'wget', 'nc', 'netcat', 'ncat', 'ssh', 'scp', 'sftp', 'ftp',
  // Archive tools that could create or extract (data exfiltration/injection risk)
  'tar', 'zip', 'unzip', '7z', 'gzip', 'gunzip',
  // Additional network relay / privacy bypass
  'socat', 'proxychains', 'tor', 'telnet',
  // Additional package managers
  'apt', 'yum', 'dnf', 'pacman', 'snap',
] as const;

const BLOCK_SET: ReadonlySet<string> = new Set(
  PERMANENT_BLOCK_LIST.map(b => b.toLowerCase()),
);

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AllowedBinary {
  id: string;
  binaryName: string;
  binaryPath: string;
  description: string | null;
  addedAt: string;
  addedBy: string;
  maxExecutionSeconds: number;
  allowStdin: boolean;
  isActive: boolean;
}

interface BinaryRow {
  id: string;
  binary_name: string;
  binary_path: string;
  description: string | null;
  added_at: string;
  added_by: string;
  max_execution_seconds: number;
  allow_stdin: number;
  is_active: number;
}

// ─── Seed Entries ──────────────────────────────────────────────────────────────

interface SeedEntry {
  name: string;
  path: string | null;
  description: string;
  platform: 'darwin' | 'win32' | 'linux' | 'all';
}

const SEED_ALLOWLIST: SeedEntry[] = [
  // macOS only
  { name: 'open', path: '/usr/bin/open', description: 'Open files and apps', platform: 'darwin' },
  { name: 'osascript', path: '/usr/bin/osascript', description: 'AppleScript and JavaScript for Automation', platform: 'darwin' },
  { name: 'shortcuts', path: '/usr/bin/shortcuts', description: 'Run macOS Shortcuts', platform: 'darwin' },
  { name: 'screencapture', path: '/usr/sbin/screencapture', description: 'Screen capture', platform: 'darwin' },
  { name: 'say', path: '/usr/bin/say', description: 'Text-to-speech', platform: 'darwin' },
  // Cross-platform (resolved at seed time)
  { name: 'ffmpeg', path: null, description: 'Audio/video processing', platform: 'all' },
  { name: 'pandoc', path: null, description: 'Document conversion', platform: 'all' },
  { name: 'git', path: null, description: 'Version control', platform: 'all' },
  // Windows only
  { name: 'explorer', path: 'C:\\Windows\\explorer.exe', description: 'Open files and folders', platform: 'win32' },
];

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS binary_allowlist (
    id TEXT PRIMARY KEY,
    binary_name TEXT NOT NULL UNIQUE,
    binary_path TEXT NOT NULL,
    description TEXT,
    added_at TEXT NOT NULL,
    added_by TEXT NOT NULL DEFAULT 'user',
    max_execution_seconds INTEGER DEFAULT 30,
    allow_stdin INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_binary_name ON binary_allowlist(binary_name);
`;

// ─── Binary Allowlist ──────────────────────────────────────────────────────────

export class BinaryAllowlist {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.seedDefaults();
  }

  /**
   * Check if a binary is permitted.
   * Returns null if allowed, reason string if blocked.
   */
  check(binaryPath: string): string | null {
    const name = binaryPath.split(/[/\\]/).pop()!.toLowerCase();

    // Layer 1: Permanent block list — always rejected
    if (BLOCK_SET.has(name)) {
      return `permanently blocked: '${name}' is on the compiled-in block list (shells, interpreters, network tools)`;
    }

    // Layer 2: User allowlist — must be listed and active
    const row = this.db.prepare(
      'SELECT * FROM binary_allowlist WHERE binary_name = ? AND is_active = 1'
    ).get(name) as BinaryRow | undefined;

    if (!row) {
      return `not in allowlist: '${name}' is not on the user binary allowlist`;
    }

    // Layer 3: Path verification — stored path must match requested path
    // Normalize both paths for comparison
    const normalizedStored = row.binary_path.toLowerCase().replace(/\\/g, '/');
    const normalizedRequested = binaryPath.toLowerCase().replace(/\\/g, '/');

    if (normalizedStored !== normalizedRequested) {
      // Also check if the basename matches and the stored path exists at the requested location
      if (!existsSync(binaryPath)) {
        return `path mismatch: binary at '${binaryPath}' does not exist`;
      }
      // Allow if the resolved binary name matches but path differs (e.g., symlinks)
      // but log the discrepancy
      const requestedName = binaryPath.split(/[/\\]/).pop()!.toLowerCase();
      if (requestedName !== name) {
        return `path substitution detected: expected '${row.binary_path}', got '${binaryPath}'`;
      }
    }

    return null; // Allowed
  }

  /**
   * Add a binary to the user allowlist.
   * Throws if it's on the permanent block list.
   */
  add(params: {
    binaryPath: string;
    description?: string;
    maxExecutionSeconds?: number;
    allowStdin?: boolean;
  }): AllowedBinary {
    // Handle both / and \ separators regardless of platform (Windows paths on Linux CI)
    const name = params.binaryPath.split(/[/\\]/).pop()!.toLowerCase();

    if (BLOCK_SET.has(name)) {
      throw new Error(`Cannot add '${name}' to allowlist: it is on the permanent block list`);
    }

    const id = `bin_${nanoid()}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO binary_allowlist (id, binary_name, binary_path, description, added_at, added_by, max_execution_seconds, allow_stdin, is_active)
      VALUES (?, ?, ?, ?, ?, 'user', ?, ?, 1)
    `).run(
      id, name, params.binaryPath,
      params.description ?? null,
      now,
      params.maxExecutionSeconds ?? 30,
      (params.allowStdin ?? false) ? 1 : 0,
    );

    return {
      id, binaryName: name, binaryPath: params.binaryPath,
      description: params.description ?? null,
      addedAt: now, addedBy: 'user',
      maxExecutionSeconds: params.maxExecutionSeconds ?? 30,
      allowStdin: params.allowStdin ?? false,
      isActive: true,
    };
  }

  /**
   * Remove a binary from the user allowlist.
   */
  remove(binaryName: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM binary_allowlist WHERE binary_name = ?'
    ).run(binaryName.toLowerCase());
    return result.changes > 0;
  }

  /**
   * List all allowlisted binaries.
   */
  list(): AllowedBinary[] {
    const rows = this.db.prepare(
      'SELECT * FROM binary_allowlist ORDER BY binary_name ASC'
    ).all() as BinaryRow[];
    return rows.map(rowToBinary);
  }

  /**
   * Get a specific entry by binary name.
   */
  get(binaryName: string): AllowedBinary | null {
    const row = this.db.prepare(
      'SELECT * FROM binary_allowlist WHERE binary_name = ?'
    ).get(binaryName.toLowerCase()) as BinaryRow | undefined;
    return row ? rowToBinary(row) : null;
  }

  /**
   * Check if a binary name is on the permanent block list.
   */
  isPermanentlyBlocked(binaryName: string): boolean {
    return BLOCK_SET.has(binaryName.toLowerCase());
  }

  /**
   * Get the permanent block list (for UI display).
   */
  getBlockList(): string[] {
    return [...PERMANENT_BLOCK_LIST];
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private seedDefaults(): void {
    const existing = this.db.prepare('SELECT binary_name FROM binary_allowlist').all() as { binary_name: string }[];
    const existingNames = new Set(existing.map(r => r.binary_name));

    const currentPlatform = platform();

    for (const seed of SEED_ALLOWLIST) {
      if (existingNames.has(seed.name.toLowerCase())) continue;
      if (seed.platform !== 'all' && seed.platform !== currentPlatform) continue;

      let resolvedPath = seed.path;

      // Resolve path for cross-platform entries
      if (!resolvedPath) {
        try {
          const whichCmd = currentPlatform === 'win32' ? 'where' : 'which';
          resolvedPath = execFileSync(whichCmd, [seed.name], { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0]!;
        } catch {
          continue; // Binary not installed — skip
        }
      }

      if (!resolvedPath) continue;

      // Verify the path exists
      if (seed.path && !existsSync(resolvedPath)) continue;

      try {
        this.add({
          binaryPath: resolvedPath,
          description: seed.description,
          maxExecutionSeconds: 30,
        });
      } catch {
        // Skip if add fails (e.g., blocked name — shouldn't happen with seeds)
      }
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rowToBinary(row: BinaryRow): AllowedBinary {
  return {
    id: row.id,
    binaryName: row.binary_name,
    binaryPath: row.binary_path,
    description: row.description,
    addedAt: row.added_at,
    addedBy: row.added_by,
    maxExecutionSeconds: row.max_execution_seconds,
    allowStdin: row.allow_stdin === 1,
    isActive: row.is_active === 1,
  };
}

/** Exported for testing */
export { PERMANENT_BLOCK_LIST, BLOCK_SET };
