// Comparison Statement Generator — Structured comparison of Semblance's knowledge vs cloud AI.
// Outputs segments for UI rendering (bold counts) + plain text for digest.
// CRITICAL: No networking imports.

import type { DataInventoryCollector } from './data-inventory-collector.js';
import type { ComparisonStatement, ComparisonSegment } from './types.js';

export interface ComparisonStatementGeneratorDeps {
  dataInventoryCollector: DataInventoryCollector;
}

// ─── Human-readable labels ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  emails: 'emails',
  calendarEvents: 'calendar events',
  documents: 'documents',
  contacts: 'contacts',
  reminders: 'reminders',
  locations: 'location records',
  captures: 'captures',
  finance: 'financial transactions',
  health: 'health entries',
};

const IMPORT_SOURCE_LABELS: Record<string, string> = {
  browser_history: 'browsing history items',
  notes: 'notes',
  photos: 'photos',
  messaging: 'messages',
  bookmarks: 'bookmarks',
};

/**
 * Generates a structured comparison statement showing what Semblance knows
 * vs what a cloud AI knows (nothing).
 */
export class ComparisonStatementGenerator {
  private collector: DataInventoryCollector;

  constructor(deps: ComparisonStatementGeneratorDeps) {
    this.collector = deps.dataInventoryCollector;
  }

  /**
   * Generate the comparison statement with segments and summary text.
   */
  async generate(): Promise<ComparisonStatement> {
    const inventory = this.collector.collect();

    const segments: ComparisonSegment[] = [];

    for (const cat of inventory.categories) {
      if (cat.count === 0) continue;

      if (cat.category === 'imports' && cat.breakdown) {
        // Break imports into individual source type segments
        for (const [sourceType, count] of Object.entries(cat.breakdown)) {
          if (count === 0) continue;
          const label = IMPORT_SOURCE_LABELS[sourceType] ?? sourceType.replace(/_/g, ' ') + ' items';
          segments.push({
            category: `import:${sourceType}`,
            count,
            label: `${formatNumber(count)} ${label}`,
          });
        }
      } else {
        const label = CATEGORY_LABELS[cat.category] ?? cat.category;
        segments.push({
          category: cat.category,
          count: cat.count,
          label: `${formatNumber(cat.count)} ${label}`,
        });
      }
    }

    const totalDataPoints = segments.reduce((sum, s) => sum + s.count, 0);
    const summaryText = this.buildSummaryText(segments);

    return {
      segments,
      totalDataPoints,
      summaryText,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildSummaryText(segments: ComparisonSegment[]): string {
    if (segments.length === 0) {
      return 'Your Semblance has no indexed data yet. Connect your first data source to get started.';
    }

    const parts = segments.map(s => s.label);
    const enumeration = this.naturalJoin(parts);

    return `Your Semblance has indexed ${enumeration}. When you open ChatGPT, it knows nothing.`;
  }

  /**
   * Join a list of strings with commas and "and" for the last item.
   */
  private naturalJoin(parts: string[]): string {
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0]!;
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }
}

/**
 * Format a number with thousands separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
