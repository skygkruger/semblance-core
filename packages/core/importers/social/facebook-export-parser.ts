/**
 * Facebook Export Parser — Parses Facebook data export (extracted directory).
 *
 * Facebook data exports contain JSON files with various personal data:
 *   posts/your_posts_1.json — Array of post objects
 *   profile_information/profile_information.json — Profile data
 *   comments/comments.json — Comment history
 *
 * Facebook's JSON exports have a known encoding issue: text is stored as
 * UTF-8 bytes interpreted as Latin-1 (mojibake). This parser corrects that.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

/**
 * Fix Facebook's UTF-8 mojibake encoding.
 * Facebook exports encode UTF-8 text as escaped Latin-1 byte sequences in JSON.
 * Example: "caf\u00c3\u00a9" should be "cafe" (the bytes C3 A9 = UTF-8 for e-acute).
 */
export function fixFacebookEncoding(text: string): string {
  try {
    // Convert the string to bytes interpreting each char as a Latin-1 byte,
    // then decode as UTF-8
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const decoded = decoder.decode(bytes);
    // If decoding produced replacement characters, return original
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
  return `fb_${hash}`;
}

interface FacebookPost {
  timestamp: number;
  data?: Array<{ post?: string }>;
  title?: string;
  attachments?: Array<{
    data?: Array<{
      external_context?: { url?: string };
      media?: { uri?: string; title?: string; description?: string };
    }>;
  }>;
  tags?: Array<{ name?: string }>;
}

interface FacebookPostFile {
  // Facebook wraps posts in an array at the top level
  [index: number]: FacebookPost;
  length?: number;
}

interface FacebookComment {
  timestamp: number;
  data?: Array<{
    comment?: {
      timestamp?: number;
      comment?: string;
      author?: string;
    };
  }>;
  title?: string;
}

export class FacebookExportParser implements ImportParser {
  readonly sourceType = 'social' as const;
  readonly supportedFormats = ['facebook_export'];

  canParse(path: string, data?: string): boolean {
    // Check data content first — doesn't require filesystem access
    if (path.endsWith('.json') && data) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          return typeof first?.timestamp === 'number' && (first?.data !== undefined || first?.title !== undefined);
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
        // Look for Facebook export directory markers
        return (
          existsSync(join(path, 'posts', 'your_posts_1.json')) ||
          existsSync(join(path, 'your_posts_1.json')) ||
          existsSync(join(path, 'profile_information', 'profile_information.json')) ||
          existsSync(join(path, 'profile_information.json'))
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { statSync, existsSync, readdirSync } = await import('node:fs');
    const { join, basename } = await import('node:path');

    let items: ImportedItem[] = [];
    let totalFound = 0;

    try {
      const stat = statSync(path);

      if (stat.isDirectory()) {
        // Parse the full export directory
        const postFiles = this.findPostFiles(path, existsSync, readdirSync, join);

        for (const postFile of postFiles) {
          try {
            const raw = safeReadFileSync(postFile);
            const result = this.parsePostsJson(raw, postFile, options, errors);
            totalFound += result.totalFound;
            items.push(...result.items);
          } catch (err) {
            errors.push({ message: `Failed to read ${postFile}: ${(err as Error).message}` });
          }
        }

        // Also parse comments if present
        const commentPaths = [
          join(path, 'comments', 'comments.json'),
          join(path, 'comments_and_reactions', 'comments.json'),
        ];

        for (const commentPath of commentPaths) {
          if (existsSync(commentPath)) {
            try {
              const raw = safeReadFileSync(commentPath);
              const result = this.parseCommentsJson(raw, commentPath, options, errors);
              totalFound += result.totalFound;
              items.push(...result.items);
            } catch (err) {
              errors.push({ message: `Failed to read ${commentPath}: ${(err as Error).message}` });
            }
          }
        }
      } else if (path.endsWith('.json')) {
        // Single JSON file
        try {
          const raw = safeReadFileSync(path);
          const result = this.parsePostsJson(raw, path, options, errors);
          totalFound = result.totalFound;
          items = result.items;
        } catch (err) {
          return {
            format: 'facebook_export',
            items: [],
            errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
            totalFound: 0,
          };
        }
      } else {
        return {
          format: 'facebook_export',
          items: [],
          errors: [{ message: `Unsupported path: ${path}` }],
          totalFound: 0,
        };
      }
    } catch (err) {
      return {
        format: 'facebook_export',
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
      format: 'facebook_export',
      items,
      errors,
      totalFound,
    };
  }

  private findPostFiles(
    dir: string,
    existsSync: (p: string) => boolean,
    readdirSync: (p: string) => string[],
    join: (...args: string[]) => string,
  ): string[] {
    const files: string[] = [];

    // Check posts/ subdirectory
    const postsDir = join(dir, 'posts');
    try {
      if (existsSync(postsDir)) {
        const entries = readdirSync(postsDir);
        for (const entry of entries) {
          if (entry.startsWith('your_posts') && entry.endsWith('.json')) {
            files.push(join(postsDir, entry));
          }
        }
      }
    } catch {
      // postsDir may not exist
    }

    // Also check root level
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('your_posts') && entry.endsWith('.json')) {
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

    const posts = parsed as FacebookPost[];
    const totalFound = posts.length;
    const items: ImportedItem[] = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]!;

      if (typeof post.timestamp !== 'number') {
        errors.push({ message: `Missing timestamp at index ${i}`, index: i });
        continue;
      }

      const timestamp = new Date(post.timestamp * 1000);
      if (isNaN(timestamp.getTime())) {
        errors.push({ message: `Invalid timestamp ${post.timestamp} at index ${i}`, index: i });
        continue;
      }

      // Apply since filter
      if (options?.since && timestamp < options.since) {
        continue;
      }

      // Extract post text
      let postText = '';
      if (post.data && Array.isArray(post.data)) {
        for (const d of post.data) {
          if (d.post) {
            postText += fixFacebookEncoding(d.post) + '\n';
          }
        }
      }
      postText = postText.trim();

      // Extract title
      const title = post.title ? fixFacebookEncoding(post.title) : '';

      // Build content from available fields
      const contentParts: string[] = [];
      if (title) contentParts.push(title);
      if (postText) contentParts.push(postText);

      // Extract attachment URLs
      const attachmentUrls: string[] = [];
      if (post.attachments) {
        for (const att of post.attachments) {
          if (att.data) {
            for (const d of att.data) {
              if (d.external_context?.url) {
                attachmentUrls.push(d.external_context.url);
              }
              if (d.media?.uri) {
                attachmentUrls.push(d.media.uri);
              }
            }
          }
        }
      }

      if (attachmentUrls.length > 0) {
        contentParts.push(`Attachments: ${attachmentUrls.join(', ')}`);
      }

      const content = contentParts.join('\n');

      // Skip empty posts (no text, no title, no attachments)
      if (!content) {
        continue;
      }

      const tags = post.tags?.map(t => t.name).filter(Boolean) as string[] | undefined;

      items.push({
        id: deterministicId(String(post.timestamp), postText.slice(0, 100) || title),
        sourceType: 'social',
        title: (title || postText.slice(0, 80) || 'Facebook Post').slice(0, 100),
        content,
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'facebook',
          type: 'post',
          has_attachments: attachmentUrls.length > 0,
          attachment_count: attachmentUrls.length,
          tags: tags ?? [],
          source_file: filePath,
        },
      });
    }

    return { items, totalFound };
  }

  private parseCommentsJson(
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

    const comments = parsed as FacebookComment[];
    const totalFound = comments.length;
    const items: ImportedItem[] = [];

    for (let i = 0; i < comments.length; i++) {
      const entry = comments[i]!;

      if (typeof entry.timestamp !== 'number') {
        errors.push({ message: `Missing timestamp at comment index ${i}`, index: i });
        continue;
      }

      const timestamp = new Date(entry.timestamp * 1000);
      if (isNaN(timestamp.getTime())) continue;

      if (options?.since && timestamp < options.since) {
        continue;
      }

      const commentText = entry.data?.[0]?.comment?.comment ?? '';
      const author = entry.data?.[0]?.comment?.author ?? '';
      const title = entry.title ? fixFacebookEncoding(entry.title) : '';

      if (!commentText && !title) continue;

      const fixedComment = fixFacebookEncoding(commentText);
      const displayTitle = title || `Comment: ${fixedComment.slice(0, 60)}`;

      items.push({
        id: deterministicId('cmt', String(entry.timestamp), fixedComment.slice(0, 100)),
        sourceType: 'social',
        title: displayTitle.slice(0, 100),
        content: [title, fixedComment].filter(Boolean).join('\n'),
        timestamp: timestamp.toISOString(),
        metadata: {
          platform: 'facebook',
          type: 'comment',
          author: author ? fixFacebookEncoding(author) : null,
          source_file: filePath,
        },
      });
    }

    return { items, totalFound };
  }
}
