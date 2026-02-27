/**
 * Twitter/X Archive Parser Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwitterArchiveParser, parseTwitterJsFile } from '../../../packages/core/importers/social/twitter-archive-parser.js';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('TwitterArchiveParser', () => {
  const parser = new TwitterArchiveParser();

  describe('canParse', () => {
    it('accepts tweet.js path', () => {
      expect(parser.canParse('/data/twitter/tweet.js')).toBe(true);
    });

    it('accepts tweets.js path', () => {
      expect(parser.canParse('/data/twitter/tweets.js')).toBe(true);
    });

    it('accepts direct-message.js path', () => {
      expect(parser.canParse('/data/twitter/direct-message.js')).toBe(true);
    });

    it('accepts following.js path', () => {
      expect(parser.canParse('/data/twitter/following.js')).toBe(true);
    });

    it('rejects non-js files', () => {
      expect(parser.canParse('/data/twitter/tweet.json')).toBe(false);
    });

    it('accepts data with window.YTD prefix', () => {
      const data = 'window.YTD.tweet.part0 = [{"tweet":{}}]';
      expect(parser.canParse('/some/file.js', data)).toBe(true);
    });

    it('rejects non-Twitter JS data', () => {
      const data = 'var someOtherData = [1, 2, 3];';
      expect(parser.canParse('/some/file.js', data)).toBe(false);
    });
  });

  describe('parseTwitterJsFile', () => {
    it('strips window.YTD prefix and parses JSON array', () => {
      const content = 'window.YTD.tweet.part0 = [{"tweet":{"id_str":"1"}}]';
      const result = parseTwitterJsFile(content);
      expect(result).toEqual([{ tweet: { id_str: '1' } }]);
    });

    it('handles trailing semicolon', () => {
      const content = 'window.YTD.tweet.part0 = [{"tweet":{"id_str":"2"}}];';
      const result = parseTwitterJsFile(content);
      expect(result).toEqual([{ tweet: { id_str: '2' } }]);
    });

    it('returns null for invalid JSON', () => {
      const content = 'window.YTD.tweet.part0 = {not an array}';
      const result = parseTwitterJsFile(content);
      expect(result).toBeNull();
    });

    it('returns null for non-array JSON', () => {
      const content = 'window.YTD.tweet.part0 = {"key": "value"}';
      const result = parseTwitterJsFile(content);
      expect(result).toBeNull();
    });
  });

  describe('parse tweets', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const tweetData = `window.YTD.tweet.part0 = [
      {
        "tweet": {
          "id_str": "123456789",
          "full_text": "Hello world, this is my first tweet!",
          "created_at": "Mon Oct 10 20:19:24 +0000 2022",
          "favorite_count": "5",
          "retweet_count": "2",
          "entities": {
            "hashtags": [{"text": "hello"}],
            "user_mentions": [{"screen_name": "someone"}],
            "urls": [{"expanded_url": "https://example.com"}]
          }
        }
      },
      {
        "tweet": {
          "id_str": "987654321",
          "full_text": "Second tweet replying to someone",
          "created_at": "Tue Oct 11 10:00:00 +0000 2022",
          "favorite_count": "0",
          "retweet_count": "0",
          "in_reply_to_status_id_str": "111111",
          "in_reply_to_screen_name": "friend"
        }
      }
    ]`;

    it('parses tweets with correct fields', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(tweetData);

      const result = await parser.parse('/data/tweet.js');
      expect(result.items.length).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Should be sorted descending — second tweet first
      const first = result.items[0]!;
      expect(first.sourceType).toBe('social');
      expect(first.content).toBe('Second tweet replying to someone');
      expect(first.metadata.platform).toBe('twitter');
      expect(first.metadata.type).toBe('tweet');
      expect(first.metadata.is_reply).toBe(true);
      expect(first.metadata.reply_to).toBe('friend');

      const second = result.items[1]!;
      expect(second.metadata.tweet_id).toBe('123456789');
      expect(second.metadata.favorite_count).toBe(5);
      expect(second.metadata.retweet_count).toBe(2);
      expect(second.metadata.hashtags).toEqual(['hello']);
      expect(second.metadata.mentions).toEqual(['someone']);
    });

    it('generates deterministic IDs', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(tweetData);

      const result1 = await parser.parse('/data/tweet.js');
      const result2 = await parser.parse('/data/tweet.js');
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
      expect(result1.items[0]!.id).toMatch(/^tw_tw_/);
    });

    it('respects since filter', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(tweetData);

      const result = await parser.parse('/data/tweet.js', {
        since: new Date('2022-10-11T00:00:00Z'),
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.content).toBe('Second tweet replying to someone');
    });

    it('respects limit option', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(tweetData);

      const result = await parser.parse('/data/tweet.js', { limit: 1 });
      expect(result.items.length).toBe(1);
    });
  });

  describe('parse DMs', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const dmData = `window.YTD.direct_message.part0 = [
      {
        "dmConversation": {
          "conversationId": "conv-1",
          "messages": [
            {
              "messageCreate": {
                "senderId": "111",
                "text": "Hey, how are you?",
                "createdAt": "2023-01-15T10:30:00.000Z"
              }
            },
            {
              "messageCreate": {
                "senderId": "222",
                "text": "I'm doing great, thanks!",
                "createdAt": "2023-01-15T10:31:00.000Z"
              }
            }
          ]
        }
      }
    ]`;

    it('parses DM conversations', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(dmData);

      const result = await parser.parse('/data/direct-message.js');
      expect(result.items.length).toBe(2);
      expect(result.items[0]!.metadata.type).toBe('direct_message');
      expect(result.items[0]!.metadata.conversation_id).toBe('conv-1');
    });
  });

  describe('parse following', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const followingData = `window.YTD.following.part0 = [
      {
        "following": {
          "accountId": "12345",
          "userLink": "https://twitter.com/elonmusk"
        }
      },
      {
        "following": {
          "accountId": "67890",
          "userLink": "https://x.com/jack"
        }
      }
    ]`;

    it('parses following list', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(followingData);

      const result = await parser.parse('/data/following.js');
      expect(result.items.length).toBe(2);
      expect(result.items[0]!.metadata.type).toBe('following');
      expect(result.items[0]!.metadata.screen_name).toBe('elonmusk');
      expect(result.items[1]!.metadata.screen_name).toBe('jack');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('handles file read errors', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const result = await parser.parse('/nonexistent/tweet.js');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('handles invalid Twitter JS format', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('not twitter data');

      const result = await parser.parse('/data/tweet.js');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Not a valid Twitter JS export');
    });
  });
});
