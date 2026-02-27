/**
 * Goodreads Export Parser -- Parses goodreads_library_export.csv.
 *
 * Goodreads CSV export columns:
 *   Book Id, Title, Author, Author l-f, Additional Authors, ISBN, ISBN13,
 *   My Rating, Average Rating, Publisher, Binding, Number of Pages, Year Published,
 *   Original Publication Year, Date Read, Date Added, Bookshelves,
 *   Bookshelves with positions, Exclusive Shelf, My Review, Spoiler, Private Notes,
 *   Read Count, Owned Copies
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import { sanitizeCsvCell } from '../csv-sanitizer.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(bookId: string, title: string): string {
  const input = `${bookId}|${title}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `gr_${hash}`;
}

/**
 * Simple CSV parser that handles quoted fields with commas, escaped quotes,
 * and newlines inside quoted fields. No external dependencies.
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (char === '\n' || (char === '\r' && i + 1 < content.length && content[i + 1] === '\n')) {
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i += char === '\r' ? 2 : 1;
      continue;
    }

    if (char === '\r') {
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseGoodreadsDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Goodreads date format: "YYYY/MM/DD" or "YYYY-MM-DD" or "Mon DD, YYYY"
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Try YYYY/MM/DD
    const slashParts = dateStr.split('/');
    if (slashParts.length === 3) {
      const [year, month, day] = slashParts;
      const d = new Date(Date.UTC(
        parseInt(year!, 10),
        parseInt(month!, 10) - 1,
        parseInt(day!, 10),
      ));
      if (!isNaN(d.getTime())) return d;
    }

    return null;
  } catch {
    return null;
  }
}

function colIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase().trim());
    if (idx !== -1) return idx;
  }
  // Fallback: partial match
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().trim().includes(name.toLowerCase().trim()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function getField(row: string[], idx: number): string {
  const raw = idx >= 0 ? (row[idx] ?? '') : '';
  return sanitizeCsvCell(raw);
}

/** Goodreads-specific columns for identification. */
const GOODREADS_COLUMNS = ['book id', 'title', 'author', 'isbn', 'my rating', 'bookshelves'];

export class GoodreadsExportParser implements ImportParser {
  readonly sourceType = 'research' as const;
  readonly supportedFormats = ['goodreads_csv'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Check filename
    if (lowerPath.includes('goodreads') && lowerPath.endsWith('.csv')) {
      return true;
    }

    // Check header columns in data
    if (data) {
      const firstLine = (data.split('\n')[0] ?? '').toLowerCase();
      const matchCount = GOODREADS_COLUMNS.filter(col => firstLine.includes(col)).length;
      // Need at least 4 of 6 Goodreads-specific columns
      return matchCount >= 4;
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      rawData = safeReadFileSync(path);
      // Strip BOM if present
      if (rawData.charCodeAt(0) === 0xFEFF) rawData = rawData.slice(1);
    } catch (err) {
      return {
        format: 'goodreads_csv',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const rows = parseCSV(rawData);
    if (rows.length < 2) {
      return {
        format: 'goodreads_csv',
        items: [],
        errors: [{ message: 'CSV file has no data rows' }],
        totalFound: 0,
      };
    }

    const headers = rows[0]!;
    const dataRows = rows.slice(1);
    const totalFound = dataRows.length;

    const bookIdIdx = colIndex(headers, 'book id');
    const titleIdx = colIndex(headers, 'title');
    const authorIdx = colIndex(headers, 'author');
    const authorLfIdx = colIndex(headers, 'author l-f');
    const additionalAuthorsIdx = colIndex(headers, 'additional authors');
    const isbnIdx = colIndex(headers, 'isbn');
    const isbn13Idx = colIndex(headers, 'isbn13');
    const myRatingIdx = colIndex(headers, 'my rating');
    const avgRatingIdx = colIndex(headers, 'average rating');
    const publisherIdx = colIndex(headers, 'publisher');
    const bindingIdx = colIndex(headers, 'binding');
    const pagesIdx = colIndex(headers, 'number of pages');
    const yearPubIdx = colIndex(headers, 'year published');
    const origYearIdx = colIndex(headers, 'original publication year');
    const dateReadIdx = colIndex(headers, 'date read');
    const dateAddedIdx = colIndex(headers, 'date added');
    const bookshelvesIdx = colIndex(headers, 'bookshelves');
    const exclusiveShelfIdx = colIndex(headers, 'exclusive shelf');
    const reviewIdx = colIndex(headers, 'my review');
    const readCountIdx = colIndex(headers, 'read count');

    let items: ImportedItem[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const bookId = getField(row, bookIdIdx);
      const title = getField(row, titleIdx);

      if (!title) {
        errors.push({ message: 'Missing title', index: i + 1 });
        continue;
      }

      const dateRead = getField(row, dateReadIdx);
      const dateAdded = getField(row, dateAddedIdx);
      const timestamp = parseGoodreadsDate(dateRead) ?? parseGoodreadsDate(dateAdded);

      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      const author = getField(row, authorIdx);
      const additionalAuthors = getField(row, additionalAuthorsIdx);
      const isbn = getField(row, isbnIdx).replace(/[="]/g, '');
      const isbn13 = getField(row, isbn13Idx).replace(/[="]/g, '');
      const myRating = parseInt(getField(row, myRatingIdx), 10) || 0;
      const avgRating = parseFloat(getField(row, avgRatingIdx)) || 0;
      const publisher = getField(row, publisherIdx);
      const binding = getField(row, bindingIdx);
      const pages = parseInt(getField(row, pagesIdx), 10) || 0;
      const yearPublished = getField(row, yearPubIdx);
      const origYear = getField(row, origYearIdx);
      const bookshelves = getField(row, bookshelvesIdx)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const exclusiveShelf = getField(row, exclusiveShelfIdx);
      const review = getField(row, reviewIdx);
      const readCount = parseInt(getField(row, readCountIdx), 10) || 0;

      // Determine read status from exclusive shelf
      const readStatus = exclusiveShelf || (dateRead ? 'read' : 'to-read');

      items.push({
        id: deterministicId(bookId || title, title),
        sourceType: 'research',
        title: `${title}${author ? ` by ${author}` : ''}`,
        content: [
          `Book: ${title}`,
          author ? `Author: ${author}` : '',
          additionalAuthors ? `Additional Authors: ${additionalAuthors}` : '',
          myRating > 0 ? `My Rating: ${myRating}/5` : '',
          readStatus ? `Status: ${readStatus}` : '',
          bookshelves.length > 0 ? `Shelves: ${bookshelves.join(', ')}` : '',
          pages > 0 ? `Pages: ${pages}` : '',
          publisher ? `Publisher: ${publisher}` : '',
          review ? `Review: ${review}` : '',
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          source: 'goodreads',
          type: 'book',
          book_id: bookId || null,
          author: author || null,
          additional_authors: additionalAuthors || null,
          isbn: isbn || null,
          isbn13: isbn13 || null,
          my_rating: myRating,
          average_rating: avgRating,
          publisher: publisher || null,
          binding: binding || null,
          pages: pages || null,
          year_published: yearPublished || null,
          original_year: origYear || null,
          date_read: dateRead || null,
          date_added: dateAdded || null,
          bookshelves,
          exclusive_shelf: exclusiveShelf || null,
          read_status: readStatus,
          read_count: readCount,
          has_review: !!review,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'goodreads_csv', items, errors, totalFound };
  }
}
