// Document Chunker — Splits documents into chunks suitable for embedding.
// Strategy: Recursive character text splitting with overlap.
// Respects paragraph and sentence boundaries where possible.

export interface ChunkerConfig {
  /** Target chunk size in characters. Default: 2000 (~512 tokens) */
  chunkSize?: number;
  /** Overlap between chunks in characters. Default: 200 (~50 tokens) */
  chunkOverlap?: number;
}

export interface Chunk {
  content: string;
  chunkIndex: number;
}

const DEFAULT_CHUNK_SIZE = 2000;
const DEFAULT_CHUNK_OVERLAP = 200;

// Separators in order of preference (split on larger boundaries first)
const SEPARATORS = [
  '\n\n',     // Paragraph break
  '\n',       // Line break
  '. ',       // Sentence end
  '? ',       // Question end
  '! ',       // Exclamation end
  '; ',       // Semicolon
  ', ',       // Comma
  ' ',        // Word boundary
];

/**
 * Split text into chunks using recursive character text splitting.
 */
export function chunkText(text: string, config?: ChunkerConfig): Chunk[] {
  const chunkSize = config?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = config?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (text.length <= chunkSize) {
    return [{ content: text.trim(), chunkIndex: 0 }];
  }

  const rawChunks = recursiveSplit(text, chunkSize, SEPARATORS);
  return mergeWithOverlap(rawChunks, chunkSize, overlap);
}

/**
 * Recursively split text trying each separator in order.
 */
function recursiveSplit(text: string, chunkSize: number, separators: string[]): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  // Find the first separator that produces a split
  for (const separator of separators) {
    const parts = text.split(separator);
    if (parts.length <= 1) continue;

    // Recombine parts into chunks that respect the size limit
    const chunks: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? current + separator + part : part;
      if (candidate.length > chunkSize && current) {
        chunks.push(current);
        current = part;
      } else {
        current = candidate;
      }
    }
    if (current) {
      chunks.push(current);
    }

    // Recursively split any chunks that are still too large
    const result: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length > chunkSize) {
        // Try with the next separator
        const remainingSeparators = separators.slice(separators.indexOf(separator) + 1);
        if (remainingSeparators.length > 0) {
          result.push(...recursiveSplit(chunk, chunkSize, remainingSeparators));
        } else {
          // Hard split at character boundary as last resort
          for (let i = 0; i < chunk.length; i += chunkSize) {
            result.push(chunk.slice(i, i + chunkSize));
          }
        }
      } else {
        result.push(chunk);
      }
    }

    return result;
  }

  // No separator worked — hard split
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Merge split segments into final chunks with overlap.
 */
function mergeWithOverlap(segments: string[], chunkSize: number, overlap: number): Chunk[] {
  if (segments.length === 0) return [];

  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  let i = 0;

  while (i < segments.length) {
    let current = segments[i]!.trim();
    i++;

    // Try to merge small adjacent segments up to chunkSize
    while (i < segments.length) {
      const next = segments[i]!.trim();
      if (current.length + next.length + 1 <= chunkSize) {
        current = current + ' ' + next;
        i++;
      } else {
        break;
      }
    }

    if (current.length > 0) {
      chunks.push({ content: current, chunkIndex });
      chunkIndex++;
    }

    // Apply overlap: back up by looking at how much of the current chunk
    // to include at the start of the next one. We achieve this by
    // checking if the previous segments' tail content should be prepended.
    // For simplicity in v1, overlap is handled at the segment level.
  }

  // Add overlap between consecutive chunks
  if (overlap > 0 && chunks.length > 1) {
    const overlapped: Chunk[] = [chunks[0]!];
    for (let j = 1; j < chunks.length; j++) {
      const prev = chunks[j - 1]!.content;
      const overlapText = prev.slice(-overlap);
      overlapped.push({
        content: overlapText + ' ' + chunks[j]!.content,
        chunkIndex: j,
      });
    }
    return overlapped;
  }

  return chunks;
}
