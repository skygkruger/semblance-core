// Artifact tag parsing tests.

import { describe, it, expect } from 'vitest';
import {
  parseArtifacts,
  hasArtifacts,
  ARTIFACT_SYSTEM_PROMPT,
} from '../../../packages/core/agent/artifact-parser';

describe('artifact-parser', () => {
  // ─── parseArtifacts ──────────────────────────────────────────────────────

  it('extracts a single code artifact', () => {
    const input = 'Here is the code:\n<artifact type="code" title="Hello World" language="typescript">console.log("hello");</artifact>';
    const { artifacts, cleanedContent } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.type).toBe('code');
    expect(artifacts[0]?.title).toBe('Hello World');
    expect(artifacts[0]?.language).toBe('typescript');
    expect(artifacts[0]?.content).toBe('console.log("hello");');
    expect(cleanedContent).toContain('[Hello World]');
    expect(cleanedContent).not.toContain('<artifact');
  });

  it('extracts a markdown artifact', () => {
    const input = '<artifact type="markdown" title="Summary">## Overview\n\nThis is a summary.</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.type).toBe('markdown');
    expect(artifacts[0]?.title).toBe('Summary');
    expect(artifacts[0]?.content).toContain('## Overview');
  });

  it('extracts multiple artifacts', () => {
    const input = `
Some text before.
<artifact type="code" title="Function A" language="python">def a(): pass</artifact>
Middle text.
<artifact type="json" title="Config">{"key": "value"}</artifact>
End text.`;

    const { artifacts, cleanedContent } = parseArtifacts(input);

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.title).toBe('Function A');
    expect(artifacts[0]?.type).toBe('code');
    expect(artifacts[1]?.title).toBe('Config');
    expect(artifacts[1]?.type).toBe('json');
    expect(cleanedContent).toContain('[Function A]');
    expect(cleanedContent).toContain('[Config]');
    expect(cleanedContent).toContain('Middle text.');
  });

  it('returns empty artifacts for content without tags', () => {
    const input = 'Just a normal response with no artifacts.';
    const { artifacts, cleanedContent } = parseArtifacts(input);

    expect(artifacts).toHaveLength(0);
    expect(cleanedContent).toBe(input);
  });

  it('handles artifact with no language attribute', () => {
    const input = '<artifact type="text" title="Note">Some plain text</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.language).toBeUndefined();
  });

  it('defaults type to text when missing', () => {
    const input = '<artifact title="Untitled">content here</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.type).toBe('text');
  });

  it('generates sequential default title when title is missing', () => {
    const input = '<artifact type="code">some code</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.title).toMatch(/Artifact \d+/);
  });

  it('trims whitespace from content', () => {
    const input = '<artifact type="text" title="Trimmed">\n  Hello  \n</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts[0]?.content).toBe('Hello');
  });

  it('handles multiline code content', () => {
    const code = `function hello() {\n  console.log("world");\n  return true;\n}`;
    const input = `<artifact type="code" title="Function" language="typescript">${code}</artifact>`;
    const { artifacts } = parseArtifacts(input);

    expect(artifacts[0]?.content).toContain('console.log');
    expect(artifacts[0]?.content).toContain('return true');
  });

  it('handles HTML type artifact', () => {
    const input = '<artifact type="html" title="Page"><div>Hello</div></artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.type).toBe('html');
  });

  it('handles CSV type artifact', () => {
    const input = '<artifact type="csv" title="Data">name,age\nAlice,30\nBob,25</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.type).toBe('csv');
    expect(artifacts[0]?.content).toContain('Alice');
  });

  // ─── hasArtifacts ──────────────────────────────────────────────────────

  it('returns true when artifacts exist', () => {
    expect(hasArtifacts('<artifact type="code" title="Test">code</artifact>')).toBe(true);
  });

  it('returns false when no artifacts', () => {
    expect(hasArtifacts('No artifacts here')).toBe(false);
  });

  it('returns false for incomplete tags', () => {
    expect(hasArtifacts('<artifact type="code">no closing tag')).toBe(false);
  });

  // ─── ARTIFACT_SYSTEM_PROMPT ──────────────────────────────────────────────

  it('system prompt contains artifact tag instruction', () => {
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('<artifact');
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('</artifact>');
  });

  it('system prompt lists supported types', () => {
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('markdown');
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('code');
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('json');
  });

  it('system prompt includes "Do NOT use" exclusion rules', () => {
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('Do NOT use artifact tags for');
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('Conversational responses');
    expect(ARTIFACT_SYSTEM_PROMPT).toContain('Short answers');
  });

  // ─── Conversational content produces zero artifacts ──────────────────

  it('does not extract artifacts from normal conversational text', () => {
    const conversational = [
      'Sure! Here is a quick summary of your week.',
      'The weather today is 72°F and sunny.',
      'I sent the email to Sarah. She should get it within a few minutes.',
      'You have 3 meetings tomorrow: standup at 9am, design review at 11am, and 1:1 with Alex at 2pm.',
      'Based on your recent spending, you might want to review your Netflix subscription.',
    ];
    for (const text of conversational) {
      const { artifacts, cleanedContent } = parseArtifacts(text);
      expect(artifacts).toHaveLength(0);
      expect(cleanedContent).toBe(text);
    }
  });

  it('does not extract artifacts from inline code references', () => {
    const text = 'Use `console.log("hello")` to debug. The function returns `true`.';
    const { artifacts } = parseArtifacts(text);
    expect(artifacts).toHaveLength(0);
  });

  // ─── Each artifact gets a unique ID ────────────────────────────────────

  it('generates unique IDs for each artifact', () => {
    const input = '<artifact type="code" title="A">a</artifact><artifact type="code" title="B">b</artifact>';
    const { artifacts } = parseArtifacts(input);

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.id).not.toBe(artifacts[1]?.id);
  });
});
