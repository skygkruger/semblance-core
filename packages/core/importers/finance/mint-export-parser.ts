/**
 * Mint Export Parser -- Parses Mint transactions.csv export files.
 *
 * Mint exports transaction data as CSV with these columns:
 *   "Date","Description","Original Description","Amount","Transaction Type",
 *   "Category","Account Name","Labels","Notes"
 *
 * Amount is always positive; Transaction Type indicates debit/credit.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(date: string, description: string, amount: string): string {
  const input = `${date}|${description}|${amount}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `mnt_${hash}`;
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

function parseMintDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Mint date format: "M/DD/YYYY" or "MM/DD/YYYY"
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [month, day, year] = parts;
      const date = new Date(Date.UTC(
        parseInt(year!, 10),
        parseInt(month!, 10) - 1,
        parseInt(day!, 10),
      ));
      if (!isNaN(date.getTime())) return date;
    }
    // Fallback
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    return null;
  } catch {
    return null;
  }
}

function colIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    if (idx !== -1) return idx;
  }
  // Fallback: partial match
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function getField(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? '') : '';
}

/** Mint-specific required columns for identification. */
const MINT_REQUIRED_COLUMNS = ['date', 'description', 'amount', 'transaction type', 'category', 'account name'];

export class MintExportParser implements ImportParser {
  readonly sourceType = 'finance' as const;
  readonly supportedFormats = ['mint_csv'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Check filename
    if (lowerPath.endsWith('transactions.csv') && (lowerPath.includes('mint') || data)) {
      if (!data) return true;
    }

    // Check header columns in data
    if (data) {
      const firstLine = (data.split('\n')[0] ?? '').toLowerCase();
      const matchCount = MINT_REQUIRED_COLUMNS.filter(col => firstLine.includes(col)).length;
      // Need at least 5 of 6 Mint columns to be confident
      return matchCount >= 5;
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      const { readFileSync } = await import('node:fs');
      rawData = readFileSync(path, 'utf-8');
      // Strip BOM if present
      if (rawData.charCodeAt(0) === 0xFEFF) rawData = rawData.slice(1);
    } catch (err) {
      return {
        format: 'mint_csv',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const rows = parseCSV(rawData);
    if (rows.length < 2) {
      return {
        format: 'mint_csv',
        items: [],
        errors: [{ message: 'CSV file has no data rows' }],
        totalFound: 0,
      };
    }

    const headers = rows[0]!;
    const dataRows = rows.slice(1);
    const totalFound = dataRows.length;

    const dateIdx = colIndex(headers, 'date');
    const descIdx = colIndex(headers, 'description');
    const origDescIdx = colIndex(headers, 'original description');
    const amountIdx = colIndex(headers, 'amount');
    const txTypeIdx = colIndex(headers, 'transaction type');
    const categoryIdx = colIndex(headers, 'category');
    const accountIdx = colIndex(headers, 'account name');
    const labelsIdx = colIndex(headers, 'labels');
    const notesIdx = colIndex(headers, 'notes');

    let items: ImportedItem[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const dateStr = getField(row, dateIdx);
      const description = getField(row, descIdx);

      if (!dateStr && !description) {
        errors.push({ message: 'Missing date and description', index: i + 1 });
        continue;
      }

      const timestamp = parseMintDate(dateStr);
      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      const amountStr = getField(row, amountIdx);
      const rawAmount = parseFloat(amountStr.replace(/[$,]/g, '')) || 0;
      const txType = getField(row, txTypeIdx).toLowerCase();
      // In Mint, Amount is always positive. Transaction Type = "debit" means money out.
      const amount = txType === 'debit' ? -rawAmount : rawAmount;
      const originalDesc = getField(row, origDescIdx);
      const category = getField(row, categoryIdx);
      const account = getField(row, accountIdx);
      const labels = getField(row, labelsIdx);
      const notes = getField(row, notesIdx);

      items.push({
        id: deterministicId(dateStr, description || originalDesc, amount.toFixed(2)),
        sourceType: 'finance',
        title: `${description || originalDesc || 'Unknown'}${amount >= 0 ? ` +$${amount.toFixed(2)}` : ` -$${Math.abs(amount).toFixed(2)}`}`,
        content: [
          `Transaction: ${description || originalDesc || 'Unknown'}`,
          `Amount: ${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toFixed(2)}`,
          category ? `Category: ${category}` : '',
          account ? `Account: ${account}` : '',
          notes ? `Notes: ${notes}` : '',
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          source: 'mint',
          type: 'transaction',
          description: description || null,
          original_description: originalDesc || null,
          raw_amount: rawAmount,
          amount,
          transaction_type: txType || null,
          category: category || null,
          account_name: account || null,
          labels: labels || null,
          notes: notes || null,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'mint_csv', items, errors, totalFound };
  }
}
