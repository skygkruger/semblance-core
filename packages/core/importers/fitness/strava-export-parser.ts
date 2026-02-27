/**
 * Strava Export Parser -- Parses Strava bulk export (extracted ZIP with activities.csv).
 *
 * Strava bulk export activities.csv columns:
 *   Activity ID, Activity Date, Activity Name, Activity Type,
 *   Activity Description, Elapsed Time, Distance, Max Heart Rate,
 *   Relative Effort, Commute, Activity Gear, Filename,
 *   Athlete Weight, Bike Weight, Elapsed Time (seconds),
 *   Moving Time, Moving Time (seconds), Distance (km or mi),
 *   Max Speed, Average Speed, Elevation Gain, Elevation Loss,
 *   Elevation Low, Elevation High, Max Grade, Average Grade,
 *   Average Positive Grade, Average Negative Grade,
 *   Max Cadence, Average Cadence, Max Heart Rate, Average Heart Rate,
 *   Max Watts, Average Watts, Calories, ...
 *
 * Column names vary between exports; the parser is flexible with column matching.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(activityId: string, name: string, date: string): string {
  const input = `${activityId}|${name}|${date}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `stv_exp_${hash}`;
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

function parseStravaDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Strava formats: "Oct 15, 2023, 7:30:00 AM", "2023-10-15 07:30:00",
    // "Oct 15, 2023 7:30:00 AM" (with or without comma after year)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    return null;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  return idx >= 0 ? (row[idx] ?? '') : '';
}

function parseNum(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Strava-specific columns for identification. */
const STRAVA_COLUMNS = ['activity id', 'activity date', 'activity name', 'activity type', 'elapsed time', 'distance'];

export class StravaExportParser implements ImportParser {
  readonly sourceType = 'health' as const;
  readonly supportedFormats = ['strava_export'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Check for activities.csv with Strava-like path
    if (lowerPath.endsWith('activities.csv')) {
      if (!data) return true;
    }

    // Check header columns in data
    if (data) {
      const firstLine = (data.split('\n')[0] ?? '').toLowerCase();
      const matchCount = STRAVA_COLUMNS.filter(col => firstLine.includes(col)).length;
      // Need at least 4 of 6 Strava columns
      return matchCount >= 4;
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
        format: 'strava_export',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const rows = parseCSV(rawData);
    if (rows.length < 2) {
      return {
        format: 'strava_export',
        items: [],
        errors: [{ message: 'CSV file has no data rows' }],
        totalFound: 0,
      };
    }

    const headers = rows[0]!;
    const dataRows = rows.slice(1);
    const totalFound = dataRows.length;

    const actIdIdx = colIndex(headers, 'activity id');
    const actDateIdx = colIndex(headers, 'activity date');
    const actNameIdx = colIndex(headers, 'activity name');
    const actTypeIdx = colIndex(headers, 'activity type');
    const actDescIdx = colIndex(headers, 'activity description');
    const elapsedIdx = colIndex(headers, 'elapsed time');
    const elapsedSecsIdx = colIndex(headers, 'elapsed time (seconds)');
    const movingTimeIdx = colIndex(headers, 'moving time');
    const movingSecsIdx = colIndex(headers, 'moving time (seconds)');
    const distanceIdx = colIndex(headers, 'distance');
    const maxHrIdx = colIndex(headers, 'max heart rate');
    const avgHrIdx = colIndex(headers, 'average heart rate');
    const effortIdx = colIndex(headers, 'relative effort');
    const caloriesIdx = colIndex(headers, 'calories');
    const elevGainIdx = colIndex(headers, 'elevation gain');
    const elevLossIdx = colIndex(headers, 'elevation loss');
    const maxSpeedIdx = colIndex(headers, 'max speed');
    const avgSpeedIdx = colIndex(headers, 'average speed');
    const commuteIdx = colIndex(headers, 'commute');
    const gearIdx = colIndex(headers, 'activity gear');
    const avgWattsIdx = colIndex(headers, 'average watts');
    const maxWattsIdx = colIndex(headers, 'max watts');

    let items: ImportedItem[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const activityId = getField(row, actIdIdx);
      const dateStr = getField(row, actDateIdx);
      const name = getField(row, actNameIdx);
      const activityType = getField(row, actTypeIdx);

      if (!dateStr && !name) {
        errors.push({ message: 'Missing activity date and name', index: i + 1 });
        continue;
      }

      const timestamp = parseStravaDate(dateStr);
      if (options?.since && timestamp && timestamp < options.since) {
        continue;
      }

      const description = getField(row, actDescIdx);
      const distance = parseNum(getField(row, distanceIdx));
      const elapsedSeconds = parseNum(getField(row, elapsedSecsIdx)) ||
                             parseNum(getField(row, elapsedIdx));
      const movingSeconds = parseNum(getField(row, movingSecsIdx)) ||
                            parseNum(getField(row, movingTimeIdx));
      const maxHr = parseNum(getField(row, maxHrIdx));
      const avgHr = parseNum(getField(row, avgHrIdx));
      const calories = parseNum(getField(row, caloriesIdx));
      const elevGain = parseNum(getField(row, elevGainIdx));
      const elevLoss = parseNum(getField(row, elevLossIdx));
      const maxSpeed = parseNum(getField(row, maxSpeedIdx));
      const avgSpeed = parseNum(getField(row, avgSpeedIdx));
      const effort = parseNum(getField(row, effortIdx));
      const commute = getField(row, commuteIdx).toLowerCase() === 'true';
      const gear = getField(row, gearIdx);
      const avgWatts = parseNum(getField(row, avgWattsIdx));
      const maxWatts = parseNum(getField(row, maxWattsIdx));

      items.push({
        id: deterministicId(activityId || String(i), name, dateStr),
        sourceType: 'health',
        title: `${activityType || 'Activity'}: ${name || 'Untitled'}`,
        content: [
          `${activityType || 'Activity'}: ${name || 'Untitled'}`,
          distance > 0 ? `Distance: ${distance.toFixed(2)} km` : '',
          elapsedSeconds > 0 ? `Duration: ${formatDuration(elapsedSeconds)}` : '',
          movingSeconds > 0 ? `Moving Time: ${formatDuration(movingSeconds)}` : '',
          elevGain > 0 ? `Elevation Gain: ${elevGain.toFixed(0)}m` : '',
          avgHr > 0 ? `Avg Heart Rate: ${avgHr.toFixed(0)} bpm` : '',
          calories > 0 ? `Calories: ${calories.toFixed(0)}` : '',
          description || '',
        ].filter(Boolean).join('\n'),
        timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
        metadata: {
          source: 'strava',
          type: 'activity',
          activity_id: activityId || null,
          activity_type: activityType || null,
          distance,
          elapsed_seconds: elapsedSeconds,
          moving_seconds: movingSeconds,
          max_heart_rate: maxHr || null,
          avg_heart_rate: avgHr || null,
          calories: calories || null,
          elevation_gain: elevGain || null,
          elevation_loss: elevLoss || null,
          max_speed: maxSpeed || null,
          avg_speed: avgSpeed || null,
          relative_effort: effort || null,
          is_commute: commute,
          gear: gear || null,
          avg_watts: avgWatts || null,
          max_watts: maxWatts || null,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'strava_export', items, errors, totalFound };
  }
}
