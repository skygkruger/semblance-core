// Tests for HealthEntryStore — in-memory SQLite mock.

import { describe, it, expect, beforeEach } from 'vitest';
import { HealthEntryStore, type HealthDatabase } from '@semblance/core/health/health-entry-store';

// ─── In-Memory Database Mock ────────────────────────────────────────────────────

interface MockRow {
  [key: string]: unknown;
}

class InMemoryDB implements HealthDatabase {
  private tables: Map<string, MockRow[]> = new Map();
  private schemas: Map<string, string[]> = new Map();

  run(sql: string, params?: unknown[]): void {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('CREATE TABLE')) {
      const nameMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (nameMatch) {
        const tableName = nameMatch[1]!;
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
          // Extract column names from CREATE TABLE
          const colMatch = sql.match(/\(([^)]+)\)/);
          if (colMatch) {
            const cols = colMatch[1]!.split(',')
              .map(c => c.trim().split(/\s+/)[0]!)
              .filter(c => c && !c.toUpperCase().startsWith('CREATE'));
            this.schemas.set(tableName, cols);
          }
        }
      }
      return;
    }

    if (trimmed.startsWith('CREATE INDEX')) return;

    if (trimmed.startsWith('INSERT INTO')) {
      const nameMatch = sql.match(/INSERT INTO (\w+)/i);
      if (!nameMatch) return;
      const tableName = nameMatch[1]!;
      const table = this.tables.get(tableName) ?? [];
      const cols = this.schemas.get(tableName) ?? [];

      const row: MockRow = {};
      cols.forEach((col, i) => {
        row[col] = params?.[i] ?? null;
      });

      // Handle ON CONFLICT upsert
      if (trimmed.includes('ON CONFLICT')) {
        const existingIdx = table.findIndex(r => r['date'] === row['date']);
        if (existingIdx >= 0) {
          table[existingIdx] = row;
        } else {
          table.push(row);
        }
      } else {
        table.push(row);
      }
      this.tables.set(tableName, table);
      return;
    }
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    const nameMatch = sql.match(/FROM (\w+)/i);
    if (!nameMatch) return undefined;
    const table = this.tables.get(nameMatch[1]!) ?? [];

    if (sql.includes('WHERE date = ?')) {
      const found = table.find(r => r['date'] === params?.[0]);
      return found as T | undefined;
    }

    return table[0] as T | undefined;
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    const nameMatch = sql.match(/FROM (\w+)/i);
    if (!nameMatch) return [];
    const table = this.tables.get(nameMatch[1]!) ?? [];

    if (sql.includes('WHERE date >= ? AND date <= ?')) {
      return table
        .filter(r => (r['date'] as string) >= (params?.[0] as string) && (r['date'] as string) <= (params?.[1] as string))
        .sort((a, b) => (a['date'] as string).localeCompare(b['date'] as string)) as T[];
    }

    return table as T[];
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('HealthEntryStore', () => {
  let db: InMemoryDB;
  let store: HealthEntryStore;

  beforeEach(() => {
    db = new InMemoryDB();
    store = new HealthEntryStore(db);
  });

  it('saves and retrieves an entry', () => {
    const saved = store.saveEntry({
      date: '2026-03-01',
      mood: 4,
      energy: 3,
      waterGlasses: 6,
      symptoms: ['headache'],
      medications: ['ibuprofen'],
    });

    expect(saved.date).toBe('2026-03-01');
    expect(saved.mood).toBe(4);
    expect(saved.energy).toBe(3);
    expect(saved.waterGlasses).toBe(6);
    expect(saved.symptoms).toEqual(['headache']);
    expect(saved.medications).toEqual(['ibuprofen']);

    const retrieved = store.getEntry('2026-03-01');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.mood).toBe(4);
  });

  it('upserts on same date (keeps same ID)', () => {
    const first = store.saveEntry({ date: '2026-03-01', mood: 3 });
    const second = store.saveEntry({ date: '2026-03-01', mood: 5 });
    expect(second.id).toBe(first.id);
    expect(second.mood).toBe(5);
  });

  it('range query returns entries in date order', () => {
    store.saveEntry({ date: '2026-03-03', mood: 2 });
    store.saveEntry({ date: '2026-03-01', mood: 4 });
    store.saveEntry({ date: '2026-03-02', mood: 3 });

    const entries = store.getEntries('2026-03-01', '2026-03-03');
    expect(entries.length).toBe(3);
    expect(entries[0]!.date).toBe('2026-03-01');
    expect(entries[1]!.date).toBe('2026-03-02');
    expect(entries[2]!.date).toBe('2026-03-03');
  });

  it('symptoms history returns unique sorted symptoms', () => {
    store.saveEntry({ date: '2026-03-01', symptoms: ['headache', 'nausea'] });
    store.saveEntry({ date: '2026-03-02', symptoms: ['fatigue', 'headache'] });

    const history = store.getSymptomsHistory();
    expect(history).toEqual(['fatigue', 'headache', 'nausea']);
  });

  it('medications history returns unique sorted medications', () => {
    store.saveEntry({ date: '2026-03-01', medications: ['ibuprofen', 'vitamin D'] });
    store.saveEntry({ date: '2026-03-02', medications: ['melatonin', 'ibuprofen'] });

    const history = store.getMedicationsHistory();
    expect(history).toEqual(['ibuprofen', 'melatonin', 'vitamin D']);
  });

  it('getTrends returns HealthTrendPoints with null HealthKit fields', () => {
    store.saveEntry({ date: '2026-03-01', mood: 4, energy: 3, waterGlasses: 5 });
    const trends = store.getTrends('2026-03-01', '2026-03-01');
    expect(trends.length).toBe(1);
    expect(trends[0]!.mood).toBe(4);
    expect(trends[0]!.sleepHours).toBeNull();
    expect(trends[0]!.steps).toBeNull();
    expect(trends[0]!.heartRateAvg).toBeNull();
  });

  it('getEntry returns null for non-existent date', () => {
    store.ensureTable();
    const entry = store.getEntry('2099-01-01');
    expect(entry).toBeNull();
  });
});
