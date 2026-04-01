// Filesystem Executor — Implements actual filesystem operations in the Gateway.
//
// All filesystem access for orchestrator tools happens here.
// The AI Core defines tool schemas; this module executes them.
//
// This file is in packages/gateway/. Local filesystem access is permitted.

import { readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync, cpSync, statSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, basename, extname, relative, sep } from 'node:path';
import { homedir } from 'node:os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  lastModified: string;
}

export interface SearchMatch {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface FileInfoResult {
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  created: string;
  modified: string;
  extension: string;
  mimeType: string;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export class FilesystemExecutor {
  /**
   * Resolve a path, expanding ~ to the user's home directory.
   */
  private resolvePath(inputPath: string): string {
    if (inputPath.startsWith('~')) {
      return resolve(join(homedir(), inputPath.slice(1)));
    }
    return resolve(inputPath);
  }

  /**
   * Read the contents of a file.
   */
  readFile(params: {
    path: string;
    encoding?: string;
    maxBytes?: number;
    lineRange?: { start: number; end: number };
  }): { content: string; size: number; lineCount: number; truncated: boolean } {
    const filePath = this.resolvePath(params.path);
    const encoding = (params.encoding ?? 'utf-8') as BufferEncoding;
    const stat = statSync(filePath);

    let content: string;
    if (params.maxBytes && stat.size > params.maxBytes) {
      const buf = Buffer.alloc(params.maxBytes);
      const fd = require('node:fs').openSync(filePath, 'r');
      require('node:fs').readSync(fd, buf, 0, params.maxBytes, 0);
      require('node:fs').closeSync(fd);
      content = buf.toString(encoding);
    } else {
      content = readFileSync(filePath, { encoding });
    }

    if (params.lineRange) {
      const lines = content.split('\n');
      const start = Math.max(0, params.lineRange.start - 1);
      const end = Math.min(lines.length, params.lineRange.end);
      content = lines.slice(start, end).join('\n');
    }

    return {
      content,
      size: stat.size,
      lineCount: content.split('\n').length,
      truncated: !!(params.maxBytes && stat.size > params.maxBytes),
    };
  }

  /**
   * Write content to a file.
   */
  writeFile(params: {
    path: string;
    content: string;
    createDirectories?: boolean;
    overwrite?: boolean;
  }): { path: string; bytesWritten: number } {
    const filePath = this.resolvePath(params.path);

    if (!params.overwrite && existsSync(filePath)) {
      throw new Error(`File already exists: ${filePath}. Set overwrite=true to replace.`);
    }

    if (params.createDirectories !== false) {
      const dir = require('node:path').dirname(filePath);
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, params.content, 'utf-8');
    return { path: filePath, bytesWritten: Buffer.byteLength(params.content, 'utf-8') };
  }

  /**
   * Edit a file with find-and-replace operations.
   */
  editFile(params: {
    path: string;
    edits: Array<{ oldText: string; newText: string }>;
    dryRun?: boolean;
  }): { path: string; editsApplied: number; diff: string } {
    const filePath = this.resolvePath(params.path);
    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let editsApplied = 0;

    for (const edit of params.edits) {
      if (content.includes(edit.oldText)) {
        content = content.replace(edit.oldText, edit.newText);
        editsApplied++;
      }
    }

    // Build a simple diff
    const diff = editsApplied > 0
      ? params.edits
          .filter(e => originalContent.includes(e.oldText))
          .map(e => `- ${e.oldText.slice(0, 80)}\n+ ${e.newText.slice(0, 80)}`)
          .join('\n')
      : '(no changes)';

    if (!params.dryRun && editsApplied > 0) {
      writeFileSync(filePath, content, 'utf-8');
    }

    return { path: filePath, editsApplied, diff };
  }

  /**
   * List directory contents.
   */
  listDirectory(params: {
    path: string;
    recursive?: boolean;
    maxDepth?: number;
    includeHidden?: boolean;
    pattern?: string;
  }): FileEntry[] {
    const dirPath = this.resolvePath(params.path);
    const maxDepth = params.maxDepth ?? 2;
    const entries: FileEntry[] = [];

    this.walkDir(dirPath, entries, 0, maxDepth, params.recursive ?? false, params.includeHidden ?? false, params.pattern);

    return entries.slice(0, 500); // Cap to prevent overwhelming output
  }

  private walkDir(
    dir: string,
    entries: FileEntry[],
    depth: number,
    maxDepth: number,
    recursive: boolean,
    includeHidden: boolean,
    pattern?: string,
  ): void {
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (!includeHidden && item.name.startsWith('.')) continue;
        if (pattern && !this.matchGlob(item.name, pattern)) {
          // For directories in recursive mode, still enter them even if name doesn't match
          if (!(item.isDirectory() && recursive)) continue;
        }

        const fullPath = join(dir, item.name);
        try {
          const stat = statSync(fullPath);
          const entry: FileEntry = {
            name: item.name,
            path: fullPath,
            type: item.isDirectory() ? 'directory' : item.isSymbolicLink() ? 'symlink' : item.isFile() ? 'file' : 'other',
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
          };

          // Only add if pattern matches (or no pattern) — but always add directories for navigation
          if (!pattern || this.matchGlob(item.name, pattern) || item.isDirectory()) {
            if (!pattern || this.matchGlob(item.name, pattern)) {
              entries.push(entry);
            }
          }

          if (recursive && item.isDirectory() && depth < maxDepth) {
            this.walkDir(fullPath, entries, depth + 1, maxDepth, true, includeHidden, pattern);
          }
        } catch { /* skip inaccessible */ }
      }
    } catch { /* skip inaccessible directory */ }
  }

  /**
   * Create a directory (including parents).
   */
  createDirectory(params: { path: string }): { path: string } {
    const dirPath = this.resolvePath(params.path);
    mkdirSync(dirPath, { recursive: true });
    return { path: dirPath };
  }

  /**
   * Move/rename a file or directory.
   */
  moveFile(params: { source: string; destination: string }): { source: string; destination: string } {
    const src = this.resolvePath(params.source);
    const dest = this.resolvePath(params.destination);
    renameSync(src, dest);
    return { source: src, destination: dest };
  }

  /**
   * Copy a file or directory.
   */
  copyFile(params: { source: string; destination: string; overwrite?: boolean }): { source: string; destination: string } {
    const src = this.resolvePath(params.source);
    const dest = this.resolvePath(params.destination);

    if (!params.overwrite && existsSync(dest)) {
      throw new Error(`Destination already exists: ${dest}. Set overwrite=true to replace.`);
    }

    const stat = statSync(src);
    if (stat.isDirectory()) {
      cpSync(src, dest, { recursive: true });
    } else {
      const destDir = require('node:path').dirname(dest);
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, dest);
    }
    return { source: src, destination: dest };
  }

  /**
   * Search file contents for a pattern (grep-like).
   */
  searchFileContents(params: {
    path: string;
    pattern: string;
    filePattern?: string;
    maxResults?: number;
    caseSensitive?: boolean;
  }): SearchMatch[] {
    const dirPath = this.resolvePath(params.path);
    const maxResults = params.maxResults ?? 50;
    const flags = params.caseSensitive ? '' : 'i';
    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, flags);
    } catch {
      regex = new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }

    const matches: SearchMatch[] = [];
    this.searchDir(dirPath, regex, matches, maxResults, params.filePattern);
    return matches;
  }

  private searchDir(
    dir: string,
    regex: RegExp,
    matches: SearchMatch[],
    maxResults: number,
    filePattern?: string,
  ): void {
    if (matches.length >= maxResults) return;
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (matches.length >= maxResults) return;
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const fullPath = join(dir, item.name);

        if (item.isDirectory()) {
          this.searchDir(fullPath, regex, matches, maxResults, filePattern);
        } else if (item.isFile()) {
          if (filePattern && !this.matchGlob(item.name, filePattern)) continue;
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) return;
              if (regex.test(lines[i]!)) {
                matches.push({
                  filePath: fullPath,
                  lineNumber: i + 1,
                  lineContent: lines[i]!.trim().slice(0, 200),
                  contextBefore: i > 0 ? lines[i - 1]!.trim().slice(0, 100) : undefined,
                  contextAfter: i < lines.length - 1 ? lines[i + 1]!.trim().slice(0, 100) : undefined,
                });
              }
            }
          } catch { /* binary or inaccessible file */ }
        }
      }
    } catch { /* inaccessible directory */ }
  }

  /**
   * Find files matching a glob pattern.
   */
  globSearch(params: {
    path: string;
    pattern: string;
    maxResults?: number;
  }): Array<{ path: string; size: number; type: string }> {
    const dirPath = this.resolvePath(params.path);
    const maxResults = params.maxResults ?? 100;
    const results: Array<{ path: string; size: number; type: string }> = [];
    this.globDir(dirPath, params.pattern, results, maxResults);
    return results;
  }

  private globDir(
    dir: string,
    pattern: string,
    results: Array<{ path: string; size: number; type: string }>,
    maxResults: number,
  ): void {
    if (results.length >= maxResults) return;
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (results.length >= maxResults) return;
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const fullPath = join(dir, item.name);

        if (this.matchGlob(item.name, pattern) || this.matchGlob(relative(this.resolvePath('.'), fullPath).replace(/\\/g, '/'), pattern)) {
          try {
            const stat = statSync(fullPath);
            results.push({
              path: fullPath,
              size: stat.size,
              type: item.isDirectory() ? 'directory' : 'file',
            });
          } catch { /* skip */ }
        }

        if (item.isDirectory() && (pattern.includes('**') || pattern.includes('/'))) {
          this.globDir(fullPath, pattern, results, maxResults);
        }
      }
    } catch { /* inaccessible */ }
  }

  /**
   * Get file metadata.
   */
  fileInfo(params: { path: string }): FileInfoResult {
    const filePath = this.resolvePath(params.path);
    const stat = statSync(filePath);
    const ext = extname(filePath);

    return {
      path: filePath,
      type: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other',
      size: stat.size,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      extension: ext,
      mimeType: guessMimeType(ext),
    };
  }

  /**
   * Simple glob matching (supports * and **).
   */
  private matchGlob(name: string, pattern: string): boolean {
    // Convert glob to regex
    const escaped = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*')
      .replace(/\?/g, '.');
    try {
      return new RegExp(`^${escaped}$`, 'i').test(name);
    } catch {
      return name.includes(pattern);
    }
  }
}

// ─── MIME Type Guesser ────────────────────────────────────────────────────────

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.tsx': 'text/typescript',
    '.jsx': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
    '.py': 'text/x-python', '.rs': 'text/x-rust', '.go': 'text/x-go',
    '.java': 'text/x-java', '.c': 'text/x-c', '.cpp': 'text/x-c++',
    '.h': 'text/x-c', '.rb': 'text/x-ruby', '.sh': 'text/x-shellscript',
    '.yaml': 'text/yaml', '.yml': 'text/yaml', '.xml': 'text/xml',
    '.csv': 'text/csv', '.sql': 'text/x-sql', '.toml': 'text/x-toml',
    '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '': 'application/octet-stream',
  };
  return map[ext.toLowerCase()] ?? 'application/octet-stream';
}
