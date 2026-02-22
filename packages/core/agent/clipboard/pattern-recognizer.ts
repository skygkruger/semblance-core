// Clipboard Pattern Recognizer — Analyzes clipboard text for actionable patterns.
//
// Two-path analysis:
// 1. Fast path: Regex-only (no LLM, < 1ms)
// 2. Slow path: LLM analysis for ambiguous content (only when regex finds nothing)
//
// CRITICAL: No network imports. LLM is passed via constructor (local inference only).

import type { LLMProvider } from '../../llm/types.js';
import { matchPatterns, type PatternMatch, type ClipboardPatternType } from './patterns.js';
import { ClipboardActionMapper, type SuggestedClipboardAction } from './action-mapper.js';

export interface RecognizedPattern {
  type: ClipboardPatternType;
  value: string;
  confidence: number;
  carrier?: string;
  suggestedAction?: SuggestedClipboardAction;
}

export interface ClipboardAnalysis {
  patterns: RecognizedPattern[];
  hasActionableContent: boolean;
  analyzedAt: string;
}

export class ClipboardPatternRecognizer {
  private llm: LLMProvider | null;
  private model: string;
  private actionMapper: ClipboardActionMapper;

  constructor(config?: { llm?: LLMProvider; model?: string }) {
    this.llm = config?.llm ?? null;
    this.model = config?.model ?? '';
    this.actionMapper = new ClipboardActionMapper();
  }

  /**
   * Analyze clipboard text for actionable patterns.
   * Uses regex first (fast), falls back to LLM for ambiguous content.
   */
  async analyze(text: string): Promise<ClipboardAnalysis> {
    if (!text || text.trim().length === 0) {
      return {
        patterns: [],
        hasActionableContent: false,
        analyzedAt: new Date().toISOString(),
      };
    }

    // Fast path: regex patterns
    const regexMatches = this.analyzeWithRegex(text);

    if (regexMatches.length > 0) {
      const patterns = regexMatches.map(m => this.enrichWithAction(m));
      return {
        patterns,
        hasActionableContent: true,
        analyzedAt: new Date().toISOString(),
      };
    }

    // Slow path: LLM analysis for ambiguous content
    if (this.llm) {
      const llmPatterns = await this.analyzeWithLLM(text);
      if (llmPatterns.length > 0) {
        const patterns = llmPatterns.map(m => this.enrichWithAction(m));
        return {
          patterns,
          hasActionableContent: true,
          analyzedAt: new Date().toISOString(),
        };
      }
    }

    return {
      patterns: [],
      hasActionableContent: false,
      analyzedAt: new Date().toISOString(),
    };
  }

  private analyzeWithRegex(text: string): PatternMatch[] {
    return matchPatterns(text);
  }

  private async analyzeWithLLM(text: string): Promise<PatternMatch[]> {
    if (!this.llm) return [];

    try {
      const response = await this.llm.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `Analyze this clipboard text for actionable content. Identify if it contains:
- A physical address (type: address)
- A date or time reference (type: date_time)
- A code snippet (type: code_snippet)

Respond with JSON array of objects with "type" and "value" fields. If nothing actionable, respond with empty array [].`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
      });

      const parsed = JSON.parse(response.message.content);
      if (Array.isArray(parsed)) {
        return parsed.map((p: { type: string; value: string }) => ({
          type: p.type as ClipboardPatternType,
          value: p.value,
          confidence: 0.6,
        }));
      }
    } catch {
      // LLM failed — return empty
    }

    return [];
  }

  private enrichWithAction(match: PatternMatch): RecognizedPattern {
    const action = this.actionMapper.mapPatternToAction(match);
    return {
      ...match,
      suggestedAction: action,
    };
  }
}
