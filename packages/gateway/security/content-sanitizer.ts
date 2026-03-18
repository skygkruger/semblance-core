// Gateway Content Sanitizer — Local copy of content sanitization for Gateway use.
//
// The Gateway must sanitize inbound channel messages before forwarding to Core.
// This is a Gateway-local copy of the sanitization logic to avoid
// cross-boundary imports (Gateway must not import from Core).
//
// IMPORTANT: If the Core content-sanitizer changes, this file should be updated
// to match. Both files implement the same sanitization rules.
//
// Pure string processing. No networking imports.

/** Maximum characters per retrieved content chunk. */
const MAX_CHUNK_LENGTH = 2000;

const ROLE_PREFIXES = [
  /^\s*(?:System|Assistant|User|Human|AI|Claude|GPT)\s*:/gim,
  /^\s*(?:###\s*)?(?:system|assistant|user|human)\s*$/gim,
];

const CONTROL_TOKEN_PATTERNS = [
  /<\|im_start\|>/g,
  /<\|im_end\|>/g,
  /<\|endoftext\|>/g,
  /<\|system\|>/g,
  /<\|user\|>/g,
  /<\|assistant\|>/g,
  /\[INST\]/g,
  /\[\/INST\]/g,
  /<<SYS>>/g,
  /<\/SYS>>/g,
  /<\|begin_of_text\|>/g,
  /<\|end_of_text\|>/g,
  /<\|start_header_id\|>/g,
  /<\|end_header_id\|>/g,
];

const INSTRUCTION_MARKERS = [
  /^#{1,4}\s*(?:Instructions?|System\s+Prompt|Directives?|Rules?)\s*$/gim,
  /(?:^|\n)\s*(?:IMPORTANT|CRITICAL|OVERRIDE|IGNORE PREVIOUS|DISREGARD|FORGET)\s*:/gim,
  /(?:You are now|From now on|New instructions|Your new role)/gim,
];

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitize inbound content before it crosses the IPC boundary.
 * Strips role prefixes, control tokens, instruction markers, enforces length.
 */
export function sanitizeInboundContent(content: string): string {
  if (!content) return '';

  let sanitized = content;

  sanitized = sanitized.replace(CONTROL_CHARS, '');

  for (const pattern of CONTROL_TOKEN_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  for (const pattern of ROLE_PREFIXES) {
    sanitized = sanitized.replace(pattern, '');
  }

  for (const pattern of INSTRUCTION_MARKERS) {
    sanitized = sanitized.replace(pattern, (match) => `[sanitized: ${match.trim().slice(0, 30)}]`);
  }

  if (sanitized.length > MAX_CHUNK_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CHUNK_LENGTH) + '...[truncated]';
  }

  return sanitized.trim();
}
