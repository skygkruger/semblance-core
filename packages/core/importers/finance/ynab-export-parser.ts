/**
 * YNAB Export Parser -- Parses You Need A Budget export files.
 *
 * YNAB exports as a directory (or extracted ZIP) containing CSV files:
 *   - Register.csv or <BudgetName>_Register.csv -- Transaction register
 *   - Budget.csv or <BudgetName>_Budget.csv -- Budget categories
 *
 * Register.csv columns (typical):
 *   "Account","Flag","Date","Payee","Category Group/Category","Category Group",
 *   "Category","Memo","Outflow","Inflow","Cleared"
 *
 * The parser focuses on transaction register data.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(date: string, payee: string, amount: string): string {
  const input = `${date}|${payee}|${amount}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `ynb_${hash}`;
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

function parseYnabDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // YNAB date formats: "MM/DD/YYYY", "YYYY-MM-DD", "DD/MM/YYYY"
    // Try YYYY-MM-DD first
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(dateStr + 'T00:00:00Z');
      if (!isNaN(date.getTime())) return date;
    }
    // Try MM/DD/YYYY
    const slashParts = dateStr.split('/');
    if (slashParts.length === 3) {
      const [month, day, year] = slashParts;
      const date = new Date(Date.UTC(
        parseInt(year!, 10),
        parseInt(month!, 10) - 1,
        parseInt(day!, 10),
      ));
      if (!isNaN(date.getTime())) return date;
    }
    // Generic fallback
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    return null;
  } catch {
    return null;
  }
}

function parseCurrency(value: string): number {
  if (!value) return 0;
  // Remove currency symbols, commas, spaces
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function colIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function getField(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? '') : '';
}

/**
 * Detect whether a file path looks like a YNAB register CSV.
 */
function isYnabRegisterPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('register') && lower.endsWith('.csv');
}

/**
 * Detect whether a file path looks like a YNAB budget CSV.
 */
function isYnabBudgetPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('budget') && lower.endsWith('.csv');
}

export class YnabExportParser implements ImportParser {
  readonly sourceType = 'finance' as const;
  readonly supportedFormats = ['ynab_export'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Check for YNAB-specific filenames
    if (isYnabRegisterPath(lowerPath) || isYnabBudgetPath(lowerPath)) {
      return true;
    }

    // If data is provided, check for YNAB-specific column headers
    if (data) {
      const firstLine = data.split('\n')[0] ?? '';
      const lower = firstLine.toLowerCase();
      return (lower.includes('payee') && (lower.includes('outflow') || lower.includes('inflow'))) ||
             (lower.includes('category') && lower.includes('budgeted') && lower.includes('activity'));
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
        format: 'ynab_export',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const rows = parseCSV(rawData);
    if (rows.length < 2) {
      return {
        format: 'ynab_export',
        items: [],
        errors: [{ message: 'CSV file has no data rows' }],
        totalFound: 0,
      };
    }

    const headers = rows[0]!;
    const dataRows = rows.slice(1);

    // Determine if this is a register or budget file
    const lowerHeaders = headers.map(h => h.toLowerCase()).join(',');
    if (lowerHeaders.includes('payee') || lowerHeaders.includes('outflow') || lowerHeaders.includes('inflow')) {
      return this.parseRegister(headers, dataRows, options, errors);
    } else if (lowerHeaders.includes('budgeted') && lowerHeaders.includes('activity')) {
      return this.parseBudget(headers, dataRows, options, errors);
    }

    return {
      format: 'ynab_export',
      items: [],
      errors: [{ message: 'Unrecognized YNAB CSV format' }],
      totalFound: 0,
    };
  }

  private parseRegister(
    headers: string[],
    rows: string[][],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    const totalFound = rows.length;
    const accountIdx = colIndex(headers, 'account');
    const dateIdx = colIndex(headers, 'date');
    const payeeIdx = colIndex(headers, 'payee');
    const categoryIdx = colIndex(headers, 'category group/category', 'category');
    const memoIdx = colIndex(headers, 'memo');
    const outflowIdx = colIndex(headers, 'outflow');
    const inflowIdx = colIndex(headers, 'inflow');
    const clearedIdx = colIndex(headers, 'cleared');
    const flagIdx = colIndex(headers, 'flag');

    let items: ImportedItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const dateStr = getField(row, dateIdx);
      const payee = getField(row, payeeIdx);

      if (!dateStr && !payee) {
        errors.push({ message: 'Missing date and payee', index: i + 1 });
        continue;
      }

      const timestamp = parseYnabDate(dateStr);
      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      const outflow = parseCurrency(getField(row, outflowIdx));
      const inflow = parseCurrency(getField(row, inflowIdx));
      const amount = inflow - outflow;
      const account = getField(row, accountIdx);
      const category = getField(row, categoryIdx);
      const memo = getField(row, memoIdx);
      const cleared = getField(row, clearedIdx);
      const flag = getField(row, flagIdx);

      items.push({
        id: deterministicId(dateStr, payee, amount.toFixed(2)),
        sourceType: 'finance',
        title: `${payee || 'Unknown'}${amount >= 0 ? ` +$${amount.toFixed(2)}` : ` -$${Math.abs(amount).toFixed(2)}`}`,
        content: [
          `Transaction: ${payee || 'Unknown'}`,
          `Amount: ${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toFixed(2)}`,
          account ? `Account: ${account}` : '',
          category ? `Category: ${category}` : '',
          memo ? `Memo: ${memo}` : '',
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          source: 'ynab',
          type: 'transaction',
          account: account || null,
          payee: payee || null,
          category: category || null,
          memo: memo || null,
          outflow,
          inflow,
          amount,
          cleared: cleared || null,
          flag: flag || null,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'ynab_export', items, errors, totalFound };
  }

  private parseBudget(
    headers: string[],
    rows: string[][],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    const totalFound = rows.length;
    const monthIdx = colIndex(headers, 'month');
    const categoryGroupIdx = colIndex(headers, 'category group');
    const categoryIdx = colIndex(headers, 'category');
    const budgetedIdx = colIndex(headers, 'budgeted');
    const activityIdx = colIndex(headers, 'activity');
    const availableIdx = colIndex(headers, 'available');

    let items: ImportedItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const month = getField(row, monthIdx);
      const categoryGroup = getField(row, categoryGroupIdx);
      const category = getField(row, categoryIdx);

      if (!category) {
        errors.push({ message: 'Missing category', index: i + 1 });
        continue;
      }

      const timestamp = parseYnabDate(month);
      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      const budgeted = parseCurrency(getField(row, budgetedIdx));
      const activity = parseCurrency(getField(row, activityIdx));
      const available = parseCurrency(getField(row, availableIdx));

      items.push({
        id: deterministicId(month, categoryGroup + '/' + category, budgeted.toFixed(2)),
        sourceType: 'finance',
        title: `Budget: ${categoryGroup ? categoryGroup + ' / ' : ''}${category}`,
        content: [
          `Budget category: ${categoryGroup ? categoryGroup + ' / ' : ''}${category}`,
          `Month: ${month || 'Unknown'}`,
          `Budgeted: $${budgeted.toFixed(2)}`,
          `Activity: $${activity.toFixed(2)}`,
          `Available: $${available.toFixed(2)}`,
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          source: 'ynab',
          type: 'budget',
          month: month || null,
          category_group: categoryGroup || null,
          category: category || null,
          budgeted,
          activity,
          available,
        },
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'ynab_export', items, errors, totalFound };
  }
}
