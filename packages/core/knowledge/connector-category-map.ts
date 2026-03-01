// Connector → Visualization Category mapping for Knowledge Graph redesign.
//
// Maps the 48 connector IDs from ConnectorRegistry into 10 visualization
// categories. Some connectors are reclassified from their registry category
// for visualization purposes (e.g., toggl/rescuetime → work, browsers → browser).
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { VisualizationEntityType } from './graph-visualization.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type VisualizationCategory =
  | 'health'
  | 'finance'
  | 'social'
  | 'work'
  | 'reading'
  | 'music'
  | 'cloud'
  | 'browser'
  | 'people'
  | 'knowledge';

export interface CategoryMeta {
  id: VisualizationCategory;
  displayName: string;
  color: string;
  icon: string;
}

// ─── Connector → Category Map (46 entries) ───────────────────────────────────

export const CONNECTOR_TO_CATEGORY: Record<string, VisualizationCategory> = {
  // Health & Fitness
  'oura': 'health',
  'whoop': 'health',
  'fitbit': 'health',
  'strava': 'health',
  'garmin': 'health',
  'apple-health-export': 'health',
  'strava-export': 'health',

  // Finance
  'ynab-export': 'finance',
  'mint-export': 'finance',

  // Social & Messaging
  'slack-oauth': 'social',
  'facebook-export': 'social',
  'instagram-export': 'social',
  'twitter-export': 'social',
  'linkedin-export': 'social',
  'discord-export': 'social',
  'imessage': 'social',
  'signal-export': 'social',
  'whatsapp-export': 'social',
  'telegram-export': 'social',

  // Work & Productivity (reclassified: toggl/rescuetime from health_fitness)
  'github': 'work',
  'notion': 'work',
  'todoist': 'work',
  'things': 'work',
  'harvest': 'work',
  'slack-export': 'work',
  'toggl': 'work',
  'rescuetime': 'work',

  // Reading & Research
  'readwise': 'reading',
  'pocket': 'reading',
  'instapaper': 'reading',
  'zotero': 'reading',
  'mendeley': 'reading',
  'goodreads-export': 'reading',
  'letterboxd': 'reading',

  // Music & Entertainment
  'spotify': 'music',
  'lastfm': 'music',

  // Cloud Storage
  'google-drive': 'cloud',
  'dropbox': 'cloud',
  'onedrive': 'cloud',
  'box': 'cloud',

  // Browsing (reclassified from productivity)
  'safari-history': 'browser',
  'edge-history': 'browser',
  'arc-history': 'browser',

  // Documents & Notes (reclassified from productivity)
  'obsidian': 'knowledge',
  'google-takeout': 'knowledge',
  'notion-export': 'knowledge',
  'bear-export': 'knowledge',
  'evernote-export': 'knowledge',
};

// ─── Category Metadata (10 categories) ───────────────────────────────────────

export const CATEGORY_META: Record<VisualizationCategory, CategoryMeta> = {
  health: {
    id: 'health',
    displayName: 'Health & Fitness',
    color: '#3DB87A',
    icon: '[+]',
  },
  finance: {
    id: 'finance',
    displayName: 'Finance',
    color: '#C9A85C',
    icon: '[$]',
  },
  social: {
    id: 'social',
    displayName: 'Social & Messaging',
    color: '#8B5CF6',
    icon: '[@]',
  },
  work: {
    id: 'work',
    displayName: 'Work & Productivity',
    color: '#4A7FBA',
    icon: '[>]',
  },
  reading: {
    id: 'reading',
    displayName: 'Reading & Research',
    color: '#C97B6E',
    icon: '[R]',
  },
  music: {
    id: 'music',
    displayName: 'Music & Entertainment',
    color: '#EC4899',
    icon: '[~]',
  },
  cloud: {
    id: 'cloud',
    displayName: 'Cloud Storage',
    color: '#8B93A7',
    icon: '[C]',
  },
  browser: {
    id: 'browser',
    displayName: 'Browsing',
    color: '#6ECFA3',
    icon: '[/]',
  },
  people: {
    id: 'people',
    displayName: 'People',
    color: '#4A7FBA',
    icon: '[P]',
  },
  knowledge: {
    id: 'knowledge',
    displayName: 'Documents & Notes',
    color: '#8B93A7',
    icon: '[D]',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get the visualization category for a connector ID. Returns null for unknown IDs. */
export function getVisualizationCategory(connectorId: string): VisualizationCategory | null {
  return CONNECTOR_TO_CATEGORY[connectorId] ?? null;
}

/**
 * Map an entity type (+ optional metadata) to a visualization category.
 *
 * Note: event/reminder → work is a v1 simplification. A personal birthday
 * event gets categorized as "work." Acceptable for v1 — the existing domain
 * classification handles some disambiguation. Flag for revisit post-launch.
 */
export function getCategoryForEntityType(
  type: VisualizationEntityType,
  metadata?: Record<string, unknown>,
): VisualizationCategory {
  switch (type) {
    case 'person':
    case 'email_thread':
      return 'people';

    case 'topic':
      return 'knowledge';

    case 'document': {
      const source = metadata?.source as string | undefined;
      if (source === 'financial') return 'finance';
      if (source === 'health') return 'health';
      if (source === 'browser_history') return 'browser';
      return 'knowledge';
    }

    case 'event':
    case 'reminder':
      return 'work';

    case 'location':
      return 'people';

    case 'category':
      // Category nodes are synthetic — should not be re-categorized
      return 'knowledge';

    default:
      return 'knowledge';
  }
}

/** Get all 10 visualization categories in stable order. */
export function getAllCategories(): VisualizationCategory[] {
  return [
    'health', 'finance', 'social', 'work', 'reading',
    'music', 'cloud', 'browser', 'people', 'knowledge',
  ];
}
