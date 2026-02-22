/**
 * Statement Parser — CSV and OFX bank statement import.
 *
 * Reads financial statement files from the LOCAL filesystem only.
 * This is NOT a Gateway operation — no network involved.
 * The user selects a file → Core reads it → Core analyzes it.
 */

import { getPlatform } from '../platform/index.js';
import { nanoid } from 'nanoid';
import type { LLMProvider } from '../llm/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CSVParseOptions {
  dateColumn?: string;
  amountColumn?: string;
  descriptionColumn?: string;
  dateFormat?: string;
  hasHeader?: boolean;
  delimiter?: string;
}

export interface Transaction {
  id: string;
  date: string;                 // ISO 8601
  amount: number;               // negative = charge, positive = credit
  description: string;          // raw merchant description
  normalizedMerchant: string;   // cleaned (populated later by normalizer)
  category: string;             // auto-assigned category
  isRecurring: boolean;         // populated later by detector
  recurrenceGroup: string | null;
}

export interface StatementImport {
  id: string;
  fileName: string;
  fileFormat: 'csv' | 'ofx' | 'qfx';
  transactionCount: number;
  dateRange: { start: string; end: string };
  importedAt: string;
}

interface ColumnMapping {
  dateIndex: number;
  amountIndex: number;
  descriptionIndex: number;
  debitIndex?: number;    // separate debit column
  creditIndex?: number;   // separate credit column
}

// ─── CSV Parsing ────────────────────────────────────────────────────────────

const DATE_COLUMN_NAMES = [
  'date', 'transaction date', 'trans date', 'posted date', 'post date',
  'datum', 'fecha', 'booking date',
];

const AMOUNT_COLUMN_NAMES = [
  'amount', 'betrag', 'monto', 'transaction amount', 'trans amount',
];

const DEBIT_COLUMN_NAMES = ['debit', 'withdrawal', 'charge', 'ausgabe'];
const CREDIT_COLUMN_NAMES = ['credit', 'deposit', 'eingang'];

const DESCRIPTION_COLUMN_NAMES = [
  'description', 'desc', 'memo', 'name', 'payee', 'merchant',
  'beschreibung', 'narrative', 'details', 'reference',
];

/**
 * AUTONOMOUS DECISION: Date format detection uses a priority heuristic.
 * Reasoning: Avoids LLM call for the most common date formats.
 * Escalation check: Build prompt grants autonomy for CSV column auto-detection heuristics.
 */
const DATE_FORMATS = [
  { regex: /^\d{4}-\d{2}-\d{2}$/, parse: (s: string) => new Date(s) },
  { regex: /^\d{2}\/\d{2}\/\d{4}$/, parse: (s: string) => {
    const [m, d, y] = s.split('/');
    return new Date(`${y}-${m}-${d}`);
  }},
  { regex: /^\d{2}\/\d{2}\/\d{4}$/, parse: (s: string) => {
    // DD/MM/YYYY (European) — tried second if MM/DD/YYYY fails validation
    const [d, m, y] = s.split('/');
    return new Date(`${y}-${m}-${d}`);
  }},
  { regex: /^[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}$/, parse: (s: string) => new Date(s) },
];

function detectDelimiter(content: string): string {
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  const commas = (firstLines.match(/,/g) || []).length;
  const semicolons = (firstLines.match(/;/g) || []).length;
  const tabs = (firstLines.match(/\t/g) || []).length;

  if (semicolons > commas && semicolons > tabs) return ';';
  if (tabs > commas && tabs > semicolons) return '\t';
  return ',';
}

function splitCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function findDataStartRow(lines: string[], delimiter: string): number {
  // Skip metadata rows at the top (non-data lines)
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const fields = splitCSVLine(lines[i]!, delimiter);
    // A data row or header row typically has 3+ fields
    if (fields.length >= 3) return i;
  }
  return 0;
}

function detectColumnMapping(headers: string[], allRows: string[][], delimiter: string): ColumnMapping {
  const lower = headers.map(h => h.toLowerCase().trim().replace(/['"]/g, ''));

  let dateIndex = lower.findIndex(h => DATE_COLUMN_NAMES.includes(h));
  let amountIndex = lower.findIndex(h => AMOUNT_COLUMN_NAMES.includes(h));
  let descriptionIndex = lower.findIndex(h => DESCRIPTION_COLUMN_NAMES.includes(h));
  let debitIndex = lower.findIndex(h => DEBIT_COLUMN_NAMES.includes(h));
  let creditIndex = lower.findIndex(h => CREDIT_COLUMN_NAMES.includes(h));

  // If no named columns found, try positional detection from data
  if (dateIndex === -1 || (amountIndex === -1 && debitIndex === -1)) {
    // Check each column in first few data rows for patterns
    const sampleRow = allRows[0];
    if (sampleRow) {
      for (let i = 0; i < sampleRow.length; i++) {
        const val = sampleRow[i]!.trim();
        if (dateIndex === -1 && looksLikeDate(val)) {
          dateIndex = i;
        } else if (amountIndex === -1 && looksLikeAmount(val)) {
          amountIndex = i;
        } else if (descriptionIndex === -1 && val.length > 3 && !looksLikeDate(val) && !looksLikeAmount(val)) {
          descriptionIndex = i;
        }
      }
    }
  }

  // Defaults for minimal CSVs: assume date, amount, description order
  if (dateIndex === -1) dateIndex = 0;
  if (amountIndex === -1 && debitIndex === -1) amountIndex = Math.min(1, headers.length - 1);
  if (descriptionIndex === -1) descriptionIndex = Math.min(2, headers.length - 1);

  return {
    dateIndex,
    amountIndex: amountIndex >= 0 ? amountIndex : -1,
    descriptionIndex,
    debitIndex: debitIndex >= 0 ? debitIndex : undefined,
    creditIndex: creditIndex >= 0 ? creditIndex : undefined,
  };
}

function looksLikeDate(val: string): boolean {
  return DATE_FORMATS.some(f => f.regex.test(val));
}

function looksLikeAmount(val: string): boolean {
  // Matches numbers like -15.99, 15.99, -15,99, "1,234.56"
  return /^-?[\d,]+[.,]\d{2}$/.test(val.replace(/['"$€£]/g, '').trim());
}

function parseDate(val: string): string {
  for (const fmt of DATE_FORMATS) {
    if (fmt.regex.test(val)) {
      const d = fmt.parse(val);
      if (!isNaN(d.getTime()) && d.getFullYear() > 1990) {
        return d.toISOString().split('T')[0]!;
      }
    }
  }
  // Fallback: try native Date parsing
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]!;
  return '';
}

function parseAmount(val: string, debitVal?: string, creditVal?: string): number {
  if (debitVal !== undefined || creditVal !== undefined) {
    const debit = parseNumeric(debitVal || '');
    const credit = parseNumeric(creditVal || '');
    if (debit > 0) return -debit;
    if (credit > 0) return credit;
    return 0;
  }
  return parseNumeric(val);
}

function parseNumeric(val: string): number {
  if (!val || val.trim() === '') return 0;
  let cleaned = val.replace(/['"$€£\s]/g, '');
  // Handle European format: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})*(,\d{2})$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  // Handle comma thousands: 1,234.56 → 1234.56
  cleaned = cleaned.replace(/,(\d{3})/g, '$1');
  // Handle remaining commas as decimal separators
  cleaned = cleaned.replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ─── OFX Parsing ────────────────────────────────────────────────────────────

function parseOFXDate(dateStr: string): string {
  // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseOFXTransactions(content: string): Transaction[] {
  const transactions: Transaction[] = [];
  const txnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = txnRegex.exec(content)) !== null) {
    const block = match[1]!;
    const getValue = (tag: string): string => {
      const tagMatch = block.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'));
      return tagMatch ? tagMatch[1]!.trim() : '';
    };

    const dateStr = getValue('DTPOSTED');
    const amountStr = getValue('TRNAMT');
    const name = getValue('NAME');
    const memo = getValue('MEMO');

    const date = parseOFXDate(dateStr);
    const amount = parseFloat(amountStr);

    if (date && !isNaN(amount)) {
      transactions.push({
        id: nanoid(),
        date,
        amount,
        description: memo ? `${name} - ${memo}` : name,
        normalizedMerchant: '',
        category: '',
        isRecurring: false,
        recurrenceGroup: null,
      });
    }
  }

  return transactions;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class StatementParser {
  private llm?: LLMProvider;
  private model: string;

  constructor(config?: { llm?: LLMProvider; model?: string }) {
    this.llm = config?.llm;
    this.model = config?.model ?? 'llama3.2:8b';
  }

  /**
   * Auto-detect format and parse a bank statement file.
   * Reads from local filesystem only — no network involved.
   */
  async parseStatement(filePath: string): Promise<{ transactions: Transaction[]; import: StatementImport }> {
    const content = getPlatform().fs.readFileSync(filePath, 'utf-8');
    const ext = filePath.toLowerCase().split('.').pop() || '';

    let transactions: Transaction[];
    let format: 'csv' | 'ofx' | 'qfx';

    if (ext === 'ofx' || ext === 'qfx' || content.includes('<OFX>')) {
      transactions = this.parseOFX(content);
      format = ext === 'qfx' ? 'qfx' : 'ofx';
    } else {
      transactions = await this.parseCSV(content);
      format = 'csv';
    }

    const dates = transactions.map(t => t.date).filter(d => d).sort();
    const importRecord: StatementImport = {
      id: nanoid(),
      fileName: filePath.split(/[/\\]/).pop() || filePath,
      fileFormat: format,
      transactionCount: transactions.length,
      dateRange: {
        start: dates[0] || '',
        end: dates[dates.length - 1] || '',
      },
      importedAt: new Date().toISOString(),
    };

    return { transactions, import: importRecord };
  }

  /**
   * Parse a CSV bank statement with auto-detection of columns, dates, and delimiters.
   */
  async parseCSV(content: string, options?: CSVParseOptions): Promise<Transaction[]> {
    const delimiter = options?.delimiter || detectDelimiter(content);
    const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');

    if (lines.length === 0) return [];

    const dataStart = findDataStartRow(lines, delimiter);
    const dataLines = lines.slice(dataStart);
    if (dataLines.length === 0) return [];

    // Determine if first data line is a header
    const firstRow = splitCSVLine(dataLines[0]!, delimiter);
    const hasHeader = options?.hasHeader ?? !looksLikeDate(firstRow[0]!);

    const headers = hasHeader ? firstRow : firstRow.map((_, i) => `col${i}`);
    const rows = (hasHeader ? dataLines.slice(1) : dataLines)
      .map(l => splitCSVLine(l, delimiter))
      .filter(r => r.length >= 3 || (r.length >= 2 && r.some(v => looksLikeAmount(v))));

    // Filter out footer/summary rows
    const validRows = rows.filter(r => {
      const hasDate = r.some(v => looksLikeDate(v.trim()));
      const hasAmount = r.some(v => looksLikeAmount(v.replace(/['"$€£]/g, '').trim()));
      return hasDate || hasAmount;
    });

    if (validRows.length === 0) return [];

    const mapping = detectColumnMapping(headers, validRows, delimiter);

    return validRows.map(row => {
      const dateVal = row[mapping.dateIndex] || '';
      const descVal = row[mapping.descriptionIndex] || '';

      let amount: number;
      if (mapping.debitIndex !== undefined || mapping.creditIndex !== undefined) {
        amount = parseAmount('',
          mapping.debitIndex !== undefined ? row[mapping.debitIndex] : undefined,
          mapping.creditIndex !== undefined ? row[mapping.creditIndex] : undefined,
        );
      } else {
        amount = parseAmount(row[mapping.amountIndex] || '');
      }

      const date = parseDate(dateVal.trim());

      return {
        id: nanoid(),
        date,
        amount,
        description: descVal.trim(),
        normalizedMerchant: '',
        category: '',
        isRecurring: false,
        recurrenceGroup: null,
      };
    }).filter(t => t.date !== '');
  }

  /**
   * Parse an OFX/QFX bank statement.
   */
  parseOFX(content: string): Transaction[] {
    return parseOFXTransactions(content);
  }

  /**
   * Use the local LLM to help identify column mapping when auto-detection confidence is low.
   * This is a local LLM call — no network involved.
   */
  async llmColumnMapping(sampleRows: string[][]): Promise<ColumnMapping | null> {
    if (!this.llm) return null;

    try {
      const available = await this.llm.isAvailable();
      if (!available) return null;

      const response = await this.llm.chat({
        model: this.model,
        messages: [{
          role: 'user',
          content: `Identify columns in this bank statement CSV. Return JSON with dateIndex, amountIndex, descriptionIndex (0-indexed).

Sample rows:
${sampleRows.slice(0, 5).map(r => r.join(' | ')).join('\n')}

Respond with ONLY valid JSON: {"dateIndex": N, "amountIndex": N, "descriptionIndex": N}`,
        }],
        temperature: 0,
      });

      const parsed = JSON.parse(response.message.content) as {
        dateIndex: number;
        amountIndex: number;
        descriptionIndex: number;
      };
      return { ...parsed };
    } catch {
      return null;
    }
  }
}
