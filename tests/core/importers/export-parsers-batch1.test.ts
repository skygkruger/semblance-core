/**
 * Export Parsers Batch 1 Tests — Phase 6 manual export parsers.
 *
 * Tests for: NotionExportParser, FacebookExportParser, InstagramExportParser,
 *            SignalExportParser, DiscordExportParser, SlackExportParser, BearExportParser
 *
 * Mocking strategy:
 * - Parsers use both `require('node:fs')` in canParse (sync) and `await import('node:fs')` in parse (async).
 * - vi.mock('node:fs') intercepts both require and dynamic import in vitest.
 * - vi.mock('node:path') provides a lightweight cross-platform path implementation.
 * - canParse tests for directory-scanning parsers need statSync, readdirSync, existsSync, readFileSync
 *   all exposed from the mock factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixFacebookEncoding } from '../../../packages/core/importers/social/facebook-export-parser.js';
import { extractBearTags } from '../../../packages/core/importers/notes/bear-export-parser.js';

// ─── Mocks must be hoisted ─────────────────────────────────────────────────

const { mockReadFileSync, mockReaddirSync, mockStatSync, mockExistsSync, mockLstatSync } = vi.hoisted(() => {
  const _statSync = vi.fn(() => ({ size: 1024, isFile: () => true, isDirectory: () => false }));
  return {
    mockReadFileSync: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockStatSync: _statSync,
    mockExistsSync: vi.fn(),
    // lstatSync proxies through statSync so tests that configure statSync for
    // directory/file detection automatically work with safeReadFileSync/safeWalkDirectory
    mockLstatSync: vi.fn((...args: unknown[]) => {
      try {
        const stat = _statSync(...(args as [string]));
        return { ...(stat && typeof stat === 'object' ? stat : {}), isSymbolicLink: () => false };
      } catch (e) { throw e; }
    }),
  };
});

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  existsSync: mockExistsSync,
  lstatSync: mockLstatSync,
}));

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  basename: (p: string, ext?: string) => {
    const parts = p.replace(/\\/g, '/').split('/');
    const base = parts[parts.length - 1] ?? p;
    if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
    return base;
  },
  extname: (p: string) => {
    const match = p.match(/\.[^./]+$/);
    return match ? match[0] : '';
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function createDirStat(mtime?: Date) {
  return { isDirectory: () => true, isFile: () => false, mtime: mtime ?? new Date('2024-06-15T10:00:00Z') };
}

function createFileStat(mtime?: Date) {
  return { isDirectory: () => false, isFile: () => true, mtime: mtime ?? new Date('2024-06-15T10:00:00Z') };
}

function resetAllMocks() {
  mockReadFileSync.mockReset();
  mockReaddirSync.mockReset();
  mockStatSync.mockReset();
  mockExistsSync.mockReset();
  mockLstatSync.mockReset();
  // Re-set defaults needed by safeReadFileSync/safeWalkDirectory
  mockStatSync.mockReturnValue({ size: 1024, isFile: () => true, isDirectory: () => false });
  // lstatSync proxies through statSync so tests only need to configure statSync
  mockLstatSync.mockImplementation((...args: unknown[]) => {
    try {
      const stat = mockStatSync(...(args as [string]));
      return { ...(stat && typeof stat === 'object' ? stat : {}), isSymbolicLink: () => false };
    } catch (e) { throw e; }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTION EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('NotionExportParser', () => {
  // Import after mocks are set up
  let NotionExportParser: typeof import('../../../packages/core/importers/notes/notion-export-parser.js').NotionExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/notes/notion-export-parser.js');
    NotionExportParser = mod.NotionExportParser;
  });

  describe('canParse', () => {
    it('rejects when path does not exist', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new NotionExportParser();
      expect(parser.canParse('/nonexistent')).toBe(false);
    });

    it('validates sourceType and supportedFormats', () => {
      const parser = new NotionExportParser();
      expect(parser.sourceType).toBe('notes');
      expect(parser.supportedFormats).toEqual(['notion_export']);
    });

    it('rejects zip path when data contains no UUID filenames', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new NotionExportParser();
      expect(parser.canParse('/export/notes.zip', 'simple.md')).toBe(false);
    });

    it('confirms parser implements ImportParser interface', () => {
      const parser = new NotionExportParser();
      expect(typeof parser.canParse).toBe('function');
      expect(typeof parser.parse).toBe('function');
    });
  });

  describe('parse', () => {
    it('parses directory of Notion markdown files', async () => {
      const parser = new NotionExportParser();
      const mdContent1 = '# Meeting Notes\n\nDiscussed the project roadmap.\n';
      const mdContent2 = '# Design Doc\n\nUI wireframes for v2.\n';

      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export/notion') return createDirStat();
        return createFileStat(new Date('2024-06-15T10:00:00Z'));
      });
      mockReaddirSync.mockReturnValue([
        'Meeting Notes 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.md',
        'Design Doc a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.md',
      ]);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p.includes('Meeting')) return mdContent1;
        if (p.includes('Design')) return mdContent2;
        throw new Error('ENOENT');
      });

      const result = await parser.parse('/export/notion');
      expect(result.items.length).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.format).toBe('notion_export');
      expect(result.items[0]!.sourceType).toBe('notes');
    });

    it('extracts title from first H1 heading', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export') return createDirStat();
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue(['Page 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.md']);
      mockReadFileSync.mockReturnValue('# My Custom Title\n\nSome content here.\n');

      const result = await parser.parse('/export');
      expect(result.items[0]!.title).toBe('My Custom Title');
    });

    it('falls back to filename without UUID for title', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export') return createDirStat();
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue(['My Page 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.md']);
      mockReadFileSync.mockReturnValue('No heading here, just content.\n');

      const result = await parser.parse('/export');
      expect(result.items[0]!.title).toBe('My Page');
    });

    it('generates deterministic IDs with ntn_exp_ prefix', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export') return createDirStat();
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue(['Note 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.md']);
      mockReadFileSync.mockReturnValue('# Note\nContent');

      const r1 = await parser.parse('/export');
      const r2 = await parser.parse('/export');
      expect(r1.items[0]!.id).toMatch(/^ntn_exp_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('respects since filter', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export') return createDirStat();
        if (p.includes('old')) return createFileStat(new Date('2023-01-01'));
        return createFileStat(new Date('2024-06-15'));
      });
      mockReaddirSync.mockReturnValue([
        'old 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.md',
        'new a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.md',
      ]);
      mockReadFileSync.mockReturnValue('# Note\nContent');

      const result = await parser.parse('/export', { since: new Date('2024-01-01') });
      expect(result.items.length).toBe(1);
    });

    it('respects limit option', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export') return createDirStat();
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue([
        'a 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.md',
        'b a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.md',
        'c b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1.md',
      ]);
      mockReadFileSync.mockReturnValue('# Note\nContent');

      const result = await parser.parse('/export', { limit: 2 });
      expect(result.items.length).toBe(2);
      expect(result.totalFound).toBe(3);
    });

    it('handles HTML files by stripping tags', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export') return createDirStat();
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue(['Page 7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d.html']);
      mockReadFileSync.mockReturnValue('<html><body><h1>My Title</h1><p>Some content</p></body></html>');

      const result = await parser.parse('/export');
      expect(result.items[0]!.content).not.toContain('<html>');
      expect(result.items[0]!.content).toContain('My Title');
      expect(result.items[0]!.content).toContain('Some content');
    });

    it('returns error for non-directory path', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockReturnValue(createFileStat());

      const result = await parser.parse('/export/file.md');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('not a directory');
    });

    it('handles access errors gracefully', async () => {
      const parser = new NotionExportParser();
      mockStatSync.mockImplementation(() => { throw new Error('EACCES'); });

      const result = await parser.parse('/noaccess');
      expect(result.items).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACEBOOK EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('FacebookExportParser', () => {
  let FacebookExportParser: typeof import('../../../packages/core/importers/social/facebook-export-parser.js').FacebookExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/social/facebook-export-parser.js');
    FacebookExportParser = mod.FacebookExportParser;
  });

  describe('fixFacebookEncoding', () => {
    it('returns original string for pure ASCII', () => {
      expect(fixFacebookEncoding('Hello World')).toBe('Hello World');
    });

    it('handles already-valid UTF-8 without corruption', () => {
      const result = fixFacebookEncoding('Simple text');
      expect(result).toBe('Simple text');
    });
  });

  describe('canParse', () => {
    it('accepts JSON data with Facebook post structure', () => {
      // canParse with data + .json path checks structure directly
      const data = JSON.stringify([{ timestamp: 1674834600, data: [{ post: 'Hello' }] }]);
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new FacebookExportParser();
      expect(parser.canParse('/posts.json', data)).toBe(true);
    });

    it('rejects JSON data without Facebook structure', () => {
      const data = JSON.stringify([{ url: 'https://example.com' }]);
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new FacebookExportParser();
      expect(parser.canParse('/data.json', data)).toBe(false);
    });

    it('rejects non-JSON path without data', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new FacebookExportParser();
      expect(parser.canParse('/export/data.csv')).toBe(false);
    });

    it('rejects when path does not exist and no data provided', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new FacebookExportParser();
      expect(parser.canParse('/nonexistent')).toBe(false);
    });
  });

  describe('parse', () => {
    const postsJson = JSON.stringify([
      {
        timestamp: 1674834600,
        data: [{ post: 'Hello world! My first post.' }],
        title: 'Sky updated their status.',
      },
      {
        timestamp: 1674921000,
        data: [{ post: 'Another day, another post.' }],
        attachments: [{
          data: [{ external_context: { url: 'https://example.com' } }],
        }],
      },
    ]);

    it('parses Facebook posts from a single JSON file', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/your_posts_1.json');
      expect(result.items.length).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.format).toBe('facebook_export');
      expect(result.items[0]!.sourceType).toBe('social');
      expect(result.items[0]!.metadata.platform).toBe('facebook');
    });

    it('extracts post content correctly', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/your_posts_1.json');
      // Sorted descending — second post (later timestamp) comes first
      expect(result.items[0]!.content).toContain('Another day, another post.');
      expect(result.items[0]!.metadata.has_attachments).toBe(true);
    });

    it('generates deterministic IDs with fb_ prefix', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new FacebookExportParser();
      const r1 = await parser.parse('/export/your_posts_1.json');
      const r2 = await parser.parse('/export/your_posts_1.json');
      expect(r1.items[0]!.id).toMatch(/^fb_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('respects since filter', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/your_posts_1.json', {
        since: new Date('2023-01-28T00:00:00Z'),
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.content).toContain('Another day');
    });

    it('respects limit option', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/your_posts_1.json', { limit: 1 });
      expect(result.items.length).toBe(1);
    });

    it('handles file read errors', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new FacebookExportParser();
      const result = await parser.parse('/nonexistent.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read');
    });

    it('handles malformed JSON', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue('{not valid json}');

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/bad.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('parses full directory export', async () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export/fb') return createDirStat();
        return createFileStat();
      });
      mockExistsSync.mockImplementation((p: string) =>
        typeof p === 'string' && p.includes('posts'),
      );
      mockReaddirSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('posts')) return ['your_posts_1.json'];
        return ['posts'];
      });
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/fb');
      expect(result.items.length).toBe(2);
    });

    it('skips posts with missing timestamp', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { data: [{ post: 'No timestamp' }] },
        { timestamp: 1674834600, data: [{ post: 'Has timestamp' }] },
      ]));

      const parser = new FacebookExportParser();
      const result = await parser.parse('/export/posts.json');
      expect(result.items.length).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSTAGRAM EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('InstagramExportParser', () => {
  let InstagramExportParser: typeof import('../../../packages/core/importers/social/instagram-export-parser.js').InstagramExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/social/instagram-export-parser.js');
    InstagramExportParser = mod.InstagramExportParser;
  });

  describe('canParse', () => {
    it('accepts JSON data with Instagram post structure', () => {
      const data = JSON.stringify([{
        media: [{ uri: 'photo.jpg', creation_timestamp: 1674834600 }],
        title: 'My photo',
      }]);
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new InstagramExportParser();
      expect(parser.canParse('/posts_1.json', data)).toBe(true);
    });

    it('rejects JSON data without Instagram structure', () => {
      const data = JSON.stringify([{ url: 'https://example.com' }]);
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new InstagramExportParser();
      expect(parser.canParse('/data.json', data)).toBe(false);
    });

    it('rejects non-JSON path without data', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new InstagramExportParser();
      expect(parser.canParse('/export/data.csv')).toBe(false);
    });

    it('accepts JSON data with creation_timestamp at root', () => {
      const data = JSON.stringify([{ creation_timestamp: 1674834600, uri: 'media/img.jpg' }]);
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new InstagramExportParser();
      expect(parser.canParse('/media.json', data)).toBe(true);
    });
  });

  describe('parse', () => {
    const postsJson = JSON.stringify([
      {
        media: [{ uri: 'photos/img_001.jpg', creation_timestamp: 1674834600, title: '' }],
        title: 'Beautiful sunset at the beach.',
      },
      {
        media: [
          { uri: 'photos/img_002.jpg', creation_timestamp: 1674921000 },
          { uri: 'photos/img_003.jpg', creation_timestamp: 1674921000 },
        ],
        title: 'Weekend vibes #travel',
      },
    ]);

    it('parses Instagram posts correctly', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/posts_1.json');
      expect(result.items.length).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.format).toBe('instagram_export');
      expect(result.items[0]!.sourceType).toBe('social');
      expect(result.items[0]!.metadata.platform).toBe('instagram');
    });

    it('extracts caption and media count', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/posts_1.json');
      // Second post has later timestamp, comes first
      const first = result.items[0]!;
      expect(first.content).toContain('Weekend vibes');
      expect(first.metadata.media_count).toBe(2);
    });

    it('generates deterministic IDs with ig_ prefix', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new InstagramExportParser();
      const r1 = await parser.parse('/export/posts_1.json');
      const r2 = await parser.parse('/export/posts_1.json');
      expect(r1.items[0]!.id).toMatch(/^ig_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('respects since filter', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/posts_1.json', {
        since: new Date('2023-01-28T00:00:00Z'),
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.content).toContain('Weekend vibes');
    });

    it('respects limit option', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(postsJson);

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/posts_1.json', { limit: 1 });
      expect(result.items.length).toBe(1);
    });

    it('handles missing timestamps', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { media: [{ uri: 'photo.jpg' }], title: 'No timestamp' },
        { media: [{ uri: 'photo2.jpg', creation_timestamp: 1674834600 }], title: 'Has timestamp' },
      ]));

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/posts.json');
      expect(result.items.length).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('handles file read errors', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new InstagramExportParser();
      const result = await parser.parse('/nonexistent.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read');
    });

    it('handles malformed JSON', async () => {
      mockStatSync.mockReturnValue(createFileStat());
      mockReadFileSync.mockReturnValue('not json at all');

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/bad.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('parses stories from stories.json', async () => {
      const storiesJson = JSON.stringify([
        { uri: 'stories/story_001.jpg', creation_timestamp: 1674834600, title: 'My story' },
        { uri: 'stories/story_002.mp4', creation_timestamp: 1674921000 },
      ]);

      mockStatSync.mockImplementation((p: string) => {
        if (p === '/export/ig') return createDirStat();
        return createFileStat();
      });
      // Only the content/stories.json path should match
      mockExistsSync.mockImplementation((p: string) =>
        typeof p === 'string' && p === '/export/ig/content/stories.json',
      );
      mockReaddirSync.mockReturnValue([]);
      mockReadFileSync.mockReturnValue(storiesJson);

      const parser = new InstagramExportParser();
      const result = await parser.parse('/export/ig');
      expect(result.items.length).toBe(2);
      expect(result.items[0]!.metadata.type).toBe('story');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('SignalExportParser', () => {
  let SignalExportParser: typeof import('../../../packages/core/importers/messaging/signal-export-parser.js').SignalExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/messaging/signal-export-parser.js');
    SignalExportParser = mod.SignalExportParser;
  });

  const messagesJson = JSON.stringify({
    messages: [
      {
        conversationId: 'conv-1',
        body: 'Hey, are you free tonight?',
        timestamp: 1674834600000,
        type: 'incoming',
        source: '+1234567890',
        conversationName: 'Alice',
      },
      {
        conversationId: 'conv-1',
        body: 'Yes! Let me check my schedule.',
        timestamp: 1674834660000,
        type: 'outgoing',
        source: '+0987654321',
        conversationName: 'Alice',
      },
      {
        conversationId: 'conv-2',
        body: 'Meeting at 3pm tomorrow.',
        timestamp: 1674921000000,
        type: 'incoming',
        source: '+1111111111',
        conversationName: 'Bob',
      },
    ],
  });

  describe('canParse', () => {
    it('accepts JSON with messages array object', () => {
      const parser = new SignalExportParser();
      const data = JSON.stringify({
        messages: [{ body: 'Hello', timestamp: 1674834600000, conversationId: 'abc' }],
      });
      expect(parser.canParse('/signal/messages.json', data)).toBe(true);
    });

    it('accepts JSON with root-level message array', () => {
      const parser = new SignalExportParser();
      const data = JSON.stringify([
        { body: 'Hello', timestamp: 1674834600000, conversationId: 'abc' },
      ]);
      expect(parser.canParse('/export/signal.json', data)).toBe(true);
    });

    it('rejects non-JSON files without data', () => {
      const parser = new SignalExportParser();
      expect(parser.canParse('/export/data.csv')).toBe(false);
    });

    it('accepts path with "signal" in name', () => {
      const parser = new SignalExportParser();
      expect(parser.canParse('/export/signal-backup.json')).toBe(true);
    });

    it('rejects JSON with wrong structure', () => {
      const parser = new SignalExportParser();
      const data = JSON.stringify({ users: [{ name: 'Test' }] });
      expect(parser.canParse('/export/data.json', data)).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Signal messages correctly', async () => {
      mockReadFileSync.mockReturnValue(messagesJson);

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/messages.json');
      expect(result.items.length).toBe(3);
      expect(result.totalFound).toBe(3);
      expect(result.format).toBe('signal_export');
      expect(result.items[0]!.sourceType).toBe('messaging');
      expect(result.items[0]!.metadata.platform).toBe('signal');
    });

    it('detects message direction', async () => {
      mockReadFileSync.mockReturnValue(messagesJson);

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/messages.json');
      // Sorted descending: Bob's message first
      const bob = result.items[0]!;
      expect(bob.metadata.direction).toBe('received');
      expect(bob.metadata.conversation_name).toBe('Bob');
    });

    it('generates deterministic IDs with sig_ prefix', async () => {
      mockReadFileSync.mockReturnValue(messagesJson);

      const parser = new SignalExportParser();
      const r1 = await parser.parse('/export/messages.json');
      const r2 = await parser.parse('/export/messages.json');
      expect(r1.items[0]!.id).toMatch(/^sig_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('respects since filter', async () => {
      mockReadFileSync.mockReturnValue(messagesJson);

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/messages.json', {
        since: new Date('2023-01-28T00:00:00Z'),
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.metadata.conversation_name).toBe('Bob');
    });

    it('respects limit option', async () => {
      mockReadFileSync.mockReturnValue(messagesJson);

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/messages.json', { limit: 2 });
      expect(result.items.length).toBe(2);
    });

    it('handles file read errors', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new SignalExportParser();
      const result = await parser.parse('/nonexistent.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read');
    });

    it('handles malformed JSON', async () => {
      mockReadFileSync.mockReturnValue('{invalid json');

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/bad.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toBe('Invalid JSON format');
    });

    it('handles root-level array format', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify([
        { body: 'Test message', timestamp: 1674834600000, conversationId: 'c1', type: 'incoming', source: '+111' },
      ]));

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/signal.json');
      expect(result.items.length).toBe(1);
    });

    it('handles alternative field names (text/date/sent)', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        messages: [
          { text: 'Alt format message', date: 1674834600000, conversationId: 'c1', sent: false, address: '+111' },
        ],
      }));

      const parser = new SignalExportParser();
      const result = await parser.parse('/export/messages.json');
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.content).toBe('Alt format message');
      expect(result.items[0]!.metadata.direction).toBe('received');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISCORD EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('DiscordExportParser', () => {
  let DiscordExportParser: typeof import('../../../packages/core/importers/social/discord-export-parser.js').DiscordExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/social/discord-export-parser.js');
    DiscordExportParser = mod.DiscordExportParser;
  });

  const discordExport = JSON.stringify({
    guild: { id: '111', name: 'Test Server', iconUrl: '' },
    channel: { id: '222', type: 'GuildTextChat', name: 'general', topic: 'General discussion' },
    messages: [
      {
        id: 'msg-1',
        type: 'Default',
        timestamp: '2023-01-27T15:30:00+00:00',
        content: 'Hello everyone!',
        author: { id: 'u1', name: 'Alice', nickname: 'Ali', isBot: false },
        attachments: [],
        reactions: [{ emoji: { name: 'thumbsup' }, count: 3 }],
      },
      {
        id: 'msg-2',
        type: 'Default',
        timestamp: '2023-01-28T10:00:00+00:00',
        content: 'Check out this file',
        author: { id: 'u2', name: 'Bob', isBot: false },
        attachments: [{ id: 'a1', fileName: 'report.pdf', fileSizeBytes: 1024 }],
        reactions: [],
      },
      {
        id: 'msg-3',
        type: 'Reply',
        timestamp: '2023-01-28T10:01:00+00:00',
        content: 'Thanks Bob!',
        author: { id: 'u1', name: 'Alice', nickname: 'Ali', isBot: false },
        reference: { messageId: 'msg-2' },
        attachments: [],
        reactions: [],
      },
    ],
  });

  describe('canParse', () => {
    it('accepts JSON with guild + channel + messages structure', () => {
      const parser = new DiscordExportParser();
      expect(parser.canParse('/export/discord.json', discordExport)).toBe(true);
    });

    it('rejects JSON without messages array', () => {
      const parser = new DiscordExportParser();
      const data = JSON.stringify({ guild: {}, channel: {} });
      expect(parser.canParse('/export/data.json', data)).toBe(false);
    });

    it('accepts path containing "discord"', () => {
      const parser = new DiscordExportParser();
      expect(parser.canParse('/export/discord-export.json')).toBe(true);
    });

    it('rejects non-JSON files', () => {
      const parser = new DiscordExportParser();
      expect(parser.canParse('/export/data.csv')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Discord messages correctly', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json');
      expect(result.items.length).toBe(3);
      expect(result.totalFound).toBe(3);
      expect(result.format).toBe('discord_export');
      expect(result.items[0]!.sourceType).toBe('social');
      expect(result.items[0]!.metadata.platform).toBe('discord');
    });

    it('extracts server and channel metadata', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json');
      expect(result.items[0]!.metadata.guild_name).toBe('Test Server');
      expect(result.items[0]!.metadata.channel_name).toBe('general');
    });

    it('detects replies', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json');
      // msg-3 (Reply) is latest — sorted desc, it comes first
      const reply = result.items[0]!;
      expect(reply.metadata.is_reply).toBe(true);
      expect(reply.metadata.reply_to_message).toBe('msg-2');
    });

    it('generates deterministic IDs with dsc_ prefix', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const r1 = await parser.parse('/export/discord.json');
      const r2 = await parser.parse('/export/discord.json');
      expect(r1.items[0]!.id).toMatch(/^dsc_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('respects since filter', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json', {
        since: new Date('2023-01-28T00:00:00Z'),
      });
      expect(result.items.length).toBe(2);
    });

    it('respects limit option', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json', { limit: 1 });
      expect(result.items.length).toBe(1);
    });

    it('includes attachment info in content', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json');
      const bobMsg = result.items.find(i => i.content.includes('Check out this file'))!;
      expect(bobMsg.content).toContain('report.pdf');
      expect(bobMsg.metadata.attachment_count).toBe(1);
    });

    it('handles file read errors', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new DiscordExportParser();
      const result = await parser.parse('/nonexistent.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read');
    });

    it('handles malformed JSON', async () => {
      mockReadFileSync.mockReturnValue('corrupted');

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/bad.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toBe('Invalid JSON format');
    });

    it('handles reactions summary', async () => {
      mockReadFileSync.mockReturnValue(discordExport);

      const parser = new DiscordExportParser();
      const result = await parser.parse('/export/discord.json');
      const hello = result.items.find(i => i.content === 'Hello everyone!')!;
      expect(hello.metadata.reactions).toContain('thumbsup');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLACK EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('SlackExportParser', () => {
  let SlackExportParser: typeof import('../../../packages/core/importers/productivity/slack-export-parser.js').SlackExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/productivity/slack-export-parser.js');
    SlackExportParser = mod.SlackExportParser;
  });

  describe('canParse', () => {
    it('rejects non-directory', () => {
      mockStatSync.mockReturnValue(createFileStat());

      const parser = new SlackExportParser();
      expect(parser.canParse('/export/file.json')).toBe(false);
    });

    it('rejects when path does not exist', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new SlackExportParser();
      expect(parser.canParse('/nonexistent')).toBe(false);
    });

    it('validates sourceType and supportedFormats', () => {
      const parser = new SlackExportParser();
      expect(parser.sourceType).toBe('productivity');
      expect(parser.supportedFormats).toEqual(['slack_export']);
    });
  });

  describe('parse', () => {
    const channelsJson = JSON.stringify([
      { id: 'C001', name: 'general', purpose: { value: 'General discussion' } },
    ]);

    const usersJson = JSON.stringify([
      { id: 'U001', name: 'alice', real_name: 'Alice Johnson', profile: { display_name: 'alice' } },
      { id: 'U002', name: 'bob', real_name: 'Bob Smith', profile: { display_name: 'bob' } },
    ]);

    const generalMessages = JSON.stringify([
      {
        type: 'message',
        user: 'U001',
        text: 'Good morning everyone!',
        ts: '1674834600.000100',
        reactions: [{ name: 'wave', count: 2, users: ['U002'] }],
      },
      {
        type: 'message',
        user: 'U002',
        text: 'Hey <@U001>! How are you?',
        ts: '1674834660.000200',
      },
      {
        type: 'message',
        subtype: 'channel_join',
        user: 'U003',
        text: '<@U003> has joined the channel',
        ts: '1674834700.000300',
      },
    ]);

    function setupSlackMocks() {
      mockStatSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && (p === '/export/slack' || p.endsWith('/general'))) return createDirStat();
        return createFileStat();
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p === '/export/slack') return ['channels.json', 'users.json', 'general'];
        if (typeof p === 'string' && p.endsWith('/general')) return ['2023-01-27.json'];
        return [];
      });
      mockReadFileSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('channels.json')) return channelsJson;
        if (typeof p === 'string' && p.includes('users.json')) return usersJson;
        if (typeof p === 'string' && p.includes('2023-01-27.json')) return generalMessages;
        throw new Error(`ENOENT: ${p}`);
      });
    }

    it('parses Slack messages correctly', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack');
      // 3 messages total but channel_join is skipped
      expect(result.items.length).toBe(2);
      expect(result.format).toBe('slack_export');
      expect(result.items[0]!.sourceType).toBe('productivity');
      expect(result.items[0]!.metadata.platform).toBe('slack');
    });

    it('resolves user references in message text', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack');
      const bobMsg = result.items.find(i => i.content.includes('@alice'))!;
      expect(bobMsg).toBeDefined();
      expect(bobMsg.content).not.toContain('<@U001>');
    });

    it('generates deterministic IDs with slk_ prefix', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const r1 = await parser.parse('/export/slack');
      const r2 = await parser.parse('/export/slack');
      expect(r1.items[0]!.id).toMatch(/^slk_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('includes channel metadata', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack');
      expect(result.items[0]!.metadata.channel_name).toBe('general');
      expect(result.items[0]!.metadata.channel_id).toBe('C001');
    });

    it('resolves author names from users.json', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack');
      const aliceMsg = result.items.find(i => i.content.includes('Good morning'))!;
      expect(aliceMsg.metadata.author_name).toBe('alice');
    });

    it('skips channel_join system messages', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack');
      const joinMsgs = result.items.filter(i => i.content.includes('has joined'));
      expect(joinMsgs.length).toBe(0);
    });

    it('respects since filter', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const allResult = await parser.parse('/export/slack');
      const allCount = allResult.items.length;

      // Now filter with a since date after the second message too
      // ts '1674834660.000200' = 2023-01-27T15:31:00.000Z
      // Use a date well after all messages
      const filteredResult = await parser.parse('/export/slack', {
        since: new Date('2023-01-28T00:00:00Z'),
      });
      // All messages should be filtered out — they're all from Jan 27
      expect(filteredResult.items.length).toBe(0);
      expect(allCount).toBeGreaterThan(0);
    });

    it('respects limit option', async () => {
      setupSlackMocks();

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack', { limit: 1 });
      expect(result.items.length).toBe(1);
    });

    it('returns error for non-directory', async () => {
      mockStatSync.mockReturnValue(createFileStat());

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/file.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('not a directory');
    });

    it('handles missing users.json gracefully', async () => {
      mockStatSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && (p === '/export/slack' || p.endsWith('/general'))) return createDirStat();
        return createFileStat();
      });
      mockExistsSync.mockImplementation((p: string) =>
        typeof p === 'string' && !p.includes('users.json'),
      );
      mockReaddirSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p === '/export/slack') return ['channels.json', 'general'];
        if (typeof p === 'string' && p.endsWith('/general')) return ['2023-01-27.json'];
        return [];
      });
      mockReadFileSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('channels.json')) return channelsJson;
        if (typeof p === 'string' && p.includes('2023-01-27.json')) return generalMessages;
        throw new Error('ENOENT');
      });

      const parser = new SlackExportParser();
      const result = await parser.parse('/export/slack');
      expect(result.items.length).toBe(2);
      // Without users.json, user IDs are used as names: <@U001> becomes @U001
      const bobMsg = result.items.find(i => i.content.includes('@U001'))!;
      expect(bobMsg).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BEAR EXPORT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe('BearExportParser', () => {
  let BearExportParser: typeof import('../../../packages/core/importers/notes/bear-export-parser.js').BearExportParser;

  beforeEach(async () => {
    resetAllMocks();
    const mod = await import('../../../packages/core/importers/notes/bear-export-parser.js');
    BearExportParser = mod.BearExportParser;
  });

  describe('extractBearTags', () => {
    it('extracts simple tags', () => {
      const tags = extractBearTags('Hello #world this is a #test');
      expect(tags).toContain('world');
      expect(tags).toContain('test');
    });

    it('extracts nested tags', () => {
      const tags = extractBearTags('Check out #project/frontend and #project/backend');
      expect(tags).toContain('project/frontend');
      expect(tags).toContain('project/backend');
    });

    it('extracts enclosed multi-word tags', () => {
      const tags = extractBearTags('This has #multi word tag# in it');
      expect(tags).toContain('multi word tag');
    });
  });

  describe('canParse', () => {
    it('rejects non-directory', () => {
      mockStatSync.mockReturnValue(createFileStat());

      const parser = new BearExportParser();
      expect(parser.canParse('/export/file.md')).toBe(false);
    });

    it('rejects when path does not exist', () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const parser = new BearExportParser();
      expect(parser.canParse('/nonexistent')).toBe(false);
    });

    it('validates sourceType and supportedFormats', () => {
      const parser = new BearExportParser();
      expect(parser.sourceType).toBe('notes');
      expect(parser.supportedFormats).toEqual(['bear_export']);
    });
  });

  describe('parse', () => {
    const note1 = '# Shopping List\n\nBuy groceries:\n- Milk\n- Bread\n\n#personal #todo';
    const note2 = '# Project Ideas\n\nWork on #project/alpha and #project/beta.\n\nSee also [[Shopping List]].\n\n#work';
    const note3 = '# Meeting Notes\n\nDiscussed deadlines.\n\n#work/meetings';

    function setupBearMocks() {
      mockStatSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p === '/export/bear') return createDirStat();
        if (typeof p === 'string' && p.includes('note1')) return createFileStat(new Date('2024-06-15T10:00:00Z'));
        if (typeof p === 'string' && p.includes('note2')) return createFileStat(new Date('2024-06-16T10:00:00Z'));
        if (typeof p === 'string' && p.includes('note3')) return createFileStat(new Date('2024-06-17T10:00:00Z'));
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue(['note1.md', 'note2.md', 'note3.md']);
      mockReadFileSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('note1')) return note1;
        if (typeof p === 'string' && p.includes('note2')) return note2;
        if (typeof p === 'string' && p.includes('note3')) return note3;
        throw new Error('ENOENT');
      });
    }

    it('parses Bear notes correctly', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear');
      expect(result.items.length).toBe(3);
      expect(result.totalFound).toBe(3);
      expect(result.format).toBe('bear_export');
      expect(result.items[0]!.sourceType).toBe('notes');
    });

    it('extracts title from first heading', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear');
      const titles = result.items.map(i => i.title);
      expect(titles).toContain('Shopping List');
      expect(titles).toContain('Project Ideas');
      expect(titles).toContain('Meeting Notes');
    });

    it('extracts tags as metadata', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear');
      const projectNote = result.items.find(i => i.title === 'Project Ideas')!;
      expect(projectNote.metadata.tags).toContain('project/alpha');
      expect(projectNote.metadata.tags).toContain('project/beta');
      expect(projectNote.metadata.tags).toContain('work');
    });

    it('extracts wiki links', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear');
      const projectNote = result.items.find(i => i.title === 'Project Ideas')!;
      expect(projectNote.metadata.wikiLinks).toContain('Shopping List');
    });

    it('generates deterministic IDs with bear_ prefix', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const r1 = await parser.parse('/export/bear');
      const r2 = await parser.parse('/export/bear');
      expect(r1.items[0]!.id).toMatch(/^bear_/);
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
    });

    it('respects since filter', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear', {
        since: new Date('2024-06-16T00:00:00Z'),
      });
      expect(result.items.length).toBe(2);
    });

    it('respects limit option', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear', { limit: 1 });
      expect(result.items.length).toBe(1);
      expect(result.totalFound).toBe(3);
    });

    it('includes word count in metadata', async () => {
      setupBearMocks();

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear');
      for (const item of result.items) {
        expect(typeof item.metadata.word_count).toBe('number');
        expect((item.metadata.word_count as number)).toBeGreaterThan(0);
      }
    });

    it('returns error for non-directory', async () => {
      mockStatSync.mockReturnValue(createFileStat());

      const parser = new BearExportParser();
      const result = await parser.parse('/export/file.md');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('not a directory');
    });

    it('handles read errors on individual files gracefully', async () => {
      mockStatSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p === '/export/bear') return createDirStat();
        return createFileStat();
      });
      mockReaddirSync.mockReturnValue(['good.md', 'bad.md']);
      mockReadFileSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('good')) return '# Good Note\n\nContent #tag';
        throw new Error('EACCES');
      });

      const parser = new BearExportParser();
      const result = await parser.parse('/export/bear');
      expect(result.items.length).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
