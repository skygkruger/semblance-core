// Platform Adapter Types — Abstractions for platform-specific APIs.
//
// Core imports platform functionality through these interfaces, not directly.
// Desktop: wraps Node.js APIs (node:fs, node:path, node:os, node:crypto, better-sqlite3).
// Mobile: wraps React Native equivalents (react-native-fs, op-sqlite, etc.).
//
// This allows packages/core/ to work identically on both desktop and mobile without
// any platform-specific imports scattered throughout the codebase.

/**
 * File system operations abstraction.
 * Desktop: node:fs
 * Mobile: react-native-fs or expo-file-system
 */
export interface FileSystemAdapter {
  /** Check if a file/directory exists (synchronous) */
  existsSync(path: string): boolean;

  /** Create directory recursively (synchronous) */
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  /** Read file contents as string (synchronous) */
  readFileSync(path: string, encoding: 'utf-8'): string;

  /** Read file contents as Buffer (synchronous) */
  readFileSyncBuffer(path: string): Buffer;

  /** Write file contents (synchronous) */
  writeFileSync(path: string, data: string | Buffer): void;

  /** Delete a file (synchronous) */
  unlinkSync(path: string): void;

  /** Get file stats (synchronous) */
  statSync(path: string): { size: number; isDirectory(): boolean; isFile(): boolean; mtimeMs: number };

  /** Read directory contents (synchronous) */
  readdirSync(path: string): string[];

  /** Read file contents as string (async) */
  readFile(path: string, encoding: 'utf-8'): Promise<string>;

  /** Read directory contents with file type info (async) */
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>;

  /** Read file contents as Buffer (async) */
  readFileBuffer(path: string): Promise<Buffer>;

  /** Get file stats (async) */
  stat(path: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean; mtimeMs: number }>;
}

/**
 * Path manipulation abstraction.
 * Desktop: node:path
 * Mobile: pure JS path utilities (no OS-level path resolution needed)
 */
export interface PathAdapter {
  /** Join path segments */
  join(...segments: string[]): string;

  /** Get file extension */
  extname(filePath: string): string;

  /** Get base filename */
  basename(filePath: string, ext?: string): string;

  /** Resolve to absolute path */
  resolve(...segments: string[]): string;

  /** Get directory name */
  dirname(filePath: string): string;

  /** Path separator ('/' on POSIX, '\\' on Windows) */
  sep: string;
}

/**
 * Cryptographic operations abstraction.
 * Desktop: node:crypto
 * Mobile: react-native-crypto or pure-JS implementation
 */
export interface CryptoAdapter {
  /** Compute SHA-256 hash of a string, returns hex */
  sha256(data: string): string;

  /** Compute HMAC-SHA256, returns hex */
  hmacSha256(key: Buffer, data: string): string;

  /** Generate random bytes */
  randomBytes(size: number): Buffer;

  /** Generate a random 256-bit encryption key, returns hex */
  generateEncryptionKey(): Promise<string>;

  /** AES-256-GCM encrypt. keyHex is a 64-char hex string (32 bytes). */
  encrypt(plaintext: string, keyHex: string): Promise<EncryptedPayload>;

  /** AES-256-GCM decrypt. keyHex is a 64-char hex string (32 bytes). */
  decrypt(payload: EncryptedPayload, keyHex: string): Promise<string>;
}

/**
 * SQLite database abstraction.
 * Desktop: better-sqlite3 (synchronous API)
 * Mobile: op-sqlite or react-native-quick-sqlite
 *
 * The interface mirrors better-sqlite3's synchronous API since that's what Core expects.
 * Mobile implementations must provide a synchronous-compatible wrapper.
 */
export interface SQLiteAdapter {
  /** Open a SQLite database file. Returns a database handle. */
  openDatabase(path: string): DatabaseHandle;
}

/**
 * Database handle — wraps a single SQLite database connection.
 * Mirrors the better-sqlite3 API surface used by Core.
 */
export interface DatabaseHandle {
  /** Execute a pragma statement */
  pragma(statement: string): unknown;

  /** Prepare a SQL statement */
  prepare(sql: string): PreparedStatement;

  /** Execute raw SQL (no return value) */
  exec(sql: string): void;

  /** Wrap operations in a transaction. Returns a function that executes the transaction. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<T extends (...args: any[]) => any>(fn: T): T;

  /** Close the database connection */
  close(): void;
}

/**
 * Prepared statement handle.
 * Mirrors the better-sqlite3 prepared statement API.
 */
export interface PreparedStatement {
  /** Execute and return first matching row */
  get(...params: unknown[]): unknown;

  /** Execute and return all matching rows */
  all(...params: unknown[]): unknown[];

  /** Execute a modification statement (INSERT, UPDATE, DELETE) */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

/**
 * Hardware information abstraction.
 * Desktop: node:os
 * Mobile: React Native device info
 */
export interface HardwareAdapter {
  /** User's home directory */
  homedir(): string;

  /** Platform identifier: 'win32' | 'darwin' | 'linux' | 'ios' | 'android' */
  platform(): string;

  /** Total system memory in bytes */
  totalmem(): number;

  /** Free system memory in bytes */
  freemem(): number;

  /** Number of CPU cores */
  cpus(): number;
}

/**
 * Notification abstraction.
 * Desktop: Tauri notifications or system notifications
 * Mobile: react-native-push-notification / notifee (local only)
 */
export interface NotificationAdapter {
  /** Schedule a local notification */
  scheduleLocal(notification: {
    id: string;
    title: string;
    body: string;
    /** When to fire — Date or ms from now */
    fireDate: Date;
    /** Optional data payload */
    data?: Record<string, unknown>;
  }): Promise<void>;

  /** Cancel a scheduled notification */
  cancel(id: string): Promise<void>;

  /** Cancel all scheduled notifications */
  cancelAll(): Promise<void>;
}

// ─── Vector Store Adapter ────────────────────────────────────────────────────

/**
 * A single vector entry to be inserted into the vector store.
 */
export interface VectorEntry {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  vector: number[];
  metadata: string;          // JSON string
  sourceType?: string;
  sourceId?: string;
}

/**
 * A search result from the vector store.
 */
export interface VectorResult {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  metadata: string;
  sourceType: string;
  sourceId: string;
  score: number;
}

/**
 * Filter options for vector search.
 */
export interface VectorFilter {
  sourceTypes?: string[];
}

/**
 * Platform-agnostic vector storage adapter.
 * Desktop: LanceDB (Rust-native embedded vector DB).
 * Mobile: SQLite with brute-force cosine similarity.
 */
export interface VectorStoreAdapter {
  /** Initialize the vector store for a given table/collection. */
  initialize(name: string, dimensions: number): Promise<void>;

  /** Insert vector entries. */
  insertChunks(chunks: VectorEntry[]): Promise<void>;

  /** Search for nearest neighbors by embedding vector. */
  search(queryVector: number[], limit: number, filter?: VectorFilter): Promise<VectorResult[]>;

  /** Delete all entries for a given document ID. */
  deleteByDocumentId(documentId: string): Promise<void>;

  /** Get total entry count. */
  count(): Promise<number>;

  /** Close/release resources. */
  close(): void;
}

// ─── Encrypted Payload ──────────────────────────────────────────────────────

/**
 * AES-256-GCM encrypted payload.
 */
export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded 12-byte initialization vector */
  iv: string;
  /** Base64-encoded 16-byte GCM authentication tag */
  tag: string;
}

/**
 * The unified platform adapter.
 * One instance is set globally at app startup.
 * Core modules access platform functionality through this adapter.
 */
export interface PlatformAdapter {
  /** Platform name for identification */
  name: 'desktop' | 'mobile-ios' | 'mobile-android';

  /** File system operations */
  fs: FileSystemAdapter;

  /** Path manipulation */
  path: PathAdapter;

  /** Cryptographic operations */
  crypto: CryptoAdapter;

  /** SQLite database access */
  sqlite: SQLiteAdapter;

  /** Hardware information */
  hardware: HardwareAdapter;

  /** Notifications */
  notifications: NotificationAdapter;

  /** Vector storage (optional — not all platforms configure this at adapter creation) */
  vectorStore?: VectorStoreAdapter;
}
