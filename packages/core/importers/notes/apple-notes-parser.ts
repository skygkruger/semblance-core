/**
 * Apple Notes Parser — Parses HTML export files from Apple Notes.
 *
 * Apple Notes can export as HTML via File > Export as HTML.
 * Each note becomes an HTML file with title in <title> or <h1> tags.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(titleAndContent: string): string {
  const hash = createHash('sha256').update(titleAndContent).digest('hex').slice(0, 12);
  return `anote_${hash}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html: string): string | null {
  // Try <title> first
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]?.trim()) return titleMatch[1].trim();

  // Try <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) return stripHtml(h1Match[1]).trim();

  return null;
}

export class AppleNotesParser implements ImportParser {
  readonly sourceType = 'notes' as const;
  readonly supportedFormats = ['apple_notes_html'];

  canParse(path: string, data?: string): boolean {
    // Check for HTML files
    if (path.endsWith('.html') || path.endsWith('.htm')) {
      if (data) {
        // Check if it looks like an Apple Notes export
        return data.includes('<html') && (
          data.includes('Apple') ||
          data.includes('<title>') ||
          data.includes('<h1>')
        );
      }
      return true;
    }

    // Check for directory containing HTML files
    try {
      const { statSync, readdirSync } = require('node:fs');
      const stat = statSync(path);
      if (stat.isDirectory()) {
        const files = readdirSync(path) as string[];
        return files.some((f: string) => f.endsWith('.html') || f.endsWith('.htm'));
      }
    } catch {
      // Not a directory
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { readFileSync, statSync, readdirSync } = await import('node:fs');
    const { join, basename, extname } = await import('node:path');

    // Gather HTML files
    const htmlFiles: string[] = [];
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        const entries = readdirSync(path);
        for (const entry of entries) {
          if (entry.endsWith('.html') || entry.endsWith('.htm')) {
            htmlFiles.push(join(path, entry));
          }
        }
      } else {
        htmlFiles.push(path);
      }
    } catch (err) {
      return {
        format: 'apple_notes_html',
        items: [],
        errors: [{ message: `Failed to read path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const totalFound = htmlFiles.length;
    let items: ImportedItem[] = [];

    for (const filePath of htmlFiles) {
      try {
        const html = readFileSync(filePath, 'utf-8');
        const title = extractTitle(html) || basename(filePath, extname(filePath));
        const content = stripHtml(html);

        if (!content) {
          errors.push({ message: `Empty content in ${filePath}` });
          continue;
        }

        const stat = statSync(filePath);
        const timestamp = stat.mtime.toISOString();

        if (options?.since && stat.mtime < options.since) {
          continue;
        }

        items.push({
          id: deterministicId(title + content.slice(0, 200)),
          sourceType: 'notes',
          title,
          content,
          timestamp,
          metadata: {
            filePath,
            format: 'apple_notes_html',
            characterCount: content.length,
          },
        });
      } catch (err) {
        errors.push({ message: `Failed to parse ${filePath}: ${(err as Error).message}` });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'apple_notes_html',
      items,
      errors,
      totalFound,
    };
  }
}
