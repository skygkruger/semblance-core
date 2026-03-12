/**
 * MarkdownText — lightweight React Native markdown renderer for ChatBubble.
 * Zero dependencies beyond React Native core. Parses markdown into nested
 * Text/View elements.
 *
 * Supported: **bold**, *italic*, `inline code`, ```code blocks```,
 * # headers, - / * / 1. lists, [text](url) links, > blockquotes, --- hr.
 */

import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { brandColors, nativeFontFamily, nativeFontSize, nativeSpacing, nativeRadius } from '../../tokens/native';

interface MarkdownTextProps {
  text: string;
}

// ── Block parsing ─────────────────────────────────────────────────────

interface CodeBlock {
  type: 'code';
  lang: string;
  content: string;
}

interface RawBlock {
  type: 'raw';
  content: string;
}

type Block = CodeBlock | RawBlock;

function extractCodeBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      blocks.push({ type: 'raw', content: text.slice(last, m.index) });
    }
    blocks.push({ type: 'code', lang: m[1] || '', content: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    blocks.push({ type: 'raw', content: text.slice(last) });
  }

  return blocks;
}

// ── Inline parsing ────────────────────────────────────────────────────

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Combined regex for bold, italic, inline code, and links
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index) });
    }

    if (m[2] !== undefined) {
      // Bold **text**
      segments.push({ text: m[2], bold: true });
    } else if (m[4] !== undefined) {
      // Italic *text*
      segments.push({ text: m[4], italic: true });
    } else if (m[6] !== undefined) {
      // Inline code `code`
      segments.push({ text: m[6], code: true });
    } else if (m[8] !== undefined) {
      // Link [text](url)
      segments.push({ text: m[8], link: m[9] });
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) {
    segments.push({ text: text.slice(last) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

function renderInline(text: string, key: string): React.ReactElement {
  const segments = parseInline(text);

  if (segments.length === 1 && !segments[0].bold && !segments[0].italic && !segments[0].code && !segments[0].link) {
    return <Text key={key} style={s.text}>{segments[0].text}</Text>;
  }

  return (
    <Text key={key} style={s.text}>
      {segments.map((seg, i) => {
        const sk = `${key}-${i}`;
        if (seg.code) {
          return <Text key={sk} style={s.inlineCode}>{seg.text}</Text>;
        }
        if (seg.link) {
          return (
            <Text
              key={sk}
              style={s.link}
              onPress={() => { Linking.openURL(seg.link!).catch(() => {}); }}
            >
              {seg.text}
            </Text>
          );
        }
        const style: TextStyle[] = [s.text];
        if (seg.bold) style.push(s.bold);
        if (seg.italic) style.push(s.italic);
        return <Text key={sk} style={style}>{seg.text}</Text>;
      })}
    </Text>
  );
}

// ── Paragraph-level parsing ───────────────────────────────────────────

function renderParagraph(text: string, key: string): React.ReactElement | null {
  if (!text.trim()) return null;

  const lines = text.split('\n');

  // Horizontal rule
  if (lines.length === 1 && /^-{3,}$/.test(lines[0].trim())) {
    return <View key={key} style={s.hr} />;
  }

  // Header
  if (lines.length === 1) {
    const hm = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const fontSize = level === 1 ? nativeFontSize.lg : level === 2 ? nativeFontSize.md : nativeFontSize.base;
      return (
        <Text key={key} style={[s.header, { fontSize }]}>
          {parseInline(hm[2]).map((seg, i) => {
            if (seg.code) return <Text key={i} style={s.inlineCode}>{seg.text}</Text>;
            if (seg.bold) return <Text key={i} style={s.bold}>{seg.text}</Text>;
            return <Text key={i}>{seg.text}</Text>;
          })}
        </Text>
      );
    }
  }

  // Blockquote — all lines start with >
  if (lines.every((l) => l.trimStart().startsWith('>'))) {
    const inner = lines.map((l) => l.trimStart().replace(/^>\s?/, '')).join('\n');
    return (
      <View key={key} style={s.blockquote}>
        {renderInline(inner, `${key}-bq`)}
      </View>
    );
  }

  // Unordered list
  if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
    return (
      <View key={key} style={s.list}>
        {lines.map((l, i) => (
          <View key={`${key}-li-${i}`} style={s.listItem}>
            <Text style={s.bullet}>{'\u2022'} </Text>
            {renderInline(l.replace(/^\s*[-*]\s+/, ''), `${key}-li-${i}-t`)}
          </View>
        ))}
      </View>
    );
  }

  // Ordered list
  if (lines.every((l) => /^\s*\d+\.\s/.test(l))) {
    return (
      <View key={key} style={s.list}>
        {lines.map((l, i) => {
          const num = l.match(/^\s*(\d+)\./);
          return (
            <View key={`${key}-ol-${i}`} style={s.listItem}>
              <Text style={s.bullet}>{num ? num[1] : i + 1}. </Text>
              {renderInline(l.replace(/^\s*\d+\.\s+/, ''), `${key}-ol-${i}-t`)}
            </View>
          );
        })}
      </View>
    );
  }

  // Default: paragraph with inline formatting
  return (
    <View key={key} style={s.paragraph}>
      {renderInline(lines.join('\n'), `${key}-p`)}
    </View>
  );
}

function renderRawBlock(text: string, baseKey: string): React.ReactElement[] {
  const paragraphs = text.split(/\n{2,}/);
  const elements: React.ReactElement[] = [];

  paragraphs.forEach((p, i) => {
    const el = renderParagraph(p.trim(), `${baseKey}-${i}`);
    if (el) elements.push(el);
  });

  return elements;
}

// ── Main component ────────────────────────────────────────────────────

export function MarkdownText({ text }: MarkdownTextProps): React.ReactElement {
  const blocks = extractCodeBlocks(text);

  const elements: React.ReactElement[] = [];

  blocks.forEach((block, bi) => {
    if (block.type === 'code') {
      elements.push(
        <View key={`cb-${bi}`} style={s.codeBlock}>
          <Text style={s.codeBlockText}>{block.content}</Text>
        </View>,
      );
    } else {
      elements.push(...renderRawBlock(block.content, `rb-${bi}`));
    }
  });

  return <View>{elements}</View>;
}

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  text: {
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.white,
    lineHeight: 22.5,
  } as TextStyle,
  bold: {
    fontWeight: '700',
    color: brandColors.white,
  } as TextStyle,
  italic: {
    fontStyle: 'italic',
  } as TextStyle,
  inlineCode: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.base * 0.9,
    backgroundColor: 'rgba(110, 207, 163, 0.1)',
    paddingHorizontal: 4,
    borderRadius: 3,
  } as TextStyle,
  link: {
    color: brandColors.veridian,
  } as TextStyle,
  header: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '700',
    color: brandColors.white,
    marginTop: nativeSpacing.s2,
    marginBottom: nativeSpacing.s1,
  } as TextStyle,
  paragraph: {
    marginVertical: 2,
  } as ViewStyle,
  codeBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: nativeSpacing.s3,
    borderRadius: nativeRadius.md,
    marginVertical: nativeSpacing.s2,
  } as ViewStyle,
  codeBlockText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 13,
    color: brandColors.white,
    lineHeight: 20,
  } as TextStyle,
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: brandColors.veridian,
    paddingLeft: nativeSpacing.s3,
    marginVertical: nativeSpacing.s2,
  } as ViewStyle,
  list: {
    marginVertical: nativeSpacing.s1,
    paddingLeft: nativeSpacing.s3,
  } as ViewStyle,
  listItem: {
    flexDirection: 'row',
    marginVertical: 1,
  } as ViewStyle,
  bullet: {
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.sv2,
    lineHeight: 22.5,
  } as TextStyle,
  hr: {
    borderTopWidth: 1,
    borderTopColor: '#2a2e35',
    marginVertical: nativeSpacing.s3,
  } as ViewStyle,
});
