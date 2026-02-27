/**
 * LinkedIn Export Parser — Parses LinkedIn data export CSV files.
 *
 * LinkedIn data exports contain CSV files:
 *   Connections.csv — First Name, Last Name, Email Address, Company, Position, Connected On
 *   messages.csv — CONVERSATION ID, CONVERSATION TITLE, FROM, SENDER PROFILE URL, DATE, SUBJECT, CONTENT
 *   Positions.csv — Company Name, Title, Started On, Finished On, Location, Description
 *   Profile.csv — First Name, Last Name, Headline, Summary, ...
 *   Skills.csv — Name
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import { sanitizeCsvCell } from '../csv-sanitizer.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(prefix: string, ...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `li_${prefix}_${hash}`;
}

/**
 * Simple CSV parser that handles quoted fields with commas and newlines.
 * Does NOT use external dependencies.
 */
export function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote (double-quote)
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        // End of quoted field
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

  // Final row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseLinkedInDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // LinkedIn dates: "15 Jan 2024", "2024-01-15", "Jan 2024"
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Try "DD Mon YYYY" manually
    const parts = dateStr.split(' ');
    if (parts.length === 3) {
      const parsed = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

type LinkedInFileType = 'connections' | 'messages' | 'positions' | 'profile' | 'skills';

function detectFileType(path: string, headers: string[]): LinkedInFileType | null {
  const lowerPath = path.toLowerCase();
  const headerStr = headers.map(h => h.toLowerCase()).join(',');

  if (lowerPath.includes('connection') || headerStr.includes('connected on'))
    return 'connections';
  if (lowerPath.includes('message') || headerStr.includes('conversation id'))
    return 'messages';
  if (lowerPath.includes('position') || (headerStr.includes('company name') && headerStr.includes('title')))
    return 'positions';
  if (lowerPath.includes('profile') || (headerStr.includes('first name') && headerStr.includes('headline')))
    return 'profile';
  if (lowerPath.includes('skill'))
    return 'skills';

  return null;
}

export class LinkedInExportParser implements ImportParser {
  readonly sourceType = 'social' as const;
  readonly supportedFormats = ['linkedin_csv'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();
    if (!lowerPath.endsWith('.csv')) return false;

    if (data) {
      const firstLine = data.split('\n')[0] ?? '';
      const lower = firstLine.toLowerCase();
      return lower.includes('connected on') ||
             lower.includes('conversation id') ||
             lower.includes('company name') ||
             lower.includes('headline');
    }

    return lowerPath.includes('connection') ||
           lowerPath.includes('message') ||
           lowerPath.includes('position') ||
           lowerPath.includes('linkedin');
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
        format: 'linkedin_csv',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const rows = parseCSV(rawData);
    if (rows.length < 2) {
      return {
        format: 'linkedin_csv',
        items: [],
        errors: [{ message: 'CSV file has no data rows' }],
        totalFound: 0,
      };
    }

    const headers = rows[0]!;
    const fileType = detectFileType(path, headers);

    if (!fileType) {
      return {
        format: 'linkedin_csv',
        items: [],
        errors: [{ message: 'Unrecognized LinkedIn CSV format' }],
        totalFound: 0,
      };
    }

    const dataRows = rows.slice(1);

    switch (fileType) {
      case 'connections': return this.parseConnections(headers, dataRows, options, errors);
      case 'messages': return this.parseMessages(headers, dataRows, options, errors);
      case 'positions': return this.parsePositions(headers, dataRows, options, errors);
      case 'profile': return this.parseProfile(headers, dataRows, errors);
      case 'skills': return this.parseSkills(headers, dataRows, errors);
    }
  }

  private colIndex(headers: string[], ...names: string[]): number {
    for (const name of names) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  private getField(row: string[], idx: number): string {
    const raw = idx >= 0 ? (row[idx] ?? '') : '';
    return sanitizeCsvCell(raw);
  }

  private parseConnections(
    headers: string[],
    rows: string[][],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    const totalFound = rows.length;
    const firstIdx = this.colIndex(headers, 'first name');
    const lastIdx = this.colIndex(headers, 'last name');
    const emailIdx = this.colIndex(headers, 'email');
    const companyIdx = this.colIndex(headers, 'company');
    const positionIdx = this.colIndex(headers, 'position');
    const connectedIdx = this.colIndex(headers, 'connected on');

    let items: ImportedItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const firstName = this.getField(row, firstIdx);
      const lastName = this.getField(row, lastIdx);
      const fullName = `${firstName} ${lastName}`.trim();

      if (!fullName) {
        errors.push({ message: 'Missing name fields', index: i + 1 });
        continue;
      }

      const email = this.getField(row, emailIdx);
      const company = this.getField(row, companyIdx);
      const position = this.getField(row, positionIdx);
      const connectedOn = this.getField(row, connectedIdx);
      const timestamp = parseLinkedInDate(connectedOn);

      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      items.push({
        id: deterministicId('cn', fullName, email || company),
        sourceType: 'social',
        title: fullName,
        content: [
          `LinkedIn connection: ${fullName}`,
          position ? `Position: ${position}` : '',
          company ? `Company: ${company}` : '',
          email ? `Email: ${email}` : '',
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          platform: 'linkedin',
          type: 'connection',
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          company: company || null,
          position: position || null,
          connected_on: connectedOn || null,
        },
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'linkedin_csv', items, errors, totalFound };
  }

  private parseMessages(
    headers: string[],
    rows: string[][],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    const totalFound = rows.length;
    const convIdIdx = this.colIndex(headers, 'conversation id');
    const fromIdx = this.colIndex(headers, 'from');
    const dateIdx = this.colIndex(headers, 'date');
    const subjectIdx = this.colIndex(headers, 'subject');
    const contentIdx = this.colIndex(headers, 'content');
    const titleIdx = this.colIndex(headers, 'conversation title');

    let items: ImportedItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const content = this.getField(row, contentIdx);
      if (!content) continue;

      const from = this.getField(row, fromIdx);
      const dateStr = this.getField(row, dateIdx);
      const timestamp = parseLinkedInDate(dateStr);

      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      const subject = this.getField(row, subjectIdx);
      const convId = this.getField(row, convIdIdx);
      const convTitle = this.getField(row, titleIdx);

      items.push({
        id: deterministicId('msg', convId, dateStr, from),
        sourceType: 'social',
        title: subject || `Message from ${from}`.slice(0, 80),
        content,
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          platform: 'linkedin',
          type: 'message',
          from: from || null,
          conversation_id: convId || null,
          conversation_title: convTitle || null,
          subject: subject || null,
        },
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'linkedin_csv', items, errors, totalFound };
  }

  private parsePositions(
    headers: string[],
    rows: string[][],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    const totalFound = rows.length;
    const companyIdx = this.colIndex(headers, 'company name');
    const titleIdx = this.colIndex(headers, 'title');
    const startIdx = this.colIndex(headers, 'started on');
    const endIdx = this.colIndex(headers, 'finished on');
    const locationIdx = this.colIndex(headers, 'location');
    const descIdx = this.colIndex(headers, 'description');

    let items: ImportedItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const company = this.getField(row, companyIdx);
      const title = this.getField(row, titleIdx);

      if (!company && !title) {
        errors.push({ message: 'Missing company and title', index: i + 1 });
        continue;
      }

      const startedOn = this.getField(row, startIdx);
      const finishedOn = this.getField(row, endIdx);
      const location = this.getField(row, locationIdx);
      const description = this.getField(row, descIdx);
      const timestamp = parseLinkedInDate(startedOn);

      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      items.push({
        id: deterministicId('pos', company, title, startedOn),
        sourceType: 'social',
        title: `${title}${company ? ` at ${company}` : ''}`,
        content: [
          `Position: ${title} at ${company}`,
          startedOn ? `Started: ${startedOn}` : '',
          finishedOn ? `Ended: ${finishedOn}` : '',
          location ? `Location: ${location}` : '',
          description || '',
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          platform: 'linkedin',
          type: 'position',
          company: company || null,
          job_title: title || null,
          started_on: startedOn || null,
          finished_on: finishedOn || null,
          location: location || null,
          is_current: !finishedOn,
        },
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'linkedin_csv', items, errors, totalFound };
  }

  private parseProfile(
    headers: string[],
    rows: string[][],
    errors: ParseError[],
  ): ImportResult {
    if (rows.length === 0) {
      return { format: 'linkedin_csv', items: [], errors, totalFound: 0 };
    }

    const row = rows[0]!;
    const firstIdx = this.colIndex(headers, 'first name');
    const lastIdx = this.colIndex(headers, 'last name');
    const headlineIdx = this.colIndex(headers, 'headline');
    const summaryIdx = this.colIndex(headers, 'summary');

    const firstName = this.getField(row, firstIdx);
    const lastName = this.getField(row, lastIdx);
    const fullName = `${firstName} ${lastName}`.trim();
    const headline = this.getField(row, headlineIdx);
    const summary = this.getField(row, summaryIdx);

    if (!fullName) {
      return { format: 'linkedin_csv', items: [], errors: [{ message: 'Missing profile name' }], totalFound: 0 };
    }

    const item: ImportedItem = {
      id: deterministicId('prf', fullName),
      sourceType: 'social',
      title: `LinkedIn Profile: ${fullName}`,
      content: [
        fullName,
        headline ? `Headline: ${headline}` : '',
        summary || '',
      ].filter(Boolean).join('\n'),
      timestamp: new Date().toISOString(),
      metadata: {
        platform: 'linkedin',
        type: 'profile',
        first_name: firstName,
        last_name: lastName,
        headline: headline || null,
      },
    };

    return { format: 'linkedin_csv', items: [item], errors, totalFound: 1 };
  }

  private parseSkills(
    headers: string[],
    rows: string[][],
    errors: ParseError[],
  ): ImportResult {
    const totalFound = rows.length;
    const nameIdx = this.colIndex(headers, 'name');
    if (nameIdx === -1) {
      return { format: 'linkedin_csv', items: [], errors: [{ message: 'Missing "Name" column' }], totalFound: 0 };
    }

    const skills = rows.map(r => this.getField(r, nameIdx)).filter(Boolean);

    if (skills.length === 0) {
      return { format: 'linkedin_csv', items: [], errors, totalFound: 0 };
    }

    // Bundle all skills into a single item for indexing
    const item: ImportedItem = {
      id: deterministicId('sk', skills.join(',')),
      sourceType: 'social',
      title: `LinkedIn Skills (${skills.length})`,
      content: `LinkedIn skills: ${skills.join(', ')}`,
      timestamp: new Date().toISOString(),
      metadata: {
        platform: 'linkedin',
        type: 'skills',
        skills,
        count: skills.length,
      },
    };

    return { format: 'linkedin_csv', items: [item], errors, totalFound };
  }
}
