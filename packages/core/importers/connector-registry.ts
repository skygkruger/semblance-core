/**
 * Connector Registry — Catalog of all available connectors with metadata.
 *
 * Pure data — no network, no side effects. Used by the Connections UI
 * to display available connectors and by the ConnectorRouter to validate IDs.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type {
  ConnectorDefinition,
  ConnectorCategory,
  ConnectorPlatform,
} from './connector-status.js';

export class ConnectorRegistry {
  private connectors: Map<string, ConnectorDefinition> = new Map();

  /** Register a connector definition. */
  register(definition: ConnectorDefinition): void {
    this.connectors.set(definition.id, definition);
  }

  /** Get a connector by ID. */
  get(id: string): ConnectorDefinition | undefined {
    return this.connectors.get(id);
  }

  /** Check if a connector is registered. */
  has(id: string): boolean {
    return this.connectors.has(id);
  }

  /** List all registered connectors. */
  listAll(): ConnectorDefinition[] {
    return Array.from(this.connectors.values());
  }

  /** List connectors by category. */
  listByCategory(category: ConnectorCategory): ConnectorDefinition[] {
    return this.listAll().filter(c => c.category === category);
  }

  /** List connectors available for a specific platform. */
  listByPlatform(platform: ConnectorPlatform): ConnectorDefinition[] {
    return this.listAll().filter(
      c => c.platform === 'all' || c.platform === platform,
    );
  }

  /** List premium-only connectors. */
  listPremium(): ConnectorDefinition[] {
    return this.listAll().filter(c => c.isPremium);
  }

  /** List free connectors. */
  listFree(): ConnectorDefinition[] {
    return this.listAll().filter(c => !c.isPremium);
  }

  /** Get all unique categories that have registered connectors. */
  getCategories(): ConnectorCategory[] {
    const categories = new Set<ConnectorCategory>();
    for (const c of this.connectors.values()) {
      categories.add(c.category);
    }
    return Array.from(categories);
  }

  /** Total number of registered connectors. */
  get size(): number {
    return this.connectors.size;
  }
}

/**
 * Create a ConnectorRegistry pre-populated with all built-in connector definitions.
 */
export function createDefaultConnectorRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();

  // ─── Cloud Storage ──────────────────────────────────────────────────────────
  registry.register({
    id: 'google-drive',
    displayName: 'Google Drive',
    description: 'Access documents, spreadsheets, and files from Google Drive',
    category: 'cloud_storage',
    authType: 'oauth2',
    platform: 'all',
    isPremium: false,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'dropbox',
    displayName: 'Dropbox',
    description: 'Access files and documents stored in Dropbox',
    category: 'cloud_storage',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'onedrive',
    displayName: 'OneDrive',
    description: 'Access files from Microsoft OneDrive via Graph API',
    category: 'cloud_storage',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'box',
    displayName: 'Box',
    description: 'Access files from Box cloud storage',
    category: 'cloud_storage',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });

  // ─── Productivity ───────────────────────────────────────────────────────────
  registry.register({
    id: 'notion',
    displayName: 'Notion',
    description: 'Sync pages and databases from your Notion workspace',
    category: 'productivity',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 12,
  });
  registry.register({
    id: 'todoist',
    displayName: 'Todoist',
    description: 'Sync tasks, projects, and completed history from Todoist',
    category: 'productivity',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'things',
    displayName: 'Things 3',
    description: 'Read tasks, projects, and tags from Things 3 database',
    category: 'productivity',
    authType: 'native',
    platform: 'macos',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'harvest',
    displayName: 'Harvest',
    description: 'Time entries and invoices from Harvest time tracking',
    category: 'productivity',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'slack-export',
    displayName: 'Slack (Export)',
    description: 'Import messages from a Slack workspace export ZIP',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Developer ──────────────────────────────────────────────────────────────
  registry.register({
    id: 'github',
    displayName: 'GitHub',
    description: 'Repos, commits, issues, pull requests, and starred repos',
    category: 'developer',
    authType: 'pkce',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 12,
  });

  // ─── Reading & Research ─────────────────────────────────────────────────────
  registry.register({
    id: 'readwise',
    displayName: 'Readwise',
    description: 'Highlights, books, articles, and tags from Readwise',
    category: 'reading_research',
    authType: 'api_key',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 24,
  });
  registry.register({
    id: 'pocket',
    displayName: 'Pocket',
    description: 'Saved articles, tags, and favorites from Pocket',
    category: 'reading_research',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 12,
  });
  registry.register({
    id: 'instapaper',
    displayName: 'Instapaper',
    description: 'Saved articles and highlights from Instapaper',
    category: 'reading_research',
    authType: 'oauth1a',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 12,
  });
  registry.register({
    id: 'zotero',
    displayName: 'Zotero',
    description: 'Papers, tags, collections, and annotations from Zotero',
    category: 'reading_research',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'mendeley',
    displayName: 'Mendeley',
    description: 'Research papers and annotations from Mendeley',
    category: 'reading_research',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 24,
  });
  registry.register({
    id: 'goodreads-export',
    displayName: 'Goodreads (Export)',
    description: 'Import your book library from Goodreads CSV export',
    category: 'reading_research',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Health & Fitness ───────────────────────────────────────────────────────
  registry.register({
    id: 'oura',
    displayName: 'Oura',
    description: 'Sleep, readiness, HRV, and activity data from Oura Ring',
    category: 'health_fitness',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'whoop',
    displayName: 'Whoop',
    description: 'Recovery, strain, sleep, and workout data from Whoop',
    category: 'health_fitness',
    authType: 'pkce',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'fitbit',
    displayName: 'Fitbit',
    description: 'Steps, sleep, heart rate, and weight from Fitbit',
    category: 'health_fitness',
    authType: 'pkce',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'strava',
    displayName: 'Strava',
    description: 'Activity summaries from Strava (no raw GPS data)',
    category: 'health_fitness',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'garmin',
    displayName: 'Garmin Connect',
    description: 'Activities, steps, sleep, Body Battery, HRV, and stress from Garmin',
    category: 'health_fitness',
    authType: 'oauth1a',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'apple-health-export',
    displayName: 'Apple Health (Export)',
    description: 'Import health data from Apple Health export.xml',
    category: 'health_fitness',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'toggl',
    displayName: 'Toggl Track',
    description: 'Time entries, projects, and clients from Toggl',
    category: 'health_fitness',
    authType: 'api_key',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'rescuetime',
    displayName: 'RescueTime',
    description: 'Daily productivity summaries from RescueTime',
    category: 'health_fitness',
    authType: 'api_key',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 24,
  });
  registry.register({
    id: 'strava-export',
    displayName: 'Strava (Export)',
    description: 'Import activities from Strava bulk export ZIP',
    category: 'health_fitness',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Social ─────────────────────────────────────────────────────────────────
  registry.register({
    id: 'slack-oauth',
    displayName: 'Slack (Live)',
    description: 'Live channel and DM messages from Slack workspace',
    category: 'social',
    authType: 'oauth2',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'facebook-export',
    displayName: 'Facebook (Export)',
    description: 'Import posts and activity from Facebook data export',
    category: 'social',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'instagram-export',
    displayName: 'Instagram (Export)',
    description: 'Import posts from Instagram data export',
    category: 'social',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'twitter-export',
    displayName: 'Twitter/X (Export)',
    description: 'Import tweets and bookmarks from Twitter/X archive',
    category: 'social',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'linkedin-export',
    displayName: 'LinkedIn (Export)',
    description: 'Import connections and posts from LinkedIn data export',
    category: 'social',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'discord-export',
    displayName: 'Discord (Export)',
    description: 'Import messages from DiscordChatExporter JSON',
    category: 'social',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Music & Entertainment ──────────────────────────────────────────────────
  registry.register({
    id: 'spotify',
    displayName: 'Spotify',
    description: 'Recently played, library, playlists, and top tracks',
    category: 'music_entertainment',
    authType: 'pkce',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 6,
  });
  registry.register({
    id: 'lastfm',
    displayName: 'Last.fm',
    description: 'Full scrobble history and loved tracks from Last.fm',
    category: 'music_entertainment',
    authType: 'api_key',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 24,
  });
  registry.register({
    id: 'letterboxd',
    displayName: 'Letterboxd',
    description: 'Films watched, ratings, and diary entries',
    category: 'music_entertainment',
    authType: 'api_key',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 24,
  });

  // ─── Finance ────────────────────────────────────────────────────────────────
  registry.register({
    id: 'ynab-export',
    displayName: 'YNAB (Export)',
    description: 'Import budget and transactions from YNAB export ZIP',
    category: 'finance',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'mint-export',
    displayName: 'Mint (Export)',
    description: 'Import transactions from Mint CSV export',
    category: 'finance',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Messaging ──────────────────────────────────────────────────────────────
  registry.register({
    id: 'imessage',
    displayName: 'iMessage',
    description: 'Read messages from the local iMessage database (requires Full Disk Access)',
    category: 'messaging',
    authType: 'native',
    platform: 'macos',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'signal-export',
    displayName: 'Signal (Export)',
    description: 'Import messages from Signal backup export',
    category: 'messaging',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'whatsapp-export',
    displayName: 'WhatsApp (Export)',
    description: 'Import chat history from WhatsApp text export',
    category: 'messaging',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'telegram-export',
    displayName: 'Telegram (Export)',
    description: 'Import messages from Telegram data export JSON',
    category: 'messaging',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Browser History (Native) ───────────────────────────────────────────────
  registry.register({
    id: 'safari-history',
    displayName: 'Safari',
    description: 'Read browsing history from Safari database (requires Full Disk Access)',
    category: 'productivity',
    authType: 'native',
    platform: 'macos',
    isPremium: false,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'edge-history',
    displayName: 'Microsoft Edge',
    description: 'Read browsing history from Edge Chromium database',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: false,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'arc-history',
    displayName: 'Arc',
    description: 'Read browsing history from Arc browser database',
    category: 'productivity',
    authType: 'native',
    platform: 'macos',
    isPremium: false,
    syncIntervalHours: 0,
  });

  // ─── Notes (Native) ────────────────────────────────────────────────────────
  registry.register({
    id: 'obsidian',
    displayName: 'Obsidian',
    description: 'Import markdown notes with wiki-link relationships from Obsidian vault',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: false,
    syncIntervalHours: 0,
  });

  // ─── Google ─────────────────────────────────────────────────────────────────
  registry.register({
    id: 'google-takeout',
    displayName: 'Google Takeout',
    description: 'Import Location, YouTube, Maps, and Search history from Google Takeout',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  // ─── Notes Export ───────────────────────────────────────────────────────────
  registry.register({
    id: 'notion-export',
    displayName: 'Notion (Export)',
    description: 'Import pages from Notion workspace export ZIP',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'bear-export',
    displayName: 'Bear (Export)',
    description: 'Import notes from Bear markdown export',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });
  registry.register({
    id: 'evernote-export',
    displayName: 'Evernote (Export)',
    description: 'Import notes from Evernote ENEX XML export',
    category: 'productivity',
    authType: 'native',
    platform: 'all',
    isPremium: true,
    syncIntervalHours: 0,
  });

  return registry;
}
