/**
 * Obsidian Notes Parser — Reads a folder of .md files recursively.
 *
 * Preserves:
 * - Filename as title
 * - Full markdown as content
 * - YAML frontmatter as metadata
 * - #tags and [[wiki-links]] extracted into metadata
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(filePath: string): string {
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 12);
  return `obs_${hash}`;
}

function extractTags(content: string): string[] {
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]!);
  }
  return Array.from(tags);
}

function extractWikiLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    links.add(match[1]!.trim());
  }
  return Array.from(links);
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = fmRegex.exec(content);
  if (!match) return { frontmatter: {}, body: content };

  const fmBlock = match[1]!;
  const body = content.slice(match[0].length);
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML key: value parser (no nested structures)
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

export class ObsidianParser implements ImportParser {
  readonly sourceType = 'notes' as const;
  readonly supportedFormats = ['obsidian_md'];

  canParse(path: string): boolean {
    try {
      const { statSync, readdirSync } = require('node:fs');
      const stat = statSync(path);
      if (!stat.isDirectory()) return false;

      // Check if the directory contains .md files
      const files = readdirSync(path) as string[];
      return files.some((f: string) => f.endsWith('.md'));
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, basename, extname } = await import('node:path');

    // Recursively find all .md files
    const mdFiles: string[] = [];
    const walk = (dir: string): void => {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              // Skip hidden directories
              if (!entry.startsWith('.')) walk(fullPath);
            } else if (extname(entry).toLowerCase() === '.md') {
              mdFiles.push(fullPath);
            }
          } catch {
            errors.push({ message: `Cannot stat ${fullPath}` });
          }
        }
      } catch {
        errors.push({ message: `Cannot read directory ${dir}` });
      }
    };

    walk(path);

    const totalFound = mdFiles.length;
    let items: ImportedItem[] = [];

    for (const filePath of mdFiles) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(raw);
        const title = basename(filePath, '.md');
        const tags = extractTags(raw);
        const wikiLinks = extractWikiLinks(raw);

        // Use file modified time as timestamp
        const stat = statSync(filePath);
        const timestamp = stat.mtime.toISOString();

        // Apply since filter
        if (options?.since && stat.mtime < options.since) {
          continue;
        }

        items.push({
          id: deterministicId(filePath),
          sourceType: 'notes',
          title,
          content: body,
          timestamp,
          metadata: {
            filePath,
            tags,
            wikiLinks,
            frontmatter,
            format: 'obsidian_md',
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
      format: 'obsidian_md',
      items,
      errors,
      totalFound,
    };
  }
}
