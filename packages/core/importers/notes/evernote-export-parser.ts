/**
 * Evernote Export Parser -- Parses ENEX XML (Evernote export format).
 *
 * Evernote exports notes as .enex files containing XML with <note> elements:
 *   <en-export>
 *     <note>
 *       <title>Note Title</title>
 *       <content><![CDATA[<en-note>HTML content</en-note>]]></content>
 *       <created>20231015T120000Z</created>
 *       <updated>20231016T090000Z</updated>
 *       <tag>tag1</tag>
 *       <tag>tag2</tag>
 *     </note>
 *   </en-export>
 *
 * The parser uses streaming line-by-line XML extraction (not DOM) to handle
 * large exports without loading entire DOM trees.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(title: string, created: string): string {
  const input = `${title}|${created}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `en_${hash}`;
}

/**
 * Strip HTML tags from content, decode basic HTML entities,
 * and collapse whitespace to produce plain text.
 */
function stripHtml(html: string): string {
  // Remove CDATA wrapper if present
  let text = html.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
  // Remove <en-note> wrapper
  text = text.replace(/<\/?en-note[^>]*>/gi, '');
  // Replace <br>, <br/>, <br />, </p>, </div>, </li> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(parseInt(code, 10)));
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Parse Evernote's timestamp format: 20231015T120000Z
 * Also handles ISO 8601 format as fallback.
 */
function parseEvernoteDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Evernote format: YYYYMMDDTHHmmssZ
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match;
      return new Date(Date.UTC(
        parseInt(year!, 10),
        parseInt(month!, 10) - 1,
        parseInt(day!, 10),
        parseInt(hours!, 10),
        parseInt(minutes!, 10),
        parseInt(seconds!, 10),
      ));
    }
    // Fallback to ISO 8601
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    return null;
  } catch {
    return null;
  }
}

interface RawNote {
  title: string;
  content: string;
  created: string;
  updated: string;
  tags: string[];
}

/**
 * Stream-parse ENEX XML to extract notes without building a DOM tree.
 * Uses a state machine that tracks which element we are inside and
 * accumulates text content accordingly.
 */
function extractNotes(xmlContent: string): { notes: RawNote[]; errors: ParseError[] } {
  const notes: RawNote[] = [];
  const errors: ParseError[] = [];

  let inNote = false;
  let inContent = false;
  let currentTag = '';
  let currentNote: RawNote = { title: '', content: '', created: '', updated: '', tags: [] };
  let accumulator = '';
  let cdataDepth = 0;
  let noteIndex = 0;

  const lines = xmlContent.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;

    // Check for note open/close at the line level first
    if (!inNote && line.includes('<note')) {
      inNote = true;
      currentNote = { title: '', content: '', created: '', updated: '', tags: [] };
      accumulator = '';
      currentTag = '';
      cdataDepth = 0;
      inContent = false;
    }

    if (!inNote) continue;

    // Process content within <content> which can span multiple lines and contain CDATA
    if (inContent) {
      if (line.includes('</content>')) {
        // End of content element
        const endIdx = line.indexOf('</content>');
        accumulator += line.substring(0, endIdx);
        currentNote.content = accumulator;
        accumulator = '';
        inContent = false;
        currentTag = '';
        // Process rest of line after </content>
        const rest = line.substring(endIdx + '</content>'.length);
        if (rest.includes('</note>')) {
          notes.push({ ...currentNote, tags: [...currentNote.tags] });
          inNote = false;
          noteIndex++;
        }
        continue;
      }
      accumulator += line + '\n';
      continue;
    }

    // Detect opening of specific elements (single-line or start-of-multiline)
    if (line.includes('<content>') || line.includes('<content ')) {
      inContent = true;
      const startTag = line.indexOf('<content');
      const afterTag = line.indexOf('>', startTag) + 1;
      if (afterTag > 0) {
        if (line.includes('</content>')) {
          // Single-line content
          const endIdx = line.indexOf('</content>');
          currentNote.content = line.substring(afterTag, endIdx);
          inContent = false;
        } else {
          accumulator = line.substring(afterTag) + '\n';
        }
      }
      continue;
    }

    // Simple single-line element extraction
    const titleMatch = line.match(/<title>(.*?)<\/title>/);
    if (titleMatch) {
      currentNote.title = titleMatch[1]!;
      continue;
    }

    const createdMatch = line.match(/<created>(.*?)<\/created>/);
    if (createdMatch) {
      currentNote.created = createdMatch[1]!;
      continue;
    }

    const updatedMatch = line.match(/<updated>(.*?)<\/updated>/);
    if (updatedMatch) {
      currentNote.updated = updatedMatch[1]!;
      continue;
    }

    const tagMatch = line.match(/<tag>(.*?)<\/tag>/);
    if (tagMatch) {
      currentNote.tags.push(tagMatch[1]!);
      continue;
    }

    // Note close
    if (line.includes('</note>')) {
      if (inNote) {
        if (!currentNote.title && !currentNote.content) {
          errors.push({ message: 'Empty note (no title or content)', index: noteIndex });
        } else {
          notes.push({ ...currentNote, tags: [...currentNote.tags] });
        }
        inNote = false;
        noteIndex++;
      }
    }
  }

  // Handle unclosed note at end of file
  if (inNote && (currentNote.title || currentNote.content)) {
    errors.push({ message: 'Unclosed note element at end of file', index: noteIndex });
    notes.push({ ...currentNote, tags: [...currentNote.tags] });
  }

  return { notes, errors };
}

export class EvernoteExportParser implements ImportParser {
  readonly sourceType = 'notes' as const;
  readonly supportedFormats = ['evernote_enex'];

  canParse(path: string, data?: string): boolean {
    if (path.toLowerCase().endsWith('.enex')) return true;

    if (data) {
      return data.includes('<en-export') || data.includes('<!DOCTYPE en-export');
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      const { readFileSync } = await import('node:fs');
      rawData = readFileSync(path, 'utf-8');
    } catch (err) {
      return {
        format: 'evernote_enex',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    // Validate it looks like ENEX
    if (!rawData.includes('<en-export') && !rawData.includes('<!DOCTYPE en-export')) {
      return {
        format: 'evernote_enex',
        items: [],
        errors: [{ message: 'Not a valid ENEX file (missing <en-export> root element)' }],
        totalFound: 0,
      };
    }

    const { notes, errors: extractErrors } = extractNotes(rawData);
    errors.push(...extractErrors);

    const totalFound = notes.length;
    let items: ImportedItem[] = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]!;
      const created = parseEvernoteDate(note.created);
      const updated = parseEvernoteDate(note.updated);

      if (options?.since) {
        const relevantDate = updated ?? created;
        if (relevantDate && relevantDate < options.since) {
          continue;
        }
      }

      const plainContent = stripHtml(note.content);

      items.push({
        id: deterministicId(note.title, note.created),
        sourceType: 'notes',
        title: note.title || 'Untitled Note',
        content: plainContent || note.title || '',
        timestamp: (updated ?? created ?? new Date()).toISOString(),
        metadata: {
          source: 'evernote',
          created: note.created || null,
          updated: note.updated || null,
          tags: note.tags,
          tag_count: note.tags.length,
          content_length: plainContent.length,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'evernote_enex',
      items,
      errors,
      totalFound,
    };
  }
}
