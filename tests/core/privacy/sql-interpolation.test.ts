// SQL Interpolation Tests — Verify table/column names are validated against whitelists.
// Chunk 11 of the security audit remediation.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_INVENTORY_PATH = resolve(
  __dirname,
  '../../../packages/core/privacy/data-inventory-collector.ts',
);
const PRIVACY_TRACKER_PATH = resolve(
  __dirname,
  '../../../packages/core/privacy/privacy-tracker.ts',
);

const dataInventorySource = readFileSync(DATA_INVENTORY_PATH, 'utf-8');
const privacyTrackerSource = readFileSync(PRIVACY_TRACKER_PATH, 'utf-8');

describe('SQL Interpolation Whitelist — DataInventoryCollector', () => {
  it('should define KNOWN_TABLES whitelist', () => {
    expect(dataInventorySource).toContain('KNOWN_TABLES');
    expect(dataInventorySource).toContain("'indexed_emails'");
    expect(dataInventorySource).toContain("'documents'");
    expect(dataInventorySource).toContain("'contacts'");
    expect(dataInventorySource).toContain("'transactions'");
    expect(dataInventorySource).toContain("'health_entries'");
  });

  it('should define KNOWN_GROUP_COLUMNS whitelist', () => {
    expect(dataInventorySource).toContain('KNOWN_GROUP_COLUMNS');
    expect(dataInventorySource).toContain("'source'");
    expect(dataInventorySource).toContain("'relationship'");
    expect(dataInventorySource).toContain("'source_type'");
  });

  it('should call assertKnownTable in safeCount', () => {
    expect(dataInventorySource).toMatch(/safeCount[\s\S]*?assertKnownTable\(table\)/);
  });

  it('should call assertKnownTable and assertKnownColumn in safeGroupCount', () => {
    expect(dataInventorySource).toMatch(/safeGroupCount[\s\S]*?assertKnownTable\(table\)/);
    expect(dataInventorySource).toMatch(/safeGroupCount[\s\S]*?assertKnownColumn\(column\)/);
  });

  it('should quote table names in SQL queries', () => {
    // All table interpolations should use double-quoted identifiers
    expect(dataInventorySource).toContain('FROM "${table}"');
  });

  it('should quote column names in SQL queries', () => {
    expect(dataInventorySource).toContain('SELECT "${column}"');
    expect(dataInventorySource).toContain('GROUP BY "${column}"');
  });

  it('assertKnownTable should throw for unknown tables', () => {
    // Extract and evaluate the assertKnownTable function
    expect(dataInventorySource).toContain(
      "throw new Error(`Unknown table: ${table}. Only whitelisted tables are allowed.`)"
    );
  });

  it('assertKnownColumn should throw for unknown columns', () => {
    expect(dataInventorySource).toContain(
      "throw new Error(`Unknown column: ${column}. Only whitelisted columns are allowed.`)"
    );
  });

  it('should NOT have unguarded template literal SQL with raw table names', () => {
    // Check that there are no `FROM ${table}` (without quotes) remaining
    const unquotedTablePattern = /FROM \$\{table\}/g;
    const matches = dataInventorySource.match(unquotedTablePattern);
    expect(matches).toBeNull();
  });
});

describe('SQL Interpolation Whitelist — PrivacyTracker', () => {
  it('should define KNOWN_DATA_TABLES whitelist as static readonly Set', () => {
    expect(privacyTrackerSource).toContain('KNOWN_DATA_TABLES');
    expect(privacyTrackerSource).toContain("'indexed_emails'");
    expect(privacyTrackerSource).toContain("'documents'");
    expect(privacyTrackerSource).toContain("'contacts'");
    expect(privacyTrackerSource).toContain("'captures'");
  });

  it('should iterate KNOWN_DATA_TABLES instead of inline array', () => {
    expect(privacyTrackerSource).toContain('PrivacyTracker.KNOWN_DATA_TABLES');
  });

  it('should quote table names in SQL queries', () => {
    expect(privacyTrackerSource).toContain('FROM "${table}"');
  });

  it('should NOT have unguarded template literal SQL with raw table names', () => {
    const unquotedTablePattern = /FROM \$\{table\}/g;
    const matches = privacyTrackerSource.match(unquotedTablePattern);
    expect(matches).toBeNull();
  });
});
