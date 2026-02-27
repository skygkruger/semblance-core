/**
 * Parser Registration — Registers all import parsers with the ImportPipeline at startup.
 *
 * This file is the single point where all parsers are wired into production code.
 * Previously parsers were only registered in tests — this ensures they're available
 * at app startup.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type { ImportPipeline } from './import-pipeline.js';
import type { ImportParser } from './types.js';

// ─── Existing Parsers ─────────────────────────────────────────────────────────
import { ChromeHistoryParser } from './browser/chrome-history-parser.js';
import { FirefoxHistoryParser } from './browser/firefox-history-parser.js';
import { ObsidianParser } from './notes/obsidian-parser.js';
import { AppleNotesParser } from './notes/apple-notes-parser.js';
import { WhatsAppParser } from './messaging/whatsapp-parser.js';
import { ExifParser } from './photos/exif-parser.js';
import { TwitterArchiveParser } from './social/twitter-archive-parser.js';
import { LinkedInExportParser } from './social/linkedin-export-parser.js';

// ─── Phase 6 Batch 1 Parsers ─────────────────────────────────────────────────
import { NotionExportParser } from './notes/notion-export-parser.js';
import { FacebookExportParser } from './social/facebook-export-parser.js';
import { InstagramExportParser } from './social/instagram-export-parser.js';
import { SignalExportParser } from './messaging/signal-export-parser.js';
import { DiscordExportParser } from './social/discord-export-parser.js';
import { SlackExportParser } from './productivity/slack-export-parser.js';
import { BearExportParser } from './notes/bear-export-parser.js';

// ─── Phase 6 Batch 2 Parsers ─────────────────────────────────────────────────
import { EvernoteExportParser } from './notes/evernote-export-parser.js';
import { YnabExportParser } from './finance/ynab-export-parser.js';
import { MintExportParser } from './finance/mint-export-parser.js';
import { GoogleTakeoutParser } from './google/google-takeout-parser.js';
import { GoodreadsExportParser } from './media/goodreads-export-parser.js';
import { StravaExportParser } from './fitness/strava-export-parser.js';
import { TelegramExportParser } from './messaging/telegram-export-parser.js';

// ─── Phase 2 Native Connectors ──────────────────────────────────────────────
import { DesktopIMessageReader } from '../platform/desktop-imessage-reader.js';
import { SafariHistoryParser } from './browser/safari-history-parser.js';
import { EdgeHistoryParser } from './browser/edge-history-parser.js';
import { ArcHistoryParser } from './browser/arc-history-parser.js';
import { AppleHealthXmlParser } from './health/apple-health-xml-parser.js';
import { ZoteroReader } from './research/zotero-reader.js';
import { ThingsReader } from './productivity/things-reader.js';

/**
 * Create instances of all available parsers.
 * Returns them as an array for flexible registration.
 */
export function createAllParsers(): ImportParser[] {
  return [
    // Browser history
    new ChromeHistoryParser(),
    new FirefoxHistoryParser(),
    // Notes
    new ObsidianParser(),
    new AppleNotesParser(),
    new NotionExportParser(),
    new BearExportParser(),
    // Messaging
    new WhatsAppParser(),
    new SignalExportParser(),
    // Photos
    new ExifParser(),
    // Social
    new TwitterArchiveParser(),
    new LinkedInExportParser(),
    new FacebookExportParser(),
    new InstagramExportParser(),
    new DiscordExportParser(),
    // Productivity
    new SlackExportParser(),
    // Notes (cont.)
    new EvernoteExportParser(),
    // Finance
    new YnabExportParser(),
    new MintExportParser(),
    // Google
    new GoogleTakeoutParser(),
    // Media
    new GoodreadsExportParser(),
    // Fitness
    new StravaExportParser(),
    // Messaging (cont.)
    new TelegramExportParser(),
    // Productivity (cont.)
    new ThingsReader(),
    // ─── Phase 2 Native Connectors ──────────────────────────────────────
    // Browser history (native SQLite readers)
    new SafariHistoryParser(),
    new EdgeHistoryParser(),
    new ArcHistoryParser(),
    // Messaging (native OS reader — requires explicit consent)
    new DesktopIMessageReader(),
    // Health
    new AppleHealthXmlParser(),
    // Research
    new ZoteroReader(),
  ];
}

/**
 * Register all available parsers with an ImportPipeline instance.
 * Call this at app startup to ensure all parsers are available.
 */
export function registerAllParsers(pipeline: ImportPipeline): void {
  const parsers = createAllParsers();
  for (const parser of parsers) {
    pipeline.registerParser(parser);
  }
}
