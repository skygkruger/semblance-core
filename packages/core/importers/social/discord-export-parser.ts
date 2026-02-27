/**
 * Discord Export Parser — Parses DiscordChatExporter JSON output.
 *
 * DiscordChatExporter (https://github.com/Tyrrrz/DiscordChatExporter) produces
 * JSON files with the following structure:
 * {
 *   "guild": { "id": "...", "name": "Server Name", "iconUrl": "..." },
 *   "channel": { "id": "...", "type": "GuildTextChat", "categoryId": "...",
 *                "category": "Category Name", "name": "channel-name", "topic": "..." },
 *   "dateRange": { "after": null, "before": null },
 *   "messages": [
 *     {
 *       "id": "...",
 *       "type": "Default",
 *       "timestamp": "2023-01-15T10:30:00+00:00",
 *       "timestampEdited": null,
 *       "callEndedTimestamp": null,
 *       "isPinned": false,
 *       "content": "Hello world!",
 *       "author": { "id": "...", "name": "Username", "discriminator": "0000",
 *                   "nickname": "Nick", "isBot": false },
 *       "attachments": [],
 *       "embeds": [],
 *       "reactions": [],
 *       "mentions": []
 *     }
 *   ]
 * }
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `dsc_${hash}`;
}

interface DiscordAuthor {
  id?: string;
  name?: string;
  discriminator?: string;
  nickname?: string;
  isBot?: boolean;
  avatarUrl?: string;
}

interface DiscordAttachment {
  id?: string;
  url?: string;
  fileName?: string;
  fileSizeBytes?: number;
}

interface DiscordReaction {
  emoji?: { id?: string; name?: string; imageUrl?: string };
  count?: number;
}

interface DiscordMessage {
  id?: string;
  type?: string;
  timestamp?: string;
  timestampEdited?: string | null;
  isPinned?: boolean;
  content?: string;
  author?: DiscordAuthor;
  attachments?: DiscordAttachment[];
  embeds?: unknown[];
  reactions?: DiscordReaction[];
  mentions?: DiscordAuthor[];
  reference?: { messageId?: string; channelId?: string; guildId?: string };
}

interface DiscordGuild {
  id?: string;
  name?: string;
  iconUrl?: string;
}

interface DiscordChannel {
  id?: string;
  type?: string;
  categoryId?: string;
  category?: string;
  name?: string;
  topic?: string;
}

interface DiscordExportFile {
  guild?: DiscordGuild;
  channel?: DiscordChannel;
  dateRange?: { after?: string | null; before?: string | null };
  messages?: DiscordMessage[];
  messageCount?: number;
}

export class DiscordExportParser implements ImportParser {
  readonly sourceType = 'social' as const;
  readonly supportedFormats = ['discord_export'];

  canParse(path: string, data?: string): boolean {
    if (!path.endsWith('.json') && !data) return false;

    if (data) {
      try {
        const parsed = JSON.parse(data);
        // DiscordChatExporter format has guild, channel, and messages
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray(parsed.messages) &&
          (parsed.channel !== undefined || parsed.guild !== undefined)
        );
      } catch {
        return false;
      }
    }

    // Heuristic: path contains discord
    const lowerPath = path.toLowerCase();
    return lowerPath.includes('discord');
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      rawData = safeReadFileSync(path);
    } catch (err) {
      return {
        format: 'discord_export',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    let parsed: DiscordExportFile;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return {
        format: 'discord_export',
        items: [],
        errors: [{ message: 'Invalid JSON format' }],
        totalFound: 0,
      };
    }

    if (!Array.isArray(parsed.messages)) {
      return {
        format: 'discord_export',
        items: [],
        errors: [{ message: 'Missing "messages" array in Discord export' }],
        totalFound: 0,
      };
    }

    const guildName = parsed.guild?.name ?? 'Unknown Server';
    const guildId = parsed.guild?.id ?? 'unknown';
    const channelName = parsed.channel?.name ?? 'unknown-channel';
    const channelId = parsed.channel?.id ?? 'unknown';
    const channelCategory = parsed.channel?.category ?? null;
    const channelTopic = parsed.channel?.topic ?? null;

    const messages = parsed.messages;
    const totalFound = messages.length;
    let items: ImportedItem[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;

      if (!msg.id || !msg.timestamp) {
        errors.push({ message: `Missing id or timestamp at index ${i}`, index: i });
        continue;
      }

      const timestamp = new Date(msg.timestamp);
      if (isNaN(timestamp.getTime())) {
        errors.push({ message: `Invalid timestamp "${msg.timestamp}" at index ${i}`, index: i });
        continue;
      }

      // Apply since filter
      if (options?.since && timestamp < options.since) {
        continue;
      }

      // Skip system messages with no content
      const isSystemMessage = msg.type !== 'Default' && msg.type !== 'Reply';
      if (isSystemMessage && !msg.content) {
        continue;
      }

      const authorName = msg.author?.nickname ?? msg.author?.name ?? 'Unknown';
      const isBot = msg.author?.isBot ?? false;

      // Build content
      const contentParts: string[] = [];
      if (msg.content) contentParts.push(msg.content);

      // Note attachments
      const attachments = msg.attachments ?? [];
      if (attachments.length > 0) {
        const attachDesc = attachments
          .map(a => a.fileName ?? 'attachment')
          .join(', ');
        contentParts.push(`[Attachments: ${attachDesc}]`);
      }

      // Note embeds
      const embedCount = msg.embeds?.length ?? 0;
      if (embedCount > 0) {
        contentParts.push(`[${embedCount} embed${embedCount > 1 ? 's' : ''}]`);
      }

      const content = contentParts.join('\n');
      if (!content) continue;

      // Reactions summary
      const reactions = msg.reactions ?? [];
      const reactionSummary = reactions.length > 0
        ? reactions.map(r => `${r.emoji?.name ?? '?'}: ${r.count ?? 0}`).join(', ')
        : null;

      items.push({
        id: deterministicId(msg.id),
        sourceType: 'social',
        title: `${authorName} in #${channelName}: ${(msg.content ?? '').slice(0, 50)}`,
        content,
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'discord',
          type: (msg.type ?? 'Default').toLowerCase(),
          message_id: msg.id,
          guild_name: guildName,
          guild_id: guildId,
          channel_name: channelName,
          channel_id: channelId,
          channel_category: channelCategory,
          channel_topic: channelTopic,
          author_name: authorName,
          author_id: msg.author?.id ?? null,
          is_bot: isBot,
          is_pinned: msg.isPinned ?? false,
          is_edited: msg.timestampEdited !== null && msg.timestampEdited !== undefined,
          attachment_count: attachments.length,
          embed_count: embedCount,
          reactions: reactionSummary,
          is_reply: msg.reference !== undefined && msg.reference !== null,
          reply_to_message: msg.reference?.messageId ?? null,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'discord_export',
      items,
      errors,
      totalFound,
    };
  }
}
