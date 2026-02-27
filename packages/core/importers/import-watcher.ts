/**
 * ImportWatcher — Watches a user-configured folder for new export files.
 *
 * When a file appears in the watched folder, ImportWatcher:
 *   1. Scans registered parsers via canParse()
 *   2. Routes to the matching parser
 *   3. Feeds ImportPipeline.runImport()
 *   4. Moves processed files to a processed/ subdirectory
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportPipeline } from './import-pipeline.js';
import type { ImportParser, ImportSourceType } from './types.js';
import { safeReadFileSyncBuffer } from './safe-read.js';

export interface ImportWatcherConfig {
  /** Directory to watch for new import files. Default: ~/Semblance/imports/ */
  watchDir: string;
  /** Interval in milliseconds to poll for new files. Default: 5000. */
  pollIntervalMs?: number;
}

export interface WatchedFileResult {
  filename: string;
  sourceType: ImportSourceType;
  format: string;
  imported: number;
  error?: string;
}

/**
 * Compute a SHA-256 hash of file contents for deduplication.
 */
function hashFileContent(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export class ImportWatcher {
  private watchDir: string;
  private pollIntervalMs: number;
  private pipeline: ImportPipeline;
  private parsers: ImportParser[] = [];
  private processedHashes: Set<string> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: ImportWatcherConfig, pipeline: ImportPipeline) {
    this.watchDir = config.watchDir;
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
    this.pipeline = pipeline;
  }

  /** Register a parser that the watcher can route files to. */
  registerParser(parser: ImportParser): void {
    this.parsers.push(parser);
  }

  /** Register multiple parsers. */
  registerParsers(parsers: ImportParser[]): void {
    for (const parser of parsers) {
      this.parsers.push(parser);
    }
  }

  /** Start watching the import directory. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const fs = await import('node:fs');
    const path = await import('node:path');

    // Ensure watch directory exists
    if (!fs.existsSync(this.watchDir)) {
      fs.mkdirSync(this.watchDir, { recursive: true });
    }

    // Ensure processed/ subdirectory exists
    const processedDir = path.join(this.watchDir, 'processed');
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    // Initial scan
    await this.scanDirectory();

    // Start polling
    this.pollTimer = setInterval(() => {
      void this.scanDirectory();
    }, this.pollIntervalMs);
  }

  /** Stop watching. */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Whether the watcher is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Scan the watch directory and process any new files.
   * Returns results for each processed file.
   */
  async scanDirectory(): Promise<WatchedFileResult[]> {
    const fs = await import('node:fs');
    const path = await import('node:path');

    if (!fs.existsSync(this.watchDir)) {
      return [];
    }

    // Ensure processed/ subdirectory exists
    const processedDir = path.join(this.watchDir, 'processed');
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    const entries = fs.readdirSync(this.watchDir, { withFileTypes: true });
    const results: WatchedFileResult[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue; // Skip hidden files

      const filePath = path.join(this.watchDir, entry.name);

      // Check if we've already processed this file (by content hash)
      const content = safeReadFileSyncBuffer(filePath);
      const hash = hashFileContent(content);

      if (this.processedHashes.has(hash)) {
        continue;
      }

      // Find a matching parser
      const match = this.findParser(filePath);
      if (!match) {
        // Unrecognized file — leave in place
        continue;
      }

      // Process through import pipeline
      try {
        const summary = await this.pipeline.runImport(filePath, match.sourceType);
        this.processedHashes.add(hash);

        // Move to processed/ directory
        const processedDir = path.join(this.watchDir, 'processed');
        const destPath = path.join(processedDir, entry.name);
        fs.renameSync(filePath, destPath);

        results.push({
          filename: entry.name,
          sourceType: match.sourceType,
          format: summary.format,
          imported: summary.imported,
        });
      } catch (err) {
        results.push({
          filename: entry.name,
          sourceType: match.sourceType,
          format: match.format,
          imported: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  /**
   * Find a parser that can handle the given file.
   * Returns the parser's sourceType and format, or null if no match.
   */
  private findParser(filePath: string): { parser: ImportParser; sourceType: ImportSourceType; format: string } | null {
    for (const parser of this.parsers) {
      if (parser.canParse(filePath)) {
        return {
          parser,
          sourceType: parser.sourceType,
          format: parser.supportedFormats[0] ?? 'unknown',
        };
      }
    }
    return null;
  }
}
