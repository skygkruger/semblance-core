/**
 * WhatsApp Chat Parser — Parses exported .txt chat files.
 *
 * WhatsApp exports chat history as plain text files with format:
 * [DD/MM/YYYY, HH:MM:SS] Sender Name: Message content
 * or
 * [M/D/YY, H:MM:SS AM] Sender Name: Message content
 *
 * One file = one conversation.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

// Match various WhatsApp timestamp formats
const WA_MESSAGE_REGEX = /\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+(.*?):\s+([\s\S]*?)(?=\n\[|\n?$)/g;

function deterministicId(timestamp: string, sender: string, content: string): string {
  const input = `${timestamp}|${sender}|${content.slice(0, 100)}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `wa_${hash}`;
}

function parseTimestamp(dateStr: string, timeStr: string): Date | null {
  try {
    // Normalize date separators
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    let [day, month, year] = parts.map(Number) as [number, number, number];

    // Handle 2-digit year
    if (year < 100) year += 2000;

    // Parse time
    const timeTrimmed = timeStr.trim();
    const isPM = /PM/i.test(timeTrimmed);
    const isAM = /AM/i.test(timeTrimmed);
    const timeClean = timeTrimmed.replace(/\s*[AP]M/i, '');
    const timeParts = timeClean.split(':').map(Number);
    let hours = timeParts[0] ?? 0;
    const minutes = timeParts[1] ?? 0;
    const seconds = timeParts[2] ?? 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return new Date(year, month - 1, day, hours, minutes, seconds);
  } catch {
    return null;
  }
}

function conversationIdFromPath(filePath: string): string {
  const { basename } = require('node:path');
  const name = basename(filePath, '.txt');
  return createHash('sha256').update(name).digest('hex').slice(0, 8);
}

export class WhatsAppParser implements ImportParser {
  readonly sourceType = 'messaging' as const;
  readonly supportedFormats = ['whatsapp_txt'];

  canParse(path: string, data?: string): boolean {
    if (!path.endsWith('.txt') && !data) return false;

    if (data) {
      // Check if the content matches WhatsApp format
      return WA_MESSAGE_REGEX.test(data);
    }

    return path.toLowerCase().includes('whatsapp') ||
           path.toLowerCase().includes('chat');
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      rawData = safeReadFileSync(path);
    } catch (err) {
      return {
        format: 'whatsapp_txt',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const conversationId = conversationIdFromPath(path);
    const messages: ImportedItem[] = [];
    let messageIndex = 0;

    // Reset regex state
    WA_MESSAGE_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = WA_MESSAGE_REGEX.exec(rawData)) !== null) {
      const [, dateStr, timeStr, sender, messageText] = match;
      if (!dateStr || !timeStr || !sender || !messageText) {
        errors.push({ message: 'Incomplete match', index: messageIndex });
        messageIndex++;
        continue;
      }

      const timestamp = parseTimestamp(dateStr, timeStr);
      if (!timestamp) {
        errors.push({ message: `Invalid timestamp: ${dateStr} ${timeStr}`, index: messageIndex });
        messageIndex++;
        continue;
      }

      // Apply since filter
      if (options?.since && timestamp < options.since) {
        messageIndex++;
        continue;
      }

      messages.push({
        id: deterministicId(timestamp.toISOString(), sender.trim(), messageText.trim()),
        sourceType: 'messaging',
        title: `${sender.trim()} - ${messageText.trim().slice(0, 50)}`,
        content: messageText.trim(),
        timestamp: timestamp.toISOString(),
        metadata: {
          sender: sender.trim(),
          conversation_id: conversationId,
          message_index: messageIndex,
          platform: 'whatsapp',
        },
      });

      messageIndex++;
    }

    const totalFound = messageIndex;

    // Apply limit
    let items = messages;
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'whatsapp_txt',
      items,
      errors,
      totalFound,
    };
  }
}
