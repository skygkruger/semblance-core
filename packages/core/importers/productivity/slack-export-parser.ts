/**
 * Slack Export Parser — Parses Slack workspace export (extracted ZIP directory).
 *
 * Slack workspace exports have the structure:
 *   channels.json — Array of channel metadata
 *   users.json — Array of user metadata
 *   <channel-name>/
 *     2023-01-15.json — Messages for that date
 *     2023-01-16.json — Messages for the next date
 *     ...
 *
 * Each daily message file is a JSON array:
 * [
 *   {
 *     "type": "message",
 *     "user": "U1234ABCD",
 *     "text": "Hello world!",
 *     "ts": "1674834600.123456",
 *     "reactions": [{ "name": "thumbsup", "count": 2, "users": ["U1234"] }],
 *     "reply_count": 3,
 *     "thread_ts": "1674834600.123456",
 *     "attachments": [...],
 *     "files": [...]
 *   }
 * ]
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `slk_${hash}`;
}

// Slack date file pattern: YYYY-MM-DD.json
const DATE_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.json$/;

interface SlackChannel {
  id?: string;
  name?: string;
  purpose?: { value?: string };
  topic?: { value?: string };
  is_archived?: boolean;
  created?: number;
  members?: string[];
}

interface SlackUser {
  id?: string;
  name?: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    image_72?: string;
  };
  is_bot?: boolean;
  deleted?: boolean;
}

interface SlackReaction {
  name?: string;
  count?: number;
  users?: string[];
}

interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: SlackReaction[];
  attachments?: Array<{
    title?: string;
    text?: string;
    fallback?: string;
  }>;
  files?: Array<{
    name?: string;
    title?: string;
    mimetype?: string;
    size?: number;
  }>;
  bot_id?: string;
  username?: string; // For bot messages
}

/**
 * Convert Slack-style mrkdwn user references (<@U1234ABCD>) to readable names.
 */
function resolveUserReferences(text: string, userMap: Map<string, string>): string {
  return text.replace(/<@(U[A-Z0-9]+)>/g, (_, userId: string) => {
    const name = userMap.get(userId);
    return name ? `@${name}` : `@${userId}`;
  });
}

/**
 * Convert Slack timestamp (e.g., "1674834600.123456") to a JS Date.
 * The integer part is seconds since epoch; the decimal part is microseconds.
 */
function slackTsToDate(ts: string): Date | null {
  const secondsPart = parseFloat(ts);
  if (isNaN(secondsPart)) return null;
  const date = new Date(secondsPart * 1000);
  return isNaN(date.getTime()) ? null : date;
}

export class SlackExportParser implements ImportParser {
  readonly sourceType = 'productivity' as const;
  readonly supportedFormats = ['slack_export'];

  canParse(path: string): boolean {
    try {
      const { statSync, existsSync, readdirSync } = require('node:fs') as typeof import('node:fs');
      const { join } = require('node:path') as typeof import('node:path');

      const stat = statSync(path);
      if (!stat.isDirectory()) return false;

      // Must have channels.json
      if (!existsSync(join(path, 'channels.json'))) return false;

      // Should have at least one subdirectory with date-named JSON files
      const entries = readdirSync(path);
      for (const entry of entries) {
        const entryPath = join(path, entry);
        try {
          const entryStat = statSync(entryPath);
          if (entryStat.isDirectory()) {
            const subFiles = readdirSync(entryPath) as string[];
            if (subFiles.some((f: string) => DATE_FILE_PATTERN.test(f))) {
              return true;
            }
          }
        } catch {
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { statSync, existsSync, readdirSync, lstatSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Verify the path is a directory
    try {
      const stat = statSync(path);
      if (!stat.isDirectory()) {
        return {
          format: 'slack_export',
          items: [],
          errors: [{ message: `Path is not a directory: ${path}` }],
          totalFound: 0,
        };
      }
    } catch (err) {
      return {
        format: 'slack_export',
        items: [],
        errors: [{ message: `Cannot access path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    // Load user map for name resolution
    const userMap = new Map<string, string>();
    const usersPath = join(path, 'users.json');
    if (existsSync(usersPath)) {
      try {
        const usersRaw = safeReadFileSync(usersPath);
        const users = JSON.parse(usersRaw) as SlackUser[];
        if (Array.isArray(users)) {
          for (const user of users) {
            if (user.id) {
              const displayName = user.profile?.display_name
                || user.profile?.real_name
                || user.real_name
                || user.name
                || user.id;
              userMap.set(user.id, displayName);
            }
          }
        }
      } catch (err) {
        errors.push({ message: `Failed to parse users.json: ${(err as Error).message}` });
      }
    }

    // Load channels metadata
    const channelMap = new Map<string, SlackChannel>();
    const channelsPath = join(path, 'channels.json');
    if (existsSync(channelsPath)) {
      try {
        const channelsRaw = safeReadFileSync(channelsPath);
        const channels = JSON.parse(channelsRaw) as SlackChannel[];
        if (Array.isArray(channels)) {
          for (const ch of channels) {
            if (ch.name) {
              channelMap.set(ch.name, ch);
            }
          }
        }
      } catch (err) {
        errors.push({ message: `Failed to parse channels.json: ${(err as Error).message}` });
      }
    }

    let totalFound = 0;
    let items: ImportedItem[] = [];

    // Iterate over channel directories
    const rootEntries = readdirSync(path);
    for (const entry of rootEntries) {
      const channelDir = join(path, entry);
      try {
        // Use lstatSync to detect symlinks before following
        const lstat = lstatSync(channelDir);
        if (lstat.isSymbolicLink()) continue; // Skip symlinks for safety
        if (!lstat.isDirectory()) continue;

        // Skip hidden directories and metadata files
        if (entry.startsWith('.')) continue;

        const channelName = entry;
        const channelMeta = channelMap.get(channelName);

        // Read all date JSON files in this channel
        const dateFiles = readdirSync(channelDir)
          .filter((f: string) => DATE_FILE_PATTERN.test(f))
          .sort(); // Sort chronologically

        for (const dateFile of dateFiles) {
          const filePath = join(channelDir, dateFile);

          try {
            const raw = safeReadFileSync(filePath);
            const messages = JSON.parse(raw) as SlackMessage[];

            if (!Array.isArray(messages)) {
              errors.push({ message: `Expected array in ${filePath}` });
              continue;
            }

            totalFound += messages.length;

            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i]!;

              // Skip non-message types and subtypes like channel_join, channel_leave
              if (msg.type !== 'message') continue;
              if (msg.subtype === 'channel_join' || msg.subtype === 'channel_leave' ||
                  msg.subtype === 'channel_purpose' || msg.subtype === 'channel_topic') {
                continue;
              }

              if (!msg.ts) {
                errors.push({ message: `Missing timestamp in ${filePath} at index ${i}`, index: i });
                continue;
              }

              const timestamp = slackTsToDate(msg.ts);
              if (!timestamp) {
                errors.push({ message: `Invalid timestamp "${msg.ts}" in ${filePath}`, index: i });
                continue;
              }

              // Apply since filter
              if (options?.since && timestamp < options.since) {
                continue;
              }

              // Get readable text
              let text = msg.text ?? '';
              text = resolveUserReferences(text, userMap);

              // Include attachment text
              if (msg.attachments) {
                for (const att of msg.attachments) {
                  const attText = att.text || att.fallback || att.title || '';
                  if (attText) text += `\n[Attachment: ${attText}]`;
                }
              }

              // Skip empty messages
              if (!text.trim() && !(msg.files && msg.files.length > 0)) {
                continue;
              }

              // Resolve author name
              const authorName = msg.user
                ? (userMap.get(msg.user) ?? msg.user)
                : (msg.username ?? 'bot');

              const isBot = !!msg.bot_id || msg.subtype === 'bot_message';
              const isThread = msg.thread_ts !== undefined && msg.thread_ts !== msg.ts;

              // File attachments
              const fileNames = msg.files?.map(f => f.name || f.title || 'file') ?? [];

              if (fileNames.length > 0 && !text.trim()) {
                text = `[Files: ${fileNames.join(', ')}]`;
              } else if (fileNames.length > 0) {
                text += `\n[Files: ${fileNames.join(', ')}]`;
              }

              // Reactions
              const reactionSummary = msg.reactions
                ? msg.reactions.map(r => `:${r.name}: ${r.count ?? 0}`).join(', ')
                : null;

              items.push({
                id: deterministicId(channelName, msg.ts),
                sourceType: 'productivity',
                title: `${authorName} in #${channelName}: ${text.slice(0, 50)}`,
                content: text.trim(),
                timestamp: timestamp.toISOString(),
                metadata: {
                  platform: 'slack',
                  type: msg.subtype ?? 'message',
                  channel_name: channelName,
                  channel_id: channelMeta?.id ?? null,
                  channel_purpose: channelMeta?.purpose?.value ?? null,
                  author_name: authorName,
                  author_id: msg.user ?? null,
                  is_bot: isBot,
                  is_thread: isThread,
                  thread_ts: msg.thread_ts ?? null,
                  reply_count: msg.reply_count ?? 0,
                  reactions: reactionSummary,
                  file_count: fileNames.length,
                  ts: msg.ts,
                },
              });
            }
          } catch (err) {
            errors.push({ message: `Failed to parse ${filePath}: ${(err as Error).message}` });
          }
        }
      } catch {
        // Entry not a readable directory — skip
        continue;
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'slack_export',
      items,
      errors,
      totalFound,
    };
  }
}
