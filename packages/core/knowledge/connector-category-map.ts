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
  | 'email'
  | 'calendar'
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
  'slack': 'social',
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

  // Email & Calendar — default to knowledge (spans all categories);
  // entity resolution and topic analysis provide more specific categorization
  'gmail': 'email',
  'google-calendar': 'calendar',

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
  email: {
    id: 'email',
    displayName: 'Email',
    color: '#4A90D9',
    icon: '[@]',
  },
  calendar: {
    id: 'calendar',
    displayName: 'Calendar',
    color: '#E6A347',
    icon: '[#]',
  },
  health: {
    id: 'health',
    displayName: 'Health & Fitness',
    color: '#3DB87A',
    icon: '[+]',
  },
  finance: {
    id: 'finance',
    displayName: 'Finance',
    color: '#EDDD52',
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
    color: '#5B8FB9',
    icon: '[>]',
  },
  reading: {
    id: 'reading',
    displayName: 'Reading & Research',
    color: '#9B8FBE',
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
    color: '#7A8BA0',
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
    color: '#9B6BCD',
    icon: '[P]',
  },
  knowledge: {
    id: 'knowledge',
    displayName: 'Documents & Notes',
    color: '#A8956E',
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
 * Events and reminders use heuristics to distinguish personal vs work:
 * personal-sounding titles (birthday, dinner, vacation, etc.) → people,
 * otherwise → work. Email threads → people (centered on who you talk to).
 */
export function getCategoryForEntityType(
  type: VisualizationEntityType,
  metadata?: Record<string, unknown>,
): VisualizationCategory {
  switch (type) {
    case 'person':
      return 'people';

    case 'email_thread':
      return 'email';

    case 'topic':
      return 'knowledge';

    case 'document': {
      const source = metadata?.source as string | undefined;
      if (source === 'email') return 'email';
      if (source === 'calendar') return 'calendar';
      if (source === 'contact') return 'people';
      if (source === 'messaging') return 'social';
      if (source === 'social') return 'social';
      if (source === 'financial') return 'finance';
      if (source === 'health') return 'health';
      if (source === 'browser_history') return 'browser';
      if (source === 'cloud_storage') return 'cloud';
      if (source === 'photos_metadata') return 'cloud';
      if (source === 'local_file') return 'knowledge';
      if (source === 'note') return 'knowledge';
      // Connector-based classification for documents ingested via connectors
      if (source) {
        const connectorCat = CONNECTOR_TO_CATEGORY[source];
        if (connectorCat) return connectorCat;
      }
      return 'knowledge';
    }

    case 'directory':
      return 'knowledge';

    case 'event':
      return 'calendar';

    case 'reminder':
      return 'calendar';

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
    'email', 'calendar', 'health', 'finance', 'social', 'work',
    'reading', 'music', 'cloud', 'browser', 'people', 'knowledge',
  ];
}
