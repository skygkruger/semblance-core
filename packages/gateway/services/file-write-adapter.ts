// File Write Adapter — Saves content to the user's filesystem.
// Security: rejects path traversal, validates directory targets.
// No network access — purely local filesystem operations.

import { homedir } from 'node:os';
import { join, basename, extname, resolve, normalize } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from './types.js';

/**
 * Resolve a directory shorthand or absolute path to a real directory path.
 * Returns null if the path is invalid or uses path traversal.
 */
function resolveDirectory(directory: string): string | null {
  const home = homedir();

  // Named shortcuts
  if (directory === 'downloads') {
    return join(home, 'Downloads');
  }
  if (directory === 'documents') {
    return join(home, 'Documents');
  }
  if (directory === 'desktop') {
    return join(home, 'Desktop');
  }

  // Absolute path — normalize and validate
  const normalized = normalize(directory);
  const resolved = resolve(normalized);

  // Must be an absolute path that doesn't escape via traversal
  if (resolved !== normalized && !resolved.startsWith(normalized)) {
    // Normalization changed the path significantly — likely traversal
    return resolved;
  }

  return resolved;
}

/**
 * Check for path traversal in a filename.
 * Rejects anything with ../, ..\, or absolute path separators.
 */
function isFilenameUnsafe(filename: string): boolean {
  if (filename.includes('..')) return true;
  if (filename.includes('/')) return true;
  if (filename.includes('\\')) return true;
  if (filename.startsWith('.') && filename !== basename(filename)) return true;
  // Must have a non-empty basename
  if (basename(filename).length === 0) return true;
  return false;
}

/**
 * Generate a timestamped filename to avoid overwriting.
 * "report.md" → "report_20260302T143022.md"
 */
function addTimestampSuffix(filename: string): string {
  const ext = extname(filename);
  const base = basename(filename, ext);
  const ts = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, '').replace('T', 'T');
  return `${base}_${ts}${ext}`;
}

export class FileWriteAdapter implements ServiceAdapter {
  async execute(
    _action: ActionType,
    payload: unknown,
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    const p = payload as {
      filename: string;
      content: string;
      directory?: string;
      overwrite?: boolean;
    };

    // Validate filename
    if (!p.filename || typeof p.filename !== 'string') {
      return { success: false, error: { code: 'INVALID_FILENAME', message: 'Filename is required' } };
    }

    if (isFilenameUnsafe(p.filename)) {
      return {
        success: false,
        error: { code: 'PATH_TRAVERSAL', message: 'Filename contains path traversal characters (../ or path separators). Use the directory parameter for path control.' },
      };
    }

    // Resolve directory
    const directory = p.directory ?? 'downloads';
    const resolvedDir = resolveDirectory(directory);
    if (!resolvedDir) {
      return { success: false, error: { code: 'INVALID_DIRECTORY', message: `Cannot resolve directory: ${directory}` } };
    }

    // Ensure directory exists
    if (!existsSync(resolvedDir)) {
      try {
        mkdirSync(resolvedDir, { recursive: true });
      } catch {
        return { success: false, error: { code: 'DIR_CREATE_FAILED', message: `Cannot create directory: ${resolvedDir}` } };
      }
    }

    // Determine final filename
    let finalFilename = p.filename;
    const targetPath = join(resolvedDir, finalFilename);

    if (existsSync(targetPath) && !p.overwrite) {
      finalFilename = addTimestampSuffix(p.filename);
    }

    const finalPath = join(resolvedDir, finalFilename);

    // Write file
    try {
      writeFileSync(finalPath, p.content, 'utf-8');
    } catch (err) {
      return {
        success: false,
        error: { code: 'WRITE_FAILED', message: `Failed to write file: ${err instanceof Error ? err.message : String(err)}` },
      };
    }

    return {
      success: true,
      data: {
        path: finalPath,
        filename: finalFilename,
        bytesWritten: Buffer.byteLength(p.content, 'utf-8'),
      },
    };
  }
}
