/**
 * Instagram Export Parser — Parses Instagram data export (extracted directory).
 *
 * Instagram data exports contain JSON files with personal data:
 *   content/posts_1.json — Array of post objects with media and captions
 *   content/stories.json — Stories data
 *   content/profile.json — Profile information
 *   media.json — Media metadata (older format)
 *
 * Each post has: { media: [{ uri, creation_timestamp, title }], title }
 * Instagram uses the same UTF-8 mojibake encoding as Facebook.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

// Reuse the same encoding fix as Facebook — Instagram has the same issue
function fixEncoding(text: string): string {
  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const decoded = decoder.decode(bytes);
    if (decoded.includes('\uFFFD') && !text.includes('\uFFFD')) {
      return text;
    }
    return decoded;
  } catch {
    return text;
  }
}

function deterministicId(...parts: string[]): string {
  const input = parts.join('|');
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `ig_${hash}`;
}

interface InstagramMediaItem {
  uri?: string;
  creation_timestamp?: number;
  title?: string;
  media_metadata?: {
    photo_metadata?: { exif_data?: unknown[] };
    video_metadata?: { duration?: number };
  };
}

interface InstagramPost {
  media?: InstagramMediaItem[];
  title?: string;
  creation_timestamp?: number;
}

interface InstagramStory {
  uri?: string;
  creation_timestamp?: number;
  title?: string;
}

export class InstagramExportParser implements ImportParser {
  readonly sourceType = 'social' as const;
  readonly supportedFormats = ['instagram_export'];

  canParse(path: string, data?: string): boolean {
    // Check data content first — doesn't require filesystem access
    if (path.endsWith('.json') && data) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          // Instagram posts have a media array with creation_timestamp
          return (
            (Array.isArray(first?.media) && typeof first?.media[0]?.creation_timestamp === 'number') ||
            typeof first?.creation_timestamp === 'number'
          );
        }
      } catch {
        // Not valid JSON — fall through to filesystem check
      }
    }

    // Check directory structure
    try {
      const { statSync, existsSync } = require('node:fs') as typeof import('node:fs');
      const { join } = require('node:path') as typeof import('node:path');
      const stat = statSync(path);

      if (stat.isDirectory()) {
        // Look for Instagram export directory markers
        return (
          existsSync(join(path, 'content', 'posts_1.json')) ||
          existsSync(join(path, 'content', 'stories.json')) ||
          existsSync(join(path, 'media.json')) ||
          existsSync(join(path, 'posts_1.json'))
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { readFileSync, statSync, existsSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    let items: ImportedItem[] = [];
    let totalFound = 0;

    try {
      const stat = statSync(path);

      if (stat.isDirectory()) {
        // Find and parse posts files
        const postFiles = this.findContentFiles(path, 'posts', existsSync, readdirSync, join);

        for (const postFile of postFiles) {
          try {
            const raw = readFileSync(postFile, 'utf-8');
            const result = this.parsePostsJson(raw, postFile, options, errors);
            totalFound += result.totalFound;
            items.push(...result.items);
          } catch (err) {
            errors.push({ message: `Failed to read ${postFile}: ${(err as Error).message}` });
          }
        }

        // Parse stories
        const storyPaths = [
          join(path, 'content', 'stories.json'),
          join(path, 'stories.json'),
        ];

        for (const storyPath of storyPaths) {
          if (existsSync(storyPath)) {
            try {
              const raw = readFileSync(storyPath, 'utf-8');
              const result = this.parseStoriesJson(raw, storyPath, options, errors);
              totalFound += result.totalFound;
              items.push(...result.items);
            } catch (err) {
              errors.push({ message: `Failed to read ${storyPath}: ${(err as Error).message}` });
            }
          }
        }

        // Also try media.json (older format)
        const mediaPath = join(path, 'media.json');
        if (existsSync(mediaPath) && items.length === 0) {
          try {
            const raw = readFileSync(mediaPath, 'utf-8');
            const result = this.parseMediaJson(raw, mediaPath, options, errors);
            totalFound += result.totalFound;
            items.push(...result.items);
          } catch (err) {
            errors.push({ message: `Failed to read ${mediaPath}: ${(err as Error).message}` });
          }
        }
      } else if (path.endsWith('.json')) {
        // Single JSON file
        try {
          const raw = readFileSync(path, 'utf-8');
          const result = this.parsePostsJson(raw, path, options, errors);
          totalFound = result.totalFound;
          items = result.items;
        } catch (err) {
          return {
            format: 'instagram_export',
            items: [],
            errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
            totalFound: 0,
          };
        }
      } else {
        return {
          format: 'instagram_export',
          items: [],
          errors: [{ message: `Unsupported path: ${path}` }],
          totalFound: 0,
        };
      }
    } catch (err) {
      return {
        format: 'instagram_export',
        items: [],
        errors: [{ message: `Cannot access path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'instagram_export',
      items,
      errors,
      totalFound,
    };
  }

  private findContentFiles(
    dir: string,
    prefix: string,
    existsSync: (p: string) => boolean,
    readdirSync: (p: string) => string[],
    join: (...args: string[]) => string,
  ): string[] {
    const files: string[] = [];

    // Check content/ subdirectory
    const contentDir = join(dir, 'content');
    try {
      if (existsSync(contentDir)) {
        const entries = readdirSync(contentDir);
        for (const entry of entries) {
          if (entry.startsWith(prefix) && entry.endsWith('.json')) {
            files.push(join(contentDir, entry));
          }
        }
      }
    } catch {
      // contentDir may not exist
    }

    // Also check root level
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith(prefix) && entry.endsWith('.json')) {
          files.push(join(dir, entry));
        }
      }
    } catch {
      // root may not be readable
    }

    return files;
  }

  private parsePostsJson(
    raw: string,
    filePath: string,
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): { items: ImportedItem[]; totalFound: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      errors.push({ message: `Invalid JSON in ${filePath}` });
      return { items: [], totalFound: 0 };
    }

    if (!Array.isArray(parsed)) {
      errors.push({ message: `Expected array in ${filePath}` });
      return { items: [], totalFound: 0 };
    }

    const posts = parsed as InstagramPost[];
    const totalFound = posts.length;
    const items: ImportedItem[] = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]!;

      // Get timestamp from post or first media item
      const postTimestamp = post.creation_timestamp ?? post.media?.[0]?.creation_timestamp;
      if (typeof postTimestamp !== 'number') {
        errors.push({ message: `Missing timestamp at index ${i}`, index: i });
        continue;
      }

      const timestamp = new Date(postTimestamp * 1000);
      if (isNaN(timestamp.getTime())) {
        errors.push({ message: `Invalid timestamp ${postTimestamp} at index ${i}`, index: i });
        continue;
      }

      // Apply since filter
      if (options?.since && timestamp < options.since) {
        continue;
      }

      // Extract caption from title or media title
      const caption = post.title
        ? fixEncoding(post.title)
        : post.media?.[0]?.title
          ? fixEncoding(post.media[0].title)
          : '';

      // Extract media URIs
      const mediaUris: string[] = [];
      const mediaTypes: string[] = [];
      if (post.media) {
        for (const m of post.media) {
          if (m.uri) mediaUris.push(m.uri);
          if (m.media_metadata?.video_metadata) {
            mediaTypes.push('video');
          } else {
            mediaTypes.push('photo');
          }
        }
      }

      const contentParts: string[] = [];
      if (caption) contentParts.push(caption);
      if (mediaUris.length > 0) {
        contentParts.push(`Media: ${mediaUris.join(', ')}`);
      }

      const content = contentParts.join('\n');
      if (!content) continue;

      items.push({
        id: deterministicId(String(postTimestamp), caption.slice(0, 100) || mediaUris[0] || String(i)),
        sourceType: 'social',
        title: (caption.slice(0, 80) || 'Instagram Post').slice(0, 100),
        content,
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'instagram',
          type: 'post',
          media_count: mediaUris.length,
          media_types: mediaTypes,
          has_caption: !!caption,
          source_file: filePath,
        },
      });
    }

    return { items, totalFound };
  }

  private parseStoriesJson(
    raw: string,
    filePath: string,
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): { items: ImportedItem[]; totalFound: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      errors.push({ message: `Invalid JSON in ${filePath}` });
      return { items: [], totalFound: 0 };
    }

    if (!Array.isArray(parsed)) {
      errors.push({ message: `Expected array in ${filePath}` });
      return { items: [], totalFound: 0 };
    }

    const stories = parsed as InstagramStory[];
    const totalFound = stories.length;
    const items: ImportedItem[] = [];

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i]!;

      if (typeof story.creation_timestamp !== 'number') {
        errors.push({ message: `Missing timestamp in story at index ${i}`, index: i });
        continue;
      }

      const timestamp = new Date(story.creation_timestamp * 1000);
      if (isNaN(timestamp.getTime())) continue;

      if (options?.since && timestamp < options.since) {
        continue;
      }

      const title = story.title ? fixEncoding(story.title) : '';
      const uri = story.uri ?? '';

      items.push({
        id: deterministicId('story', String(story.creation_timestamp), uri || String(i)),
        sourceType: 'social',
        title: (title || 'Instagram Story').slice(0, 100),
        content: [title, uri ? `Media: ${uri}` : ''].filter(Boolean).join('\n') || 'Instagram Story',
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'instagram',
          type: 'story',
          media_uri: uri || null,
          source_file: filePath,
        },
      });
    }

    return { items, totalFound };
  }

  private parseMediaJson(
    raw: string,
    filePath: string,
    options: ParseOptions | undefined,
    errors: ParseError[],
  ): { items: ImportedItem[]; totalFound: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      errors.push({ message: `Invalid JSON in ${filePath}` });
      return { items: [], totalFound: 0 };
    }

    // media.json can be an object with { photos: [], videos: [] }
    // or a flat array
    let mediaItems: InstagramMediaItem[] = [];

    if (Array.isArray(parsed)) {
      mediaItems = parsed as InstagramMediaItem[];
    } else if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj['photos'])) {
        mediaItems.push(...(obj['photos'] as InstagramMediaItem[]));
      }
      if (Array.isArray(obj['videos'])) {
        mediaItems.push(...(obj['videos'] as InstagramMediaItem[]));
      }
    }

    const totalFound = mediaItems.length;
    const items: ImportedItem[] = [];

    for (let i = 0; i < mediaItems.length; i++) {
      const media = mediaItems[i]!;

      if (typeof media.creation_timestamp !== 'number') {
        continue;
      }

      const timestamp = new Date(media.creation_timestamp * 1000);
      if (isNaN(timestamp.getTime())) continue;

      if (options?.since && timestamp < options.since) {
        continue;
      }

      const title = media.title ? fixEncoding(media.title) : '';
      const uri = media.uri ?? '';

      items.push({
        id: deterministicId('media', String(media.creation_timestamp), uri || String(i)),
        sourceType: 'social',
        title: (title || 'Instagram Media').slice(0, 100),
        content: [title, uri ? `Media: ${uri}` : ''].filter(Boolean).join('\n') || 'Instagram Media',
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'instagram',
          type: 'media',
          media_uri: uri || null,
          source_file: filePath,
        },
      });
    }

    return { items, totalFound };
  }
}
