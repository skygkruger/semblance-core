/**
 * Lightweight markdown-to-HTML renderer for ChatBubble.
 * Zero dependencies. Sanitizes input before transformation to prevent XSS.
 *
 * Supported syntax:
 *   **bold**, *italic*, `inline code`, ```code blocks```,
 *   # / ## / ### headers, - / * / 1. lists, [text](url) links,
 *   > blockquotes, --- horizontal rules, | tables, paragraph breaks.
 */

// ── Sanitization ──────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Block-level parsing ───────────────────────────────────────────────

interface Block {
  type: 'code' | 'raw';
  lang?: string;
  content: string;
}

/** Extract fenced code blocks first so their contents are never markdown-processed. */
function extractCodeBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      blocks.push({ type: 'raw', content: text.slice(last, m.index) });
    }
    blocks.push({ type: 'code', lang: m[1] ?? '', content: m[2] ?? '' });
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    blocks.push({ type: 'raw', content: text.slice(last) });
  }

  return blocks;
}

// ── Inline parsing ────────────────────────────────────────────────────

function inlineMarkdown(line: string): string {
  // Bold  **text**
  line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic  *text*  (but not inside already-processed <strong>)
  line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Inline code  `code`
  line = line.replace(/`([^`]+?)`/g, '<code>$1</code>');
  // Links  [text](url)
  line = line.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  return line;
}

// ── Block rendering ───────────────────────────────────────────────────

function renderRawBlock(text: string): string {
  // Split into paragraphs by double newline
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((p) => renderParagraph(p.trim())).filter(Boolean).join('\n');
}

function renderParagraph(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');

  // Horizontal rule
  if (lines.length === 1 && /^-{3,}$/.test((lines[0] ?? '').trim())) {
    return '<hr>';
  }

  // Header
  if (lines.length === 1) {
    const hm = (lines[0] ?? '').match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      const level = (hm[1] ?? '#').length + 2; // # → h3, ## → h4, ### → h5
      return `<h${level}>${inlineMarkdown(hm[2] ?? '')}</h${level}>`;
    }
  }

  // Table detection — all lines contain |
  if (lines.length >= 2 && lines.every((l) => l.includes('|'))) {
    return renderTable(lines);
  }

  // Blockquote — all lines start with >
  if (lines.every((l) => l.trimStart().startsWith('&gt;') || l.trimStart().startsWith('>'))) {
    // Content was already HTML-escaped, so > became &gt;
    const inner = lines
      .map((l) => {
        const stripped = l.trimStart().replace(/^(&gt;|>)\s?/, '');
        return inlineMarkdown(stripped);
      })
      .join('<br>');
    return `<blockquote>${inner}</blockquote>`;
  }

  // Unordered list — all lines start with - or *
  if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
    const items = lines.map((l) => `<li>${inlineMarkdown(l.replace(/^\s*[-*]\s+/, ''))}</li>`);
    return `<ul>${items.join('')}</ul>`;
  }

  // Ordered list — all lines start with number.
  if (lines.every((l) => /^\s*\d+\.\s/.test(l))) {
    const items = lines.map((l) => `<li>${inlineMarkdown(l.replace(/^\s*\d+\.\s+/, ''))}</li>`);
    return `<ol>${items.join('')}</ol>`;
  }

  // Default paragraph
  return `<p>${lines.map((l) => inlineMarkdown(l)).join('<br>')}</p>`;
}

function renderTable(lines: string[]): string {
  const parseRow = (line: string): string[] =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);

  // Check if second line is a separator row (e.g. |---|---|)
  const hasSeparator = lines.length >= 2 && /^[\s|:-]+$/.test(lines[1] ?? '');

  const headerCells = parseRow(lines[0] ?? '');
  const bodyLines = hasSeparator ? lines.slice(2) : lines.slice(1);

  let html = '<table>';
  html += '<thead><tr>' + headerCells.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('') + '</tr></thead>';

  if (bodyLines.length) {
    html += '<tbody>';
    for (const line of bodyLines) {
      const cells = parseRow(line);
      html += '<tr>' + cells.map((c) => `<td>${inlineMarkdown(c)}</td>`).join('') + '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table>';
  return html;
}

// ── Public API ────────────────────────────────────────────────────────

export function renderMarkdown(text: string): string {
  // Step 1: Escape HTML entities in raw text
  const escaped = escapeHtml(text);

  // Step 2: Extract code blocks (their content is already escaped)
  const blocks = extractCodeBlocks(escaped);

  // Step 3: Render each block
  const html = blocks
    .map((block) => {
      if (block.type === 'code') {
        const langClass = block.lang ? ` class="language-${block.lang}"` : '';
        // Trim trailing newline inside code block for cleaner display
        const trimmed = block.content.replace(/\n$/, '');
        return `<pre><code${langClass}>${trimmed}</code></pre>`;
      }
      return renderRawBlock(block.content);
    })
    .join('\n');

  return html;
}
