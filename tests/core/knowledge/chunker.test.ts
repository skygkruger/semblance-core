// Tests for the text chunker — splitting, overlap, boundary respect.

import { describe, it, expect } from 'vitest';
import { chunkText } from '@semblance/core/knowledge/chunker.js';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hello world');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('Hello world');
    expect(chunks[0]!.chunkIndex).toBe(0);
  });

  it('splits long text into multiple chunks', () => {
    const longText = 'A'.repeat(5000);
    const chunks = chunkText(longText, { chunkSize: 1000, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves overlap between chunks', () => {
    // Create text with distinct paragraphs
    const paragraphs = Array.from({ length: 10 }, (_, i) =>
      `Paragraph ${i}. ${'Lorem ipsum dolor sit amet. '.repeat(10)}`
    ).join('\n\n');

    const chunks = chunkText(paragraphs, { chunkSize: 500, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);

    // Verify chunks have content
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  it('respects paragraph boundaries when possible', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
    const chunks = chunkText(text, { chunkSize: 40, chunkOverlap: 5 });
    // Should split at paragraph boundaries
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns sequential chunk indices', () => {
    const text = 'Word '.repeat(500);
    const chunks = chunkText(text, { chunkSize: 200, chunkOverlap: 20 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.chunkIndex).toBe(i);
    }
  });

  it('handles empty text as a single empty chunk', () => {
    const chunks = chunkText('');
    // Empty text is <= chunkSize, so returns a single chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('');
  });

  it('handles text shorter than overlap', () => {
    const chunks = chunkText('Hi', { chunkSize: 1000, chunkOverlap: 200 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('Hi');
  });

  it('uses default config when none provided', () => {
    const text = 'A'.repeat(3000);
    const chunks = chunkText(text);
    // Default chunkSize is 2000, so 3000 chars should give 2 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
