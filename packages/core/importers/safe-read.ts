// Safe Read — File size validation wrapper around readFileSync.
//
// All parsers MUST use safeReadFileSync instead of raw readFileSync.
// Prevents OOM from maliciously large files (zip bombs, corrupt exports).
//
// Also provides safeWalkDirectory with symlink detection to prevent
// symlink-based path traversal attacks.
//
// CRITICAL: No networking imports. Pure filesystem safety.

import { readFileSync, statSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Default max file size for JSON/CSV/text files (100MB) */
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

/** Max file size for XML streaming parsers (2GB) */
export const XML_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(path: string, size: number, maxBytes: number) {
    super(`File too large: ${path} is ${(size / 1024 / 1024).toFixed(1)}MB, limit is ${(maxBytes / 1024 / 1024).toFixed(1)}MB`);
    this.name = 'FileTooLargeError';
  }
}

export class SymlinkDetectedError extends Error {
  constructor(path: string) {
    super(`Symlink detected and skipped: ${path}. Symlinks are blocked to prevent path traversal.`);
    this.name = 'SymlinkDetectedError';
  }
}

export class XmlEntityError extends Error {
  constructor(path: string) {
    super(`XML entity definitions detected in ${path}. DOCTYPE with ENTITY is rejected to prevent XML External Entity (XXE) attacks.`);
    this.name = 'XmlEntityError';
  }
}

/**
 * Read a file with size limit enforcement.
 * Throws FileTooLargeError if the file exceeds maxBytes.
 *
 * @param path - Absolute file path
 * @param maxBytes - Maximum allowed file size (default 100MB)
 * @param encoding - File encoding (default 'utf-8')
 */
export function safeReadFileSync(
  path: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
  encoding: BufferEncoding = 'utf-8',
): string {
  // Use lstatSync to detect symlinks BEFORE reading
  const lstat = lstatSync(path);
  if (lstat.isSymbolicLink()) {
    throw new SymlinkDetectedError(path);
  }

  const stat = statSync(path);
  if (stat.size > maxBytes) {
    throw new FileTooLargeError(path, stat.size, maxBytes);
  }

  return readFileSync(path, encoding);
}

/**
 * Read a file as Buffer with size limit enforcement.
 */
export function safeReadFileSyncBuffer(
  path: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Buffer {
  const lstat = lstatSync(path);
  if (lstat.isSymbolicLink()) {
    throw new SymlinkDetectedError(path);
  }

  const stat = statSync(path);
  if (stat.size > maxBytes) {
    throw new FileTooLargeError(path, stat.size, maxBytes);
  }

  return readFileSync(path);
}

/**
 * Check if an XML file contains DOCTYPE with ENTITY definitions.
 * These are used in XXE (XML External Entity) attacks.
 * Only checks the first 4KB of the file for performance.
 */
export function rejectXmlEntities(content: string, path: string): void {
  // Only check the beginning of the file where DOCTYPE would appear
  const header = content.slice(0, 4096);
  if (/<!DOCTYPE[^>]*<!ENTITY/i.test(header)) {
    throw new XmlEntityError(path);
  }
}

/**
 * Walk a directory safely, skipping symlinks.
 * Returns an array of file paths (not directories).
 *
 * @param dir - Directory to walk
 * @param extensions - File extensions to include (e.g., ['.json', '.md'])
 * @param maxDepth - Maximum recursion depth (default 20)
 */
export function safeWalkDirectory(
  dir: string,
  extensions: string[],
  maxDepth: number = 20,
): string[] {
  const files: string[] = [];
  walkRecursive(dir, extensions, files, 0, maxDepth);
  return files;
}

function walkRecursive(
  dir: string,
  extensions: string[],
  results: string[],
  depth: number,
  maxDepth: number,
): void {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // Permission denied or deleted — skip
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    try {
      // SECURITY: Use lstatSync to detect symlinks BEFORE following them
      const lstat = lstatSync(fullPath);

      if (lstat.isSymbolicLink()) {
        // Skip symlinks silently — they could be path traversal attacks
        continue;
      }

      if (lstat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.git' || entry === '__MACOSX') continue;
        walkRecursive(fullPath, extensions, results, depth + 1, maxDepth);
      } else if (lstat.isFile()) {
        if (extensions.length === 0 || extensions.some(ext => entry.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible entries
    }
  }
}
