/**
 * Notion Export Parser — Parses Notion workspace exports (directory of Markdown/HTML files).
 *
 * Notion exports contain markdown (.md) and/or HTML files, often with UUID-pattern
 * suffixes in their filenames (e.g., "Meeting Notes 7a3b2c1d4e5f.md").
 *
 * Supports:
 * - Extracted directory mode: recursively scans for .md and .html files
 * - ZIP mode is documented but requires prior extraction — canParse returns false for .zip
 *   without data to inspect, since we cannot add zip-extraction dependencies.
 *
 * UUID pattern in Notion filenames: 32 hex chars appended to the title.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync, safeWalkDirectory } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

// Notion appends a 32-hex-char UUID to filenames: "Title abc123def456789012345678901234.md"
const NOTION_UUID_PATTERN = /\s+[0-9a-f]{32}$/;

// Match the UUID suffix on filenames (before extension)
const NOTION_FILENAME_UUID = /^(.+?)\s+[0-9a-f]{32}$/;

function deterministicId(filePath: string): string {
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 12);
  return `ntn_exp_${hash}`;
}

/**
 * Extract title from Notion markdown content.
 * Priority: first H1 heading > filename without UUID.
 */
function extractTitle(content: string, fileBasename: string): string {
  // Try first H1
  const h1Match = /^#\s+(.+)/m.exec(content);
  if (h1Match) {
    return h1Match[1]!.trim();
  }

  // Strip UUID suffix from filename
  const nameMatch = NOTION_FILENAME_UUID.exec(fileBasename);
  if (nameMatch) {
    return nameMatch[1]!.trim();
  }

  return fileBasename;
}

/**
 * Extract inline database properties from Notion markdown.
 * Notion exports sometimes include property tables at the top of pages.
 */
function extractProperties(content: string): Record<string, string> {
  const props: Record<string, string> = {};
  // Notion property format in exports: "Property: Value" lines at the top before first heading
  const headerSection = content.split(/^#/m)[0] ?? '';
  const propRegex = /^([A-Z][A-Za-z\s]+):\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(headerSection)) !== null) {
    props[match[1]!.trim()] = match[2]!.trim();
  }
  return props;
}

/**
 * Strip HTML tags for basic content extraction from .html Notion exports.
 */
function stripHtml(html: string): string {
  // Remove script and style blocks
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Replace block elements with newlines
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  // Remove remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * Check if a directory looks like a Notion export by inspecting filenames
 * for UUID patterns characteristic of Notion exports.
 */
function hasNotionUuidFiles(files: string[]): boolean {
  let uuidCount = 0;
  for (const f of files) {
    // Check the filename without extension for UUID pattern
    const nameWithoutExt = f.replace(/\.(md|html)$/i, '');
    if (NOTION_UUID_PATTERN.test(nameWithoutExt)) {
      uuidCount++;
    }
    // If we find at least 2 UUID-pattern files, likely Notion
    if (uuidCount >= 2) return true;
  }
  // Also accept if just 1 file has UUID pattern (small exports)
  return uuidCount >= 1;
}

export class NotionExportParser implements ImportParser {
  readonly sourceType = 'notes' as const;
  readonly supportedFormats = ['notion_export'];

  canParse(path: string, data?: string): boolean {
    try {
      const { statSync, readdirSync } = require('node:fs') as typeof import('node:fs');
      const stat = statSync(path);

      if (stat.isDirectory()) {
        // Scan for .md or .html files with Notion UUID patterns
        const entries = readdirSync(path) as string[];
        const contentFiles = entries.filter(
          (f: string) => f.endsWith('.md') || f.endsWith('.html'),
        );

        if (contentFiles.length === 0) return false;
        return hasNotionUuidFiles(contentFiles);
      }

      // For .zip files, we can't inspect without extraction
      // but if data is provided and it contains Notion-like filenames, accept it
      if (data && path.endsWith('.zip')) {
        return data.includes('.md') && NOTION_UUID_PATTERN.test(data);
      }

      return false;
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { statSync } = await import('node:fs');
    const { basename, extname } = await import('node:path');

    // Verify the path is a directory
    try {
      const stat = statSync(path);
      if (!stat.isDirectory()) {
        return {
          format: 'notion_export',
          items: [],
          errors: [{ message: `Path is not a directory. For ZIP exports, extract first: ${path}` }],
          totalFound: 0,
        };
      }
    } catch (err) {
      return {
        format: 'notion_export',
        items: [],
        errors: [{ message: `Cannot access path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    // Recursively find all .md and .html files using safe walker (symlink-aware)
    const contentFiles = safeWalkDirectory(path, ['.md', '.html']);

    const totalFound = contentFiles.length;
    let items: ImportedItem[] = [];

    for (const filePath of contentFiles) {
      try {
        const raw = safeReadFileSync(filePath);
        const ext = extname(filePath).toLowerCase();
        const fileBasename = basename(filePath, ext);

        // Get content — strip HTML if .html file
        const content = ext === '.html' ? stripHtml(raw) : raw;
        const title = extractTitle(content, fileBasename);
        const properties = extractProperties(content);

        // Use file modified time as timestamp
        const stat = statSync(filePath);
        const timestamp = stat.mtime;

        // Apply since filter
        if (options?.since && timestamp < options.since) {
          continue;
        }

        // Check if filename has Notion UUID
        const uuidMatch = NOTION_FILENAME_UUID.exec(fileBasename);
        const notionPageId = uuidMatch
          ? fileBasename.slice(fileBasename.length - 32)
          : null;

        items.push({
          id: deterministicId(filePath),
          sourceType: 'notes',
          title,
          content,
          timestamp: timestamp.toISOString(),
          metadata: {
            filePath,
            format: 'notion_export',
            original_format: ext === '.html' ? 'html' : 'markdown',
            notion_page_id: notionPageId,
            properties: Object.keys(properties).length > 0 ? properties : null,
            filename: basename(filePath),
          },
        });
      } catch (err) {
        errors.push({ message: `Failed to parse ${filePath}: ${(err as Error).message}` });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'notion_export',
      items,
      errors,
      totalFound,
    };
  }
}
