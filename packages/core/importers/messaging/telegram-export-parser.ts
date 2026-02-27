/**
 * Telegram Export Parser -- Parses Telegram desktop export (result.json).
 *
 * Telegram data export produces result.json with structure:
 * {
 *   "personal_information": { ... },
 *   "chats": {
 *     "about": "...",
 *     "list": [
 *       {
 *         "name": "Chat Name",
 *         "type": "personal_chat" | "private_group" | "private_supergroup" | "public_supergroup" | "saved_messages",
 *         "id": 123456,
 *         "messages": [
 *           {
 *             "id": 1,
 *             "type": "message",
 *             "date": "2023-10-15T12:30:00",
 *             "date_unixtime": "1697369400",
 *             "from": "User Name",
 *             "from_id": "user123",
 *             "text": "Hello!" | [{ "type": "plain", "text": "Hello " }, { "type": "bold", "text": "world" }]
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 *
 * The `text` field can be a plain string or an array of text entities.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(chatId: string, messageId: string, date: string): string {
  const input = `${chatId}|${messageId}|${date}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `tg_${hash}`;
}

/**
 * Telegram text can be a plain string or an array of text entities:
 *   "text": "Hello world"
 *   or
 *   "text": [
 *     "Hello ",
 *     { "type": "bold", "text": "world" },
 *     { "type": "link", "text": "https://example.com" }
 *   ]
 * or even nested:
 *   "text": [
 *     "Plain text",
 *     { "type": "text_link", "text": "click here", "href": "https://..." }
 *   ]
 *
 * This function flattens the text into a plain string.
 */
function flattenText(text: unknown): string {
  if (typeof text === 'string') return text;
  if (!Array.isArray(text)) return '';

  const parts: string[] = [];
  for (const item of text) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (typeof item === 'object' && item !== null) {
      const entity = item as Record<string, unknown>;
      if (typeof entity.text === 'string') {
        parts.push(entity.text);
      }
    }
  }
  return parts.join('');
}

function parseTelegramDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Telegram format: "2023-10-15T12:30:00" (local time, no timezone)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    return null;
  } catch {
    return null;
  }
}

interface TelegramMessage {
  id: number;
  type: string;
  date: string;
  date_unixtime?: string;
  from?: string;
  from_id?: string;
  text: string | Array<string | { type: string; text: string; href?: string }>;
  reply_to_message_id?: number;
  forwarded_from?: string;
  photo?: string;
  file?: string;
  media_type?: string;
  sticker_emoji?: string;
}

interface TelegramChat {
  name: string;
  type: string;
  id: number;
  messages: TelegramMessage[];
}

interface TelegramExport {
  personal_information?: Record<string, unknown>;
  chats?: {
    about?: string;
    list?: TelegramChat[];
  };
}

export class TelegramExportParser implements ImportParser {
  readonly sourceType = 'messaging' as const;
  readonly supportedFormats = ['telegram_export'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Check for result.json filename (common Telegram export name)
    if (lowerPath.endsWith('result.json')) {
      if (data) {
        return this.validateTelegramStructure(data);
      }
      // Filename match alone is not sufficient without data;
      // only accept if the path also hints at Telegram
      return lowerPath.includes('telegram');
    }

    // Check for telegram-specific paths
    if (lowerPath.includes('telegram') && lowerPath.endsWith('.json')) {
      if (data) {
        return this.validateTelegramStructure(data);
      }
      return true;
    }

    // If data is provided, check structure regardless of filename
    if (data) {
      return this.validateTelegramStructure(data);
    }

    return false;
  }

  private validateTelegramStructure(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'object' &&
             parsed !== null &&
             typeof parsed.chats === 'object' &&
             parsed.chats !== null &&
             Array.isArray(parsed.chats.list);
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      rawData = safeReadFileSync(path);
    } catch (err) {
      return {
        format: 'telegram_export',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    let parsed: TelegramExport;
    try {
      parsed = JSON.parse(rawData) as TelegramExport;
    } catch {
      return {
        format: 'telegram_export',
        items: [],
        errors: [{ message: 'Invalid JSON format' }],
        totalFound: 0,
      };
    }

    const chatList = parsed.chats?.list;
    if (!Array.isArray(chatList)) {
      return {
        format: 'telegram_export',
        items: [],
        errors: [{ message: 'Missing chats.list array in Telegram export' }],
        totalFound: 0,
      };
    }

    let totalFound = 0;
    let items: ImportedItem[] = [];

    for (let chatIdx = 0; chatIdx < chatList.length; chatIdx++) {
      const chat = chatList[chatIdx]!;
      if (!chat.messages || !Array.isArray(chat.messages)) {
        errors.push({ message: `Chat at index ${chatIdx} has no messages array` });
        continue;
      }

      const chatName = chat.name || `Chat ${chat.id}`;
      const chatId = String(chat.id);
      const chatType = chat.type || 'unknown';

      for (let msgIdx = 0; msgIdx < chat.messages.length; msgIdx++) {
        const msg = chat.messages[msgIdx]!;

        // Only process actual messages (skip service messages like join/leave)
        if (msg.type !== 'message') continue;

        totalFound++;

        const text = flattenText(msg.text);
        // Skip empty messages (media-only with no text)
        if (!text) continue;

        const timestamp = parseTelegramDate(msg.date);
        if (options?.since && timestamp && timestamp < options.since) {
          continue;
        }

        const sender = msg.from ?? 'Unknown';
        const messageId = String(msg.id);

        items.push({
          id: deterministicId(chatId, messageId, msg.date ?? ''),
          sourceType: 'messaging',
          title: `${sender} in ${chatName}: ${text.slice(0, 60)}`,
          content: text,
          timestamp: timestamp?.toISOString() ?? new Date().toISOString(),
          metadata: {
            platform: 'telegram',
            type: 'message',
            chat_id: chatId,
            chat_name: chatName,
            chat_type: chatType,
            message_id: msg.id,
            sender: sender,
            sender_id: msg.from_id ?? null,
            is_reply: !!msg.reply_to_message_id,
            reply_to: msg.reply_to_message_id ?? null,
            is_forwarded: !!msg.forwarded_from,
            forwarded_from: msg.forwarded_from ?? null,
            has_media: !!(msg.photo || msg.file),
            media_type: msg.media_type ?? null,
          },
        });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'telegram_export',
      items,
      errors,
      totalFound,
    };
  }
}
