// HealthEntryStore — SQLite storage for manual health entries.
//
// Stores daily mood, energy, water, symptoms, medications.
// Health data is ALWAYS local only. Never synced, never uploaded.
// HealthKit/Health Connect integration feeds additional metrics
// but those are read-only from platform APIs — this store is
// for user-entered manual data.

import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthEntry {
  id: string;
  date: string;           // YYYY-MM-DD
  timestamp: string;      // ISO datetime
  mood: number | null;    // 1-5
  energy: number | null;  // 1-5
  waterGlasses: number | null;
  symptoms: string[];
  medications: string[];
  notes: string | null;
}

export interface HealthTrendPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  waterGlasses: number | null;
  sleepHours: number | null;     // HealthKit (null on desktop)
  steps: number | null;          // HealthKit (null on desktop)
  heartRateAvg: number | null;   // HealthKit (null on desktop)
}

export interface HealthInsight {
  id: string;
  type: 'correlation' | 'trend' | 'streak';
  title: string;
  description: string;
  confidence: number;
  dataSources: string[];
  detectedAt: string;
}

// ─── Database interface ─────────────────────────────────────────────────────

export interface HealthDatabase {
  run(sql: string, params?: unknown[]): void;
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
}

// ─── Store ──────────────────────────────────────────────────────────────────

export class HealthEntryStore {
  private db: HealthDatabase;
  private initialized = false;

  constructor(db: HealthDatabase) {
    this.db = db;
  }

  ensureTable(): void {
    if (this.initialized) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS health_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL,
        mood INTEGER,
        energy INTEGER,
        water_glasses INTEGER,
        symptoms TEXT NOT NULL DEFAULT '[]',
        medications TEXT NOT NULL DEFAULT '[]',
        notes TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_health_entries_date
      ON health_entries(date)
    `);

    this.initialized = true;
  }

  saveEntry(entry: Partial<HealthEntry> & { date: string }): HealthEntry {
    this.ensureTable();

    const existing = this.getEntry(entry.date);
    const id = existing?.id ?? nanoid();
    const now = new Date().toISOString();

    const full: HealthEntry = {
      id,
      date: entry.date,
      timestamp: now,
      mood: entry.mood ?? existing?.mood ?? null,
      energy: entry.energy ?? existing?.energy ?? null,
      waterGlasses: entry.waterGlasses ?? existing?.waterGlasses ?? null,
      symptoms: entry.symptoms ?? existing?.symptoms ?? [],
      medications: entry.medications ?? existing?.medications ?? [],
      notes: entry.notes ?? existing?.notes ?? null,
    };

    this.db.run(
      `INSERT INTO health_entries (id, date, timestamp, mood, energy, water_glasses, symptoms, medications, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         timestamp = excluded.timestamp,
         mood = excluded.mood,
         energy = excluded.energy,
         water_glasses = excluded.water_glasses,
         symptoms = excluded.symptoms,
         medications = excluded.medications,
         notes = excluded.notes`,
      [
        full.id,
        full.date,
        full.timestamp,
        full.mood,
        full.energy,
        full.waterGlasses,
        JSON.stringify(full.symptoms),
        JSON.stringify(full.medications),
        full.notes,
      ],
    );

    return full;
  }

  getEntry(date: string): HealthEntry | null {
    this.ensureTable();

    const row = this.db.get<{
      id: string;
      date: string;
      timestamp: string;
      mood: number | null;
      energy: number | null;
      water_glasses: number | null;
      symptoms: string;
      medications: string;
      notes: string | null;
    }>('SELECT * FROM health_entries WHERE date = ?', [date]);

    if (!row) return null;

    return {
      id: row.id,
      date: row.date,
      timestamp: row.timestamp,
      mood: row.mood,
      energy: row.energy,
      waterGlasses: row.water_glasses,
      symptoms: JSON.parse(row.symptoms),
      medications: JSON.parse(row.medications),
      notes: row.notes,
    };
  }

  getEntries(startDate: string, endDate: string): HealthEntry[] {
    this.ensureTable();

    const rows = this.db.all<{
      id: string;
      date: string;
      timestamp: string;
      mood: number | null;
      energy: number | null;
      water_glasses: number | null;
      symptoms: string;
      medications: string;
      notes: string | null;
    }>('SELECT * FROM health_entries WHERE date >= ? AND date <= ? ORDER BY date', [startDate, endDate]);

    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      timestamp: row.timestamp,
      mood: row.mood,
      energy: row.energy,
      waterGlasses: row.water_glasses,
      symptoms: JSON.parse(row.symptoms),
      medications: JSON.parse(row.medications),
      notes: row.notes,
    }));
  }

  getTrends(startDate: string, endDate: string): HealthTrendPoint[] {
    this.ensureTable();

    const entries = this.getEntries(startDate, endDate);
    return entries.map((e) => ({
      date: e.date,
      mood: e.mood,
      energy: e.energy,
      waterGlasses: e.waterGlasses,
      sleepHours: null,      // HealthKit only — not stored in this table
      steps: null,           // HealthKit only
      heartRateAvg: null,    // HealthKit only
    }));
  }

  getSymptomsHistory(): string[] {
    this.ensureTable();

    const rows = this.db.all<{ symptoms: string }>('SELECT symptoms FROM health_entries');
    const allSymptoms = new Set<string>();
    for (const row of rows) {
      const parsed = JSON.parse(row.symptoms) as string[];
      for (const s of parsed) {
        allSymptoms.add(s);
      }
    }
    return [...allSymptoms].sort();
  }

  getMedicationsHistory(): string[] {
    this.ensureTable();

    const rows = this.db.all<{ medications: string }>('SELECT medications FROM health_entries');
    const allMeds = new Set<string>();
    for (const row of rows) {
      const parsed = JSON.parse(row.medications) as string[];
      for (const m of parsed) {
        allMeds.add(m);
      }
    }
    return [...allMeds].sort();
  }
}
