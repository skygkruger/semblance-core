/**
 * Signal Export Parser — Parses Signal backup exports.
 *
 * Signal doesn't have a native export feature, but third-party tools like
 * signal-back (https://github.com/xeals/signal-back) and Signal Desktop
 * plaintext backup tools produce JSON files with message data.
 *
 * Expected JSON structure (signal-back format):
 * {
 *   "messages": [
 *     {
 *       "conversationId": "abc123",
 *       "body": "Hello!",
 *       "timestamp": 1674834600000,
 *       "type": "incoming" | "outgoing",
 *       "source": "+1234567890",
 *       "sourceDevice": 1,
 *       "hasAttachments": false,
 *       "conversationName": "John Doe"
 *     }
 *   ]
 * }
 *
 * Also supports array-at-root format where the JSON file is just an array of messages.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `sig_${hash}`;
}

interface SignalMessage {
  conversationId?: string;
  body?: string;
  timestamp?: number;
  type?: string;        // 'incoming', 'outgoing', 'group'
  source?: string;      // phone number or UUID
  sourceDevice?: number;
  hasAttachments?: boolean;
  attachments?: Array<{
    contentType?: string;
    fileName?: string;
    size?: number;
  }>;
  conversationName?: string;
  groupName?: string;
  // Some exporters use different field names
  address?: string;     // alternative to source
  date?: number;        // alternative to timestamp
  text?: string;        // alternative to body
  sent?: boolean;       // alternative to type
}

interface SignalExportFile {
  messages?: SignalMessage[];
  // Some formats include metadata
  metadata?: {
    exportDate?: string;
    version?: string;
  };
}

/**
 * Determine if an object looks like a Signal message.
 */
function isSignalMessage(obj: unknown): obj is SignalMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  // Must have at least a body/text and some form of timestamp
  const hasContent = typeof msg['body'] === 'string' || typeof msg['text'] === 'string';
  const hasTimestamp = typeof msg['timestamp'] === 'number' || typeof msg['date'] === 'number';
  return hasContent && hasTimestamp;
}

/**
 * Normalize a Signal message from various export formats into a consistent shape.
 */
function normalizeMessage(raw: SignalMessage): {
  conversationId: string;
  body: string;
  timestamp: number;
  type: string;
  source: string;
  conversationName: string;
  hasAttachments: boolean;
} {
  return {
    conversationId: raw.conversationId ?? raw.address ?? 'unknown',
    body: raw.body ?? raw.text ?? '',
    timestamp: raw.timestamp ?? raw.date ?? 0,
    type: raw.type ?? (raw.sent === true ? 'outgoing' : raw.sent === false ? 'incoming' : 'unknown'),
    source: raw.source ?? raw.address ?? 'unknown',
    conversationName: raw.conversationName ?? raw.groupName ?? raw.source ?? raw.address ?? 'Unknown',
    hasAttachments: raw.hasAttachments ?? (Array.isArray(raw.attachments) && raw.attachments.length > 0),
  };
}

export class SignalExportParser implements ImportParser {
  readonly sourceType = 'messaging' as const;
  readonly supportedFormats = ['signal_export'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Accept .json files that look like Signal exports
    if (lowerPath.endsWith('.json')) {
      if (data) {
        try {
          const parsed = JSON.parse(data);

          // Object with messages array
          if (parsed?.messages && Array.isArray(parsed.messages)) {
            if (parsed.messages.length === 0) return true; // empty but valid structure
            return isSignalMessage(parsed.messages[0]);
          }

          // Array at root
          if (Array.isArray(parsed) && parsed.length > 0) {
            return isSignalMessage(parsed[0]);
          }

          return false;
        } catch {
          return false;
        }
      }

      // Heuristic: path contains signal-related name
      return lowerPath.includes('signal') || lowerPath.includes('messages.json');
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      rawData = safeReadFileSync(path);
    } catch (err) {
      return {
        format: 'signal_export',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return {
        format: 'signal_export',
        items: [],
        errors: [{ message: 'Invalid JSON format' }],
        totalFound: 0,
      };
    }

    // Extract messages array from either format
    let rawMessages: unknown[];
    if (Array.isArray(parsed)) {
      rawMessages = parsed;
    } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as SignalExportFile).messages)) {
      rawMessages = (parsed as SignalExportFile).messages!;
    } else {
      return {
        format: 'signal_export',
        items: [],
        errors: [{ message: 'No messages array found in file' }],
        totalFound: 0,
      };
    }

    const totalFound = rawMessages.length;
    let items: ImportedItem[] = [];

    for (let i = 0; i < rawMessages.length; i++) {
      const raw = rawMessages[i];

      if (!isSignalMessage(raw)) {
        errors.push({ message: `Invalid message format at index ${i}`, index: i });
        continue;
      }

      const msg = normalizeMessage(raw);

      if (!msg.body) {
        // Skip empty messages (unless they have attachments)
        if (!msg.hasAttachments) continue;
      }

      const timestamp = new Date(msg.timestamp);
      if (isNaN(timestamp.getTime())) {
        errors.push({ message: `Invalid timestamp ${msg.timestamp} at index ${i}`, index: i });
        continue;
      }

      // Apply since filter
      if (options?.since && timestamp < options.since) {
        continue;
      }

      const displayText = msg.body || (msg.hasAttachments ? '[Attachment]' : '[Empty message]');
      const titlePrefix = msg.type === 'outgoing' ? 'To' : 'From';

      items.push({
        id: deterministicId(msg.conversationId, String(msg.timestamp), msg.source),
        sourceType: 'messaging',
        title: `${titlePrefix} ${msg.conversationName}: ${displayText.slice(0, 50)}`,
        content: displayText,
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'signal',
          type: msg.type,
          conversation_id: msg.conversationId,
          conversation_name: msg.conversationName,
          source: msg.source,
          has_attachments: msg.hasAttachments,
          direction: msg.type === 'outgoing' ? 'sent' : 'received',
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
      format: 'signal_export',
      items,
      errors,
      totalFound,
    };
  }
}
