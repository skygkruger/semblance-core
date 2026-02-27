/**
 * Google Takeout Parser -- Parses Google Takeout export directories.
 *
 * Google Takeout exports as a directory structure:
 *   Takeout/
 *     YouTube/
 *       history/
 *         watch-history.json -- Array of watched videos
 *     Maps (My Places)/
 *       ... or Location History/
 *     Chrome/
 *       BrowserHistory.json -- Chrome history (delegate to ChromeHistoryParser)
 *     My Activity/
 *       Search/
 *         MyActivity.json -- Search queries
 *       Maps/
 *         MyActivity.json or Maps - My Activity.json -- Places visited
 *
 * Each sub-parser handles one data type and all results are merged.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { statSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { safeReadFileSync, safeWalkDirectory } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(prefix: string, ...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `gto_${prefix}_${hash}`;
}

/**
 * Safely parse JSON from a file path. Returns null on failure.
 */
function readJsonFile(filePath: string): unknown | null {
  try {
    const raw = safeReadFileSync(filePath);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Recursively find files matching a predicate within a directory.
 * Returns full file paths. Uses lstatSync for symlink detection.
 */
function findFiles(dir: string, predicate: (name: string) => boolean, maxDepth: number = 5): string[] {
  const results: string[] = [];
  if (maxDepth <= 0) return results;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === '__MACOSX') continue;
      const fullPath = join(dir, entry);
      try {
        // SECURITY: Use lstatSync to detect symlinks before following
        const lstat = lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          const subFiles = findFiles(fullPath, predicate, maxDepth - 1);
          results.push(...subFiles);
        } else if (lstat.isFile() && predicate(entry)) {
          results.push(fullPath);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Directory unreadable
  }

  return results;
}

/** YouTube watch history entry structure. */
interface YouTubeWatchEntry {
  title?: string;
  titleUrl?: string;
  time?: string;
  subtitles?: Array<{ name?: string; url?: string }>;
  header?: string;
  activityControls?: string[];
}

/** Google Activity entry structure (Search, Maps, etc.). */
interface GoogleActivityEntry {
  title?: string;
  titleUrl?: string;
  time?: string;
  products?: string[];
  header?: string;
  locationInfos?: Array<{
    name?: string;
    url?: string;
    source?: string;
    sourceUrl?: string;
  }>;
}

function parseGoogleTimestamp(timeStr: string): Date | null {
  if (!timeStr) return null;
  try {
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) return date;
    return null;
  } catch {
    return null;
  }
}

function parseYouTubeHistory(
  data: unknown,
  options: ParseOptions | undefined,
  errors: ParseError[],
): ImportedItem[] {
  if (!Array.isArray(data)) {
    errors.push({ message: 'YouTube watch history is not an array' });
    return [];
  }

  const items: ImportedItem[] = [];
  for (let i = 0; i < data.length; i++) {
    const entry = data[i] as YouTubeWatchEntry;
    if (!entry?.title) continue;

    const timestamp = parseGoogleTimestamp(entry.time ?? '');
    if (options?.since && timestamp && timestamp < options.since) continue;

    // Extract video ID from URL
    let videoId = '';
    if (entry.titleUrl) {
      const match = entry.titleUrl.match(/[?&]v=([^&]+)/);
      if (match) videoId = match[1]!;
    }

    const channelName = entry.subtitles?.[0]?.name ?? '';

    items.push({
      id: deterministicId('yt', entry.title, entry.time ?? '', videoId),
      sourceType: 'notes',
      title: entry.title.replace(/^Watched\s+/i, ''),
      content: [
        `Watched: ${entry.title}`,
        channelName ? `Channel: ${channelName}` : '',
        entry.titleUrl ? `URL: ${entry.titleUrl}` : '',
      ].filter(Boolean).join('\n'),
      timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
      metadata: {
        source: 'google_takeout',
        sub_source: 'youtube',
        type: 'watch_history',
        video_id: videoId || null,
        channel: channelName || null,
        url: entry.titleUrl ?? null,
      },
    });
  }

  return items;
}

function parseSearchActivity(
  data: unknown,
  options: ParseOptions | undefined,
  errors: ParseError[],
): ImportedItem[] {
  if (!Array.isArray(data)) {
    errors.push({ message: 'Search activity data is not an array' });
    return [];
  }

  const items: ImportedItem[] = [];
  for (let i = 0; i < data.length; i++) {
    const entry = data[i] as GoogleActivityEntry;
    if (!entry?.title) continue;

    const timestamp = parseGoogleTimestamp(entry.time ?? '');
    if (options?.since && timestamp && timestamp < options.since) continue;

    // Extract the search query from "Searched for <query>"
    const query = entry.title.replace(/^Searched for\s+/i, '');

    items.push({
      id: deterministicId('sr', query, entry.time ?? ''),
      sourceType: 'notes',
      title: `Search: ${query}`,
      content: `Google search: ${query}`,
      timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
      metadata: {
        source: 'google_takeout',
        sub_source: 'search',
        type: 'search_query',
        query,
        url: entry.titleUrl ?? null,
        products: entry.products ?? [],
      },
    });
  }

  return items;
}

function parseMapsActivity(
  data: unknown,
  options: ParseOptions | undefined,
  errors: ParseError[],
): ImportedItem[] {
  if (!Array.isArray(data)) {
    errors.push({ message: 'Maps activity data is not an array' });
    return [];
  }

  const items: ImportedItem[] = [];
  for (let i = 0; i < data.length; i++) {
    const entry = data[i] as GoogleActivityEntry;
    if (!entry?.title) continue;

    const timestamp = parseGoogleTimestamp(entry.time ?? '');
    if (options?.since && timestamp && timestamp < options.since) continue;

    const locationName = entry.locationInfos?.[0]?.name ?? '';
    const locationUrl = entry.locationInfos?.[0]?.url ?? '';

    items.push({
      id: deterministicId('mp', entry.title, entry.time ?? ''),
      sourceType: 'notes',
      title: entry.title,
      content: [
        `Maps activity: ${entry.title}`,
        locationName ? `Location: ${locationName}` : '',
        locationUrl ? `URL: ${locationUrl}` : '',
      ].filter(Boolean).join('\n'),
      timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
      metadata: {
        source: 'google_takeout',
        sub_source: 'maps',
        type: 'maps_activity',
        location_name: locationName || null,
        location_url: locationUrl || null,
        url: entry.titleUrl ?? null,
      },
    });
  }

  return items;
}

export class GoogleTakeoutParser implements ImportParser {
  readonly sourceType = 'notes' as const;
  readonly supportedFormats = ['google_takeout'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase().replace(/\\/g, '/');

    // Accept a directory that looks like a Takeout root
    if (lowerPath.endsWith('/takeout') || lowerPath.endsWith('/takeout/')) {
      return true;
    }

    // Accept paths containing 'takeout' directory
    if (lowerPath.includes('/takeout/')) {
      return true;
    }

    // If data is provided (for a JSON file), check for Google-style activity format
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          // Google activity entries have 'title' and 'time' fields
          return typeof first === 'object' && first !== null &&
                 'title' in first && 'time' in first;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const allItems: ImportedItem[] = [];

    // Determine the Takeout root directory
    let takeoutRoot = path;

    try {
      const stat = statSync(path);
      if (!stat.isDirectory()) {
        // If a file was passed, try to parse it directly as a Google activity file
        return this.parseSingleFile(path, options);
      }
    } catch (err) {
      return {
        format: 'google_takeout',
        items: [],
        errors: [{ message: `Failed to access path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    // Check if there's a Takeout subdirectory
    const takeoutSubdir = join(path, 'Takeout');
    if (existsSync(takeoutSubdir)) {
      try {
        if (statSync(takeoutSubdir).isDirectory()) {
          takeoutRoot = takeoutSubdir;
        }
      } catch {
        // Use original path
      }
    }

    // 1. YouTube watch history
    const ytHistoryFiles = findFiles(takeoutRoot, (name) =>
      name.toLowerCase() === 'watch-history.json',
    );
    for (const file of ytHistoryFiles) {
      const data = readJsonFile(file);
      if (data) {
        const ytItems = parseYouTubeHistory(data, options, errors);
        allItems.push(...ytItems);
      }
    }

    // 2. Search activity
    const searchFiles = findFiles(takeoutRoot, (name) =>
      name.toLowerCase() === 'myactivity.json' || name.toLowerCase() === 'my activity.json',
    );
    for (const file of searchFiles) {
      const lowerFile = file.toLowerCase().replace(/\\/g, '/');
      // Only parse files in a Search directory
      if (lowerFile.includes('/search/')) {
        const data = readJsonFile(file);
        if (data) {
          const searchItems = parseSearchActivity(data, options, errors);
          allItems.push(...searchItems);
        }
      }
    }

    // 3. Maps activity
    const mapsFiles = findFiles(takeoutRoot, (name) => {
      const lower = name.toLowerCase();
      return lower === 'myactivity.json' ||
             lower === 'my activity.json' ||
             lower === 'maps - my activity.json';
    });
    for (const file of mapsFiles) {
      const lowerFile = file.toLowerCase().replace(/\\/g, '/');
      if (lowerFile.includes('/maps/') || lowerFile.includes('/maps (')) {
        const data = readJsonFile(file);
        if (data) {
          const mapsItems = parseMapsActivity(data, options, errors);
          allItems.push(...mapsItems);
        }
      }
    }

    // 4. Chrome browser history -- delegate detection but parse inline
    const chromeFiles = findFiles(takeoutRoot, (name) =>
      name.toLowerCase() === 'browserhistory.json',
    );
    for (const file of chromeFiles) {
      const data = readJsonFile(file) as { 'Browser History'?: Array<{ title: string; url: string; time_usec: number; page_transition: string }> } | null;
      if (data && Array.isArray(data['Browser History'])) {
        const entries = data['Browser History'];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          if (!entry.url || !entry.time_usec) continue;

          const timestampMs = entry.time_usec / 1000;
          const timestamp = new Date(timestampMs);
          if (options?.since && timestamp < options.since) continue;

          allItems.push({
            id: deterministicId('ch', entry.url),
            sourceType: 'notes',
            title: entry.title || entry.url,
            content: `Visited: ${entry.title || 'Untitled'} - ${entry.url}`,
            timestamp: timestamp.toISOString(),
            metadata: {
              source: 'google_takeout',
              sub_source: 'chrome',
              type: 'browser_history',
              url: entry.url,
              page_transition: entry.page_transition ?? null,
            },
          });
        }
      }
    }

    const totalFound = allItems.length;

    // Sort all items by timestamp descending
    allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    let items = allItems;
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'google_takeout',
      items,
      errors,
      totalFound,
    };
  }

  /**
   * Parse a single Google activity JSON file (when a file path is provided
   * instead of a directory).
   */
  private async parseSingleFile(filePath: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const data = readJsonFile(filePath);

    if (!data || !Array.isArray(data)) {
      return {
        format: 'google_takeout',
        items: [],
        errors: [{ message: 'Not a valid Google activity JSON file' }],
        totalFound: 0,
      };
    }

    const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');

    let items: ImportedItem[] = [];

    if (lowerPath.includes('watch-history') || lowerPath.includes('youtube')) {
      items = parseYouTubeHistory(data, options, errors);
    } else if (lowerPath.includes('/search/')) {
      items = parseSearchActivity(data, options, errors);
    } else if (lowerPath.includes('/maps/') || lowerPath.includes('maps')) {
      items = parseMapsActivity(data, options, errors);
    } else {
      // Try to auto-detect from content
      if (data.length > 0) {
        const first = data[0] as Record<string, unknown>;
        if (typeof first?.title === 'string') {
          const title = first.title as string;
          if (title.startsWith('Searched for')) {
            items = parseSearchActivity(data, options, errors);
          } else if (title.startsWith('Watched') || title.startsWith('Visited')) {
            items = parseYouTubeHistory(data, options, errors);
          } else {
            // Generic activity items
            items = parseSearchActivity(data, options, errors);
          }
        }
      }
    }

    const totalFound = items.length;

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'google_takeout',
      items,
      errors,
      totalFound,
    };
  }
}
