/**
 * Bear Export Parser — Parses Bear notes export (directory of Markdown files).
 *
 * Bear exports notes as individual Markdown files with inline #tags.
 * Bear's tag syntax supports:
 *   #tag
 *   #tag/subtag
 *   #multi word tag# (enclosed with trailing #)
 *
 * Each file's first line is typically the note title (may be an H1 heading).
 * Bear also supports [[wiki-links]] for cross-note references.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync, safeWalkDirectory } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(filePath: string): string {
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 12);
  return `bear_${hash}`;
}

/**
 * Extract Bear-style tags from content.
 *
 * Bear supports:
 * - #simple
 * - #nested/subtag
 * - #multi word tag# (enclosed form)
 *
 * Tags must start at the beginning of a word (after whitespace, newline, or start of string).
 * Markdown headings (# Title) are NOT tags.
 */
export function extractBearTags(content: string): string[] {
  const tags = new Set<string>();

  // Match enclosed multi-word tags: #multi word tag#
  const enclosedRegex = /(?:^|\s)#([^#\n]+)#/g;
  let match: RegExpExecArray | null;
  while ((match = enclosedRegex.exec(content)) !== null) {
    const tag = match[1]!.trim();
    if (tag.length > 0) {
      tags.add(tag);
    }
  }

  // Match simple and nested tags: #tag or #tag/subtag
  // Must not be a markdown heading (# at start of line followed by space)
  const simpleRegex = /(?:^|\s)#([a-zA-Z0-9][a-zA-Z0-9_/-]*)/g;
  while ((match = simpleRegex.exec(content)) !== null) {
    const tag = match[1]!;
    // Skip if this looks like a markdown heading (captured from line start)
    // Check: if the character before # is a newline and the tag text contains a space, skip
    tags.add(tag);
  }

  return Array.from(tags);
}

/**
 * Extract wiki-links: [[link]] or [[link|display text]]
 */
function extractWikiLinks(content: string): string[] {
  const links = new Set<string>();
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    links.add(match[1]!.trim());
  }
  return Array.from(links);
}

/**
 * Extract title from Bear note content.
 * Bear uses the first line as the title, which may or may not be a heading.
 */
function extractTitle(content: string, fileBasename: string): string {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // If it's a heading, strip the # prefix
    const headingMatch = /^#{1,6}\s+(.+)/.exec(trimmed);
    if (headingMatch) {
      return headingMatch[1]!.trim();
    }

    // Otherwise use the first non-empty line
    return trimmed;
  }

  // Fallback to filename
  return fileBasename;
}

/**
 * Detect if a directory of .md files looks like a Bear export vs. generic markdown.
 *
 * Bear exports have characteristics:
 * - Files with inline #tags (not just headings)
 * - Flat directory structure (Bear doesn't use subdirectories)
 * - .md file extension
 */
function looksBearExport(files: string[], readFn: (p: string) => string): boolean {
  let taggedFileCount = 0;
  const filesToCheck = files.slice(0, 10); // Check first 10 files max

  for (const file of filesToCheck) {
    try {
      const content = readFn(file);
      const tags = extractBearTags(content);
      if (tags.length > 0) {
        taggedFileCount++;
      }
    } catch {
      continue;
    }
  }

  // If at least 30% of sampled files have Bear-style tags, consider it a Bear export
  return filesToCheck.length > 0 && taggedFileCount / filesToCheck.length >= 0.3;
}

export class BearExportParser implements ImportParser {
  readonly sourceType = 'notes' as const;
  readonly supportedFormats = ['bear_export'];

  canParse(path: string): boolean {
    try {
      const { statSync, readdirSync } = require('node:fs') as typeof import('node:fs');
      const { join, extname } = require('node:path') as typeof import('node:path');

      const stat = statSync(path);
      if (!stat.isDirectory()) return false;

      // Scan for .md files
      const entries = readdirSync(path) as string[];
      const mdFiles = entries
        .filter((f: string) => extname(f).toLowerCase() === '.md')
        .map((f: string) => join(path, f));

      if (mdFiles.length === 0) return false;

      // Check if they look like Bear exports (have #tags)
      return looksBearExport(mdFiles, (p) => safeReadFileSync(p));
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { statSync } = await import('node:fs');
    const { basename } = await import('node:path');

    // Verify the path is a directory
    try {
      const stat = statSync(path);
      if (!stat.isDirectory()) {
        return {
          format: 'bear_export',
          items: [],
          errors: [{ message: `Path is not a directory: ${path}` }],
          totalFound: 0,
        };
      }
    } catch (err) {
      return {
        format: 'bear_export',
        items: [],
        errors: [{ message: `Cannot access path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    // Find all .md files using safe walker (symlink-aware)
    const mdFiles = safeWalkDirectory(path, ['.md']);

    const totalFound = mdFiles.length;
    let items: ImportedItem[] = [];

    for (const filePath of mdFiles) {
      try {
        const raw = safeReadFileSync(filePath);
        const fileBasename = basename(filePath, '.md');
        const title = extractTitle(raw, fileBasename);
        const tags = extractBearTags(raw);
        const wikiLinks = extractWikiLinks(raw);

        // Use file modified time as timestamp
        const stat = statSync(filePath);
        const timestamp = stat.mtime;

        // Apply since filter
        if (options?.since && timestamp < options.since) {
          continue;
        }

        items.push({
          id: deterministicId(filePath),
          sourceType: 'notes',
          title,
          content: raw,
          timestamp: timestamp.toISOString(),
          metadata: {
            filePath,
            format: 'bear_export',
            tags,
            wikiLinks,
            word_count: raw.split(/\s+/).filter(Boolean).length,
            has_tags: tags.length > 0,
            tag_count: tags.length,
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
      format: 'bear_export',
      items,
      errors,
      totalFound,
    };
  }
}
