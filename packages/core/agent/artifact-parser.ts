// Artifact Parser — Detects <artifact> tags in LLM output.
//
// The LLM is instructed to wrap structured output (code, markdown, data)
// in <artifact type="..." title="...">...</artifact> tags.
// This parser extracts them for rendering in the ArtifactPanel.

// ─── Types ───────────────────────────────────────────────────────────────────

export type ArtifactType = 'markdown' | 'text' | 'code' | 'html' | 'csv' | 'json';

export interface ParsedArtifact {
  /** Unique ID for this artifact instance. */
  id: string;
  /** Content type. */
  type: ArtifactType;
  /** Human-readable title. */
  title: string;
  /** The artifact content (between tags). */
  content: string;
  /** Programming language hint (for code type). */
  language?: string;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const ARTIFACT_REGEX = /<artifact\s+([^>]*)>([\s\S]*?)<\/artifact>/g;
const ATTR_REGEX = /(\w+)="([^"]*)"/g;

/**
 * Parse all <artifact> tags from a string.
 * Returns extracted artifacts and the content with tags replaced by placeholders.
 */
export function parseArtifacts(input: string): {
  artifacts: ParsedArtifact[];
  cleanedContent: string;
} {
  const artifacts: ParsedArtifact[] = [];
  let counter = 0;

  const cleanedContent = input.replace(ARTIFACT_REGEX, (_match, attrsStr: string, content: string) => {
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null = null;
    // Reset regex state
    ATTR_REGEX.lastIndex = 0;
    while ((attrMatch = ATTR_REGEX.exec(attrsStr)) !== null) {
      const key = attrMatch[1];
      const val = attrMatch[2];
      if (key && val !== undefined) {
        attrs[key] = val;
      }
    }

    const type = (attrs['type'] as ArtifactType) ?? 'text';
    const title = attrs['title'] ?? `Artifact ${counter + 1}`;
    const language = attrs['language'];
    const id = `artifact_${Date.now()}_${counter}`;
    counter++;

    artifacts.push({
      id,
      type,
      title,
      content: content.trim(),
      language,
    });

    return `[${title}]`;
  });

  return { artifacts, cleanedContent };
}

/**
 * Check if a string contains any artifact tags (for streaming detection).
 * Returns true if at least one complete <artifact>...</artifact> pair exists.
 */
export function hasArtifacts(input: string): boolean {
  ARTIFACT_REGEX.lastIndex = 0;
  return ARTIFACT_REGEX.test(input);
}

// ─── System Prompt Addition ──────────────────────────────────────────────────

export const ARTIFACT_SYSTEM_PROMPT = `
When generating structured content (code, documents, data), wrap it in artifact tags:
<artifact type="code" title="Description" language="typescript">
// code here
</artifact>

Supported types: markdown, text, code, html, csv, json.
Use artifact tags for:
- Code snippets longer than 5 lines
- Generated documents, letters, or emails
- Data tables or structured output
- Formatted content the user might want to save

Do NOT use artifact tags for:
- Brief inline code references
- Short answers or explanations
- Conversational responses
`.trim();
