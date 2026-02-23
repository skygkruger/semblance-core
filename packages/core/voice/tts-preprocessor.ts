// TTS Preprocessor — Pure functions for preparing text for speech synthesis.
//
// Splits sentences, expands abbreviations/numbers, strips markdown/emoji.
// All functions are stateless and side-effect free.
//
// CRITICAL: No network imports. Pure computation.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

/**
 * Split text into sentences for chunked TTS synthesis.
 * Handles common sentence-ending punctuation and edge cases.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];

  // Split on sentence-ending punctuation followed by whitespace or end of string
  const raw = text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g);
  if (!raw) return [text.trim()];

  return raw
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Expand common abbreviations for more natural speech.
 */
export function expandAbbreviations(text: string): string {
  const abbrevs: Record<string, string> = {
    'Dr.': 'Doctor',
    'Mr.': 'Mister',
    'Mrs.': 'Misses',
    'Ms.': 'Miz',
    'Jr.': 'Junior',
    'Sr.': 'Senior',
    'St.': 'Saint',
    'Ave.': 'Avenue',
    'Blvd.': 'Boulevard',
    'approx.': 'approximately',
    'dept.': 'department',
    'est.': 'estimated',
    'govt.': 'government',
    'vs.': 'versus',
    'etc.': 'etcetera',
    'e.g.': 'for example',
    'i.e.': 'that is',
  };

  let result = text;
  for (const [abbrev, expanded] of Object.entries(abbrevs)) {
    result = result.replace(new RegExp(abbrev.replace(/\./g, '\\.'), 'g'), expanded);
  }
  return result;
}

/**
 * Expand numbers and currency for natural speech.
 * "$14.99" → "14 dollars and 99 cents"
 * "3.5" → "3 point 5"
 * "100" → "100"
 */
export function expandNumbers(text: string): string {
  // Currency: $X.XX
  let result = text.replace(/\$(\d+)\.(\d{2})\b/g, (_match, dollars, cents) => {
    const centsNum = parseInt(cents as string, 10);
    if (centsNum === 0) return `${dollars} dollars`;
    return `${dollars} dollars and ${centsNum} cents`;
  });

  // Currency: $X (no cents)
  result = result.replace(/\$(\d+)\b/g, '$1 dollars');

  // Percentages: X%
  result = result.replace(/(\d+(?:\.\d+)?)%/g, '$1 percent');

  // Decimals: X.Y
  result = result.replace(/(\d+)\.(\d+)/g, '$1 point $2');

  return result;
}

/**
 * Strip markdown formatting for clean speech output.
 * Removes bold, italic, code blocks, links, headers, lists.
 */
export function stripMarkdown(text: string): string {
  let result = text;

  // Code blocks (fenced)
  result = result.replace(/```[\s\S]*?```/g, '');

  // Inline code
  result = result.replace(/`([^`]+)`/g, '$1');

  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '$1');
  // Bold underscore
  result = result.replace(/__(.+?)__/g, '$1');
  // Italic underscore
  result = result.replace(/_(.+?)_/g, '$1');

  // Links: [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Headers: # Header → Header
  result = result.replace(/^#{1,6}\s+/gm, '');

  // List markers
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');
  result = result.replace(/^[\s]*\d+\.\s+/gm, '');

  // Horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, '');

  return result.trim();
}

/**
 * Strip emoji characters from text.
 */
export function stripEmoji(text: string): string {
  // Match most emoji ranges
  return text.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{FE0F}]/gu,
    '',
  ).replace(/\s+/g, ' ').trim();
}

/**
 * Full preprocessing pipeline: compose all transformations.
 * Order: stripMarkdown → stripEmoji → expandAbbreviations → expandNumbers → normalize whitespace.
 */
export function preprocessForTTS(text: string): string {
  let result = text;
  result = stripMarkdown(result);
  result = stripEmoji(result);
  result = expandAbbreviations(result);
  result = expandNumbers(result);
  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}
