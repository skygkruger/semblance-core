/**
 * Twitter/X Archive Parser — Parses Twitter data export archives.
 *
 * Twitter data exports contain JS files with a global assignment:
 *   window.YTD.tweet.part0 = [{ tweet: { id_str, full_text, created_at, ... } }, ...]
 *   window.YTD.direct_message.part0 = [{ dmConversation: { ... } }, ...]
 *   window.YTD.following.part0 = [{ following: { accountId, userLink } }, ...]
 *
 * The parser strips the `window.YTD.*.part0 = ` prefix and parses the JSON array.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

// Twitter JS file prefix pattern: window.YTD.<category>.part<n> =
const TWITTER_JS_PREFIX = /^window\.YTD\.\w+\.part\d+\s*=\s*/;

export interface TwitterTweet {
  tweet: {
    id_str: string;
    full_text: string;
    created_at: string;
    favorite_count: string;
    retweet_count: string;
    in_reply_to_screen_name?: string;
    in_reply_to_status_id_str?: string;
    entities?: {
      urls?: Array<{ expanded_url: string }>;
      hashtags?: Array<{ text: string }>;
      user_mentions?: Array<{ screen_name: string }>;
    };
  };
}

export interface TwitterDMConversation {
  dmConversation: {
    conversationId: string;
    messages: Array<{
      messageCreate?: {
        senderId: string;
        text: string;
        createdAt: string;
        mediaUrls?: string[];
      };
    }>;
  };
}

export interface TwitterFollowing {
  following: {
    accountId: string;
    userLink: string;
  };
}

function deterministicId(prefix: string, ...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `tw_${prefix}_${hash}`;
}

function parseTwitterDate(dateStr: string): Date | null {
  try {
    // Twitter format: "Mon Oct 10 20:19:24 +0000 2022"
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Strip the `window.YTD.*.part0 = ` prefix from Twitter JS export files
 * and parse the remaining JSON array.
 */
export function parseTwitterJsFile(content: string): unknown[] | null {
  const stripped = content.replace(TWITTER_JS_PREFIX, '').trim();
  // Remove trailing semicolon if present
  const cleaned = stripped.endsWith(';') ? stripped.slice(0, -1) : stripped;
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export class TwitterArchiveParser implements ImportParser {
  readonly sourceType = 'social' as const;
  readonly supportedFormats = ['twitter_js'];

  canParse(path: string, data?: string): boolean {
    const lowerPath = path.toLowerCase();

    // Accept tweet.js, tweets.js, direct-message.js, following.js, or similar
    if (lowerPath.endsWith('.js')) {
      if (data) {
        return TWITTER_JS_PREFIX.test(data);
      }
      return lowerPath.includes('tweet') ||
             lowerPath.includes('direct-message') ||
             lowerPath.includes('following');
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      const { readFileSync } = await import('node:fs');
      rawData = readFileSync(path, 'utf-8');
    } catch (err) {
      return {
        format: 'twitter_js',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const parsed = parseTwitterJsFile(rawData);
    if (!parsed) {
      return {
        format: 'twitter_js',
        items: [],
        errors: [{ message: 'Not a valid Twitter JS export file' }],
        totalFound: 0,
      };
    }

    // Detect which type of data this is
    const lowerPath = path.toLowerCase();
    if (lowerPath.includes('tweet')) {
      return this.parseTweets(parsed as TwitterTweet[], options, errors);
    } else if (lowerPath.includes('direct-message') || lowerPath.includes('direct_message')) {
      return this.parseDMs(parsed as TwitterDMConversation[], options, errors);
    } else if (lowerPath.includes('following')) {
      return this.parseFollowing(parsed as TwitterFollowing[], errors);
    }

    // Fallback: try to detect from structure
    if (parsed.length > 0) {
      const first = parsed[0] as Record<string, unknown>;
      if ('tweet' in first) return this.parseTweets(parsed as TwitterTweet[], options, errors);
      if ('dmConversation' in first) return this.parseDMs(parsed as TwitterDMConversation[], options, errors);
      if ('following' in first) return this.parseFollowing(parsed as TwitterFollowing[], errors);
    }

    return {
      format: 'twitter_js',
      items: [],
      errors: [{ message: 'Unrecognized Twitter export format' }],
      totalFound: 0,
    };
  }

  private parseTweets(
    tweets: TwitterTweet[],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    const totalFound = tweets.length;
    let items: ImportedItem[] = [];

    for (let i = 0; i < tweets.length; i++) {
      const entry = tweets[i];
      const t = entry?.tweet;
      if (!t?.id_str || !t?.full_text) {
        errors.push({ message: 'Missing tweet id_str or full_text', index: i });
        continue;
      }

      const timestamp = parseTwitterDate(t.created_at);
      if (!timestamp) {
        errors.push({ message: `Invalid timestamp: ${t.created_at}`, index: i });
        continue;
      }

      if (options?.since && timestamp < options.since) {
        continue;
      }

      const hashtags = t.entities?.hashtags?.map(h => h.text) ?? [];
      const mentions = t.entities?.user_mentions?.map(m => m.screen_name) ?? [];
      const urls = t.entities?.urls?.map(u => u.expanded_url) ?? [];

      items.push({
        id: deterministicId('tw', t.id_str),
        sourceType: 'social',
        title: t.full_text.slice(0, 80),
        content: t.full_text,
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'twitter',
          type: 'tweet',
          tweet_id: t.id_str,
          favorite_count: parseInt(t.favorite_count, 10) || 0,
          retweet_count: parseInt(t.retweet_count, 10) || 0,
          is_reply: !!t.in_reply_to_status_id_str,
          reply_to: t.in_reply_to_screen_name ?? null,
          hashtags,
          mentions,
          urls,
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'twitter_js', items, errors, totalFound };
  }

  private parseDMs(
    conversations: TwitterDMConversation[],
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): ImportResult {
    let totalFound = 0;
    let items: ImportedItem[] = [];

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i]?.dmConversation;
      if (!conv?.conversationId || !conv?.messages) {
        errors.push({ message: 'Missing DM conversation data', index: i });
        continue;
      }

      for (const msg of conv.messages) {
        const m = msg.messageCreate;
        if (!m?.text || !m?.createdAt) continue;
        totalFound++;

        const timestamp = new Date(m.createdAt);
        if (isNaN(timestamp.getTime())) {
          errors.push({ message: `Invalid DM timestamp: ${m.createdAt}`, index: totalFound });
          continue;
        }

        if (options?.since && timestamp < options.since) {
          continue;
        }

        items.push({
          id: deterministicId('dm', conv.conversationId, m.createdAt, m.senderId),
          sourceType: 'social',
          title: `DM: ${m.text.slice(0, 60)}`,
          content: m.text,
          timestamp: timestamp.toISOString(),
          metadata: {
            platform: 'twitter',
            type: 'direct_message',
            conversation_id: conv.conversationId,
            sender_id: m.senderId,
            has_media: (m.mediaUrls?.length ?? 0) > 0,
          },
        });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return { format: 'twitter_js', items, errors, totalFound };
  }

  private parseFollowing(
    following: TwitterFollowing[],
    errors: ParseError[],
  ): ImportResult {
    const totalFound = following.length;
    const items: ImportedItem[] = [];

    for (let i = 0; i < following.length; i++) {
      const f = following[i]?.following;
      if (!f?.accountId) {
        errors.push({ message: 'Missing following accountId', index: i });
        continue;
      }

      const screenName = f.userLink?.replace('https://twitter.com/', '')
                                     .replace('https://x.com/', '') ?? f.accountId;

      items.push({
        id: deterministicId('fl', f.accountId),
        sourceType: 'social',
        title: `Following: @${screenName}`,
        content: `Following Twitter/X account @${screenName} (ID: ${f.accountId})`,
        timestamp: new Date().toISOString(), // Following data has no timestamp
        metadata: {
          platform: 'twitter',
          type: 'following',
          account_id: f.accountId,
          screen_name: screenName,
          user_link: f.userLink ?? null,
        },
      });
    }

    return { format: 'twitter_js', items, errors, totalFound };
  }
}
