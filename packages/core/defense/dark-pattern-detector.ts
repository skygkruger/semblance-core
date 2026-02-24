/**
 * Dark Pattern Detector — Identifies manipulative content using regex pre-filter + LLM analysis.
 *
 * Two-stage pipeline:
 * 1. Regex pre-filter scans for urgency/scarcity phrases (fast, no LLM cost)
 * 2. If pre-filter score >= threshold, LLM analysis provides structured pattern detection
 *
 * Only flags content when confidence > 0.7 (conservative to avoid false positives).
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { nanoid } from 'nanoid';
import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { LLMProvider } from '../llm/types.js';
import type { ContentForAnalysis, DarkPatternResult, DetectedPattern } from './types.js';

// ─── Regex Pre-Filter ───────────────────────────────────────────────────────

export const URGENCY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /LAST\s+CHANCE/i, category: 'urgency' },
  { pattern: /ACT\s+NOW/i, category: 'urgency' },
  { pattern: /expires?\s+in/i, category: 'scarcity' },
  { pattern: /only\s+\d+\s+left/i, category: 'scarcity' },
  { pattern: /don['']?t\s+miss/i, category: 'urgency' },
  { pattern: /limited\s+time/i, category: 'scarcity' },
  { pattern: /final\s+notice/i, category: 'urgency' },
  { pattern: /\bURGENT\b/i, category: 'urgency' },
  { pattern: /immediate\s+action/i, category: 'urgency' },
  { pattern: /before\s+it['']?s?\s+too\s+late/i, category: 'urgency' },
];

const PRE_FILTER_THRESHOLD = 0.15;
const CONFIDENCE_THRESHOLD = 0.7;

function regexPreFilter(text: string): { score: number; matches: DetectedPattern[] } {
  const matches: DetectedPattern[] = [];

  for (const { pattern, category } of URGENCY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      matches.push({
        category,
        evidence: match[0],
        confidence: 0.8,
      });
    }
  }

  const score = matches.length / URGENCY_PATTERNS.length;
  return { score, matches };
}

// ─── SQL Schema ─────────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS dark_pattern_flags (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    flagged_at TEXT NOT NULL,
    confidence REAL NOT NULL,
    patterns_json TEXT NOT NULL DEFAULT '[]',
    reframe TEXT NOT NULL DEFAULT '',
    dismissed INTEGER NOT NULL DEFAULT 0,
    dismissed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_dpf_content ON dark_pattern_flags(content_id);
  CREATE INDEX IF NOT EXISTS idx_dpf_dismissed ON dark_pattern_flags(dismissed);
  CREATE INDEX IF NOT EXISTS idx_dpf_flagged_at ON dark_pattern_flags(flagged_at);
`;

// ─── LLM Analysis ───────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are analyzing content for dark patterns and manipulative language.
Identify any manipulation tactics used (urgency, scarcity, guilt, social proof, fear, anchoring).
Rate your confidence that this content is genuinely manipulative (0.0 to 1.0).
Provide a neutral reframe of the content that strips manipulative language.

Respond in JSON:
{
  "patterns": [{"category": "urgency|scarcity|guilt|social_proof|fear|anchoring", "evidence": "quoted text", "confidence": 0.8}],
  "overall_confidence": 0.85,
  "reframe": "Neutral version of the message",
  "is_manipulative": true
}`;

// ─── Public API ─────────────────────────────────────────────────────────────

export class DarkPatternDetector {
  private llmProvider: LLMProvider;
  private model: string;
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;

  constructor(config: {
    llmProvider: LLMProvider;
    model: string;
    db: DatabaseHandle;
    premiumGate: PremiumGate;
  }) {
    this.llmProvider = config.llmProvider;
    this.model = config.model;
    this.db = config.db;
    this.premiumGate = config.premiumGate;
  }

  initSchema(): void {
    this.db.exec(CREATE_TABLE);
  }

  /**
   * Analyze a single content item for dark patterns.
   */
  async analyze(content: ContentForAnalysis): Promise<DarkPatternResult> {
    // Premium check
    if (!this.premiumGate.isFeatureAvailable('dark-pattern-detection')) {
      return {
        contentId: content.id,
        flagged: false,
        confidence: 0,
        patterns: [],
        reframe: '',
        method: 'regex',
      };
    }

    const combinedText = `${content.subject} ${content.body}`;

    // Stage 1: Regex pre-filter
    const preFilter = regexPreFilter(combinedText);

    if (preFilter.score < PRE_FILTER_THRESHOLD) {
      // Content looks benign — skip LLM analysis
      return {
        contentId: content.id,
        flagged: false,
        confidence: preFilter.score,
        patterns: [],
        reframe: '',
        method: 'regex',
      };
    }

    // Stage 2: LLM analysis
    try {
      const response = await this.llmProvider.chat({
        model: this.model,
        messages: [
          { role: 'system', content: ANALYSIS_PROMPT },
          { role: 'user', content: `Subject: ${content.subject}\nBody: ${content.body}\nSender: ${content.sender}` },
        ],
        format: 'json',
        temperature: 0.1,
      });

      const parsed = JSON.parse(response.message.content) as {
        patterns: Array<{ category: string; evidence: string; confidence: number }>;
        overall_confidence: number;
        reframe: string;
        is_manipulative: boolean;
      };

      const patterns: DetectedPattern[] = parsed.patterns.map(p => ({
        category: p.category,
        evidence: p.evidence,
        confidence: p.confidence,
      }));

      const flagged = parsed.overall_confidence > CONFIDENCE_THRESHOLD && parsed.is_manipulative;

      const result: DarkPatternResult = {
        contentId: content.id,
        flagged,
        confidence: parsed.overall_confidence,
        patterns,
        reframe: parsed.reframe,
        method: 'both',
      };

      // Store if flagged
      if (flagged) {
        this.storeFlag(content, result);
      }

      return result;
    } catch {
      // LLM failed — fall back to regex-only result
      const flagged = preFilter.matches.length >= 2;
      return {
        contentId: content.id,
        flagged,
        confidence: preFilter.score,
        patterns: preFilter.matches,
        reframe: '',
        method: 'regex',
      };
    }
  }

  /**
   * Analyze multiple content items in batch.
   */
  async analyzeBatch(items: ContentForAnalysis[]): Promise<DarkPatternResult[]> {
    const results: DarkPatternResult[] = [];
    for (const item of items) {
      results.push(await this.analyze(item));
    }
    return results;
  }

  /**
   * Get dismissed content IDs.
   */
  getDismissedIds(): Set<string> {
    const rows = this.db.prepare(
      'SELECT content_id FROM dark_pattern_flags WHERE dismissed = 1'
    ).all() as Array<{ content_id: string }>;
    return new Set(rows.map(r => r.content_id));
  }

  /**
   * Dismiss a flag (user says it's fine).
   */
  dismissFlag(contentId: string): void {
    this.db.prepare(
      'UPDATE dark_pattern_flags SET dismissed = 1, dismissed_at = ? WHERE content_id = ?'
    ).run(new Date().toISOString(), contentId);
  }

  /**
   * Get recent unflagged (non-dismissed) flags.
   */
  getRecentFlags(limit = 20): Array<{
    id: string;
    contentId: string;
    contentType: string;
    flaggedAt: string;
    confidence: number;
    patterns: DetectedPattern[];
    reframe: string;
  }> {
    const rows = this.db.prepare(`
      SELECT * FROM dark_pattern_flags
      WHERE dismissed = 0
      ORDER BY flagged_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      content_id: string;
      content_type: string;
      flagged_at: string;
      confidence: number;
      patterns_json: string;
      reframe: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      contentId: r.content_id,
      contentType: r.content_type,
      flaggedAt: r.flagged_at,
      confidence: r.confidence,
      patterns: JSON.parse(r.patterns_json) as DetectedPattern[],
      reframe: r.reframe,
    }));
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private storeFlag(content: ContentForAnalysis, result: DarkPatternResult): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO dark_pattern_flags (id, content_id, content_type, flagged_at, confidence, patterns_json, reframe, dismissed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      nanoid(),
      content.id,
      content.contentType,
      new Date().toISOString(),
      result.confidence,
      JSON.stringify(result.patterns),
      result.reframe,
    );
  }
}
