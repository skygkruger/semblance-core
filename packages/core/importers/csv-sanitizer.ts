// CSV Sanitizer — Protect against CSV formula injection.
//
// When CSV data is eventually opened in a spreadsheet application,
// cells starting with =, +, -, @, \t, \r can trigger formula execution.
// This module strips these dangerous prefixes from cell values.
//
// Applied to: YNAB, Mint, Strava, Goodreads, LinkedIn CSV parsers.
// CRITICAL: No networking imports. Pure string processing.

/** Characters that trigger formula execution in spreadsheets */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitize a single CSV cell value to prevent formula injection.
 * Strips leading formula trigger characters.
 */
export function sanitizeCsvCell(value: string): string {
  if (!value) return value;

  let sanitized = value;

  // Strip all leading formula prefixes (handle chained: =-+@)
  while (sanitized.length > 0 && FORMULA_PREFIXES.includes(sanitized[0]!)) {
    sanitized = sanitized.slice(1);
  }

  return sanitized.trim();
}

/**
 * Sanitize all string values in an array of parsed CSV rows.
 * Each row is a Record<string, string | number | undefined>.
 */
export function sanitizeCsvRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(row => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = typeof value === 'string' ? sanitizeCsvCell(value) : value;
    }
    return sanitized as T;
  });
}
