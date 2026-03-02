// IntentDriftAnalyzer — Behavioral analysis for intent drift detection.
//
// DATA BOUNDARY (HARD RULE):
// Queries audit trail for last 7 days of action-type frequency ONLY.
// Aggregated counts by action type and time bucket. NEVER reads message content,
// email bodies, document text, or payload fields. The SQL query selects
// action, COUNT(*) as count, DATE(timestamp) as day FROM audit_log
// GROUP BY action, DATE(timestamp). No payload columns, no content columns,
// no JOIN to message tables.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { LLMProvider, GenerateRequest } from '../llm/types.js';
import type { IntentManager } from './intent-manager.js';
import type { IntentObservation } from './intent-types.js';
import { nanoid } from 'nanoid';

export interface IntentDriftAnalyzerConfig {
  db: DatabaseHandle;
  intentManager: IntentManager;
  llm?: LLMProvider;
  model?: string;
}

interface ActionFrequency {
  action: string;
  count: number;
  day: string;
}

export class IntentDriftAnalyzer {
  private db: DatabaseHandle;
  private intentManager: IntentManager;
  private llm: LLMProvider | null;
  private model: string | null;

  constructor(config: IntentDriftAnalyzerConfig) {
    this.db = config.db;
    this.intentManager = config.intentManager;
    this.llm = config.llm ?? null;
    this.model = config.model ?? null;
  }

  /**
   * Analyze behavioral patterns from audit trail and compare against stated values/goals.
   * Returns observations (drift, alignment, conflict) for the last 7 days.
   *
   * DATA BOUNDARY: Only reads aggregated action counts. Never reads content.
   */
  async analyzeBehaviorPatterns(): Promise<IntentObservation[]> {
    const intent = this.intentManager.getIntent();
    if (!intent || (!intent.primaryGoal && intent.personalValues.length === 0)) {
      return []; // No intent to compare against
    }

    // Query aggregated action frequencies — ONLY counts, grouped by action type and day
    const frequencies = this.getActionFrequencies();
    if (frequencies.length === 0) return [];

    // Build summary of behavioral patterns (aggregate only, no content)
    const summary = this.buildBehavioralSummary(frequencies);
    if (!summary) return [];

    // If no LLM, skip analysis (can't detect drift without reasoning)
    if (!this.llm || !this.model) return [];

    return this.generateObservations(intent, summary);
  }

  /**
   * Get aggregated action frequencies for the last 7 days.
   * HARD RULE: Only selects action type and count. No payload, no content.
   */
  private getActionFrequencies(): ActionFrequency[] {
    try {
      // Check if the audit_trail table exists (it's in gateway DB, might be separate)
      // Fall back to action_log table which is in the core DB
      const rows = this.db.prepare(`
        SELECT action, COUNT(*) as count, DATE(created_at) as day
        FROM pending_actions
        WHERE created_at > datetime('now', '-7 days')
          AND status != 'pending_approval'
        GROUP BY action, DATE(created_at)
        ORDER BY day ASC, count DESC
      `).all() as ActionFrequency[];
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Build a behavioral summary from action frequencies.
   * Returns a human-readable aggregate (e.g., "12 emails sent, 3 calendar events created").
   */
  private buildBehavioralSummary(frequencies: ActionFrequency[]): string | null {
    // Aggregate across days
    const totals = new Map<string, number>();
    for (const f of frequencies) {
      totals.set(f.action, (totals.get(f.action) ?? 0) + f.count);
    }

    if (totals.size === 0) return null;

    const parts: string[] = [];
    for (const [action, count] of totals) {
      parts.push(`${count} ${action.replace(/\./g, ' ')} action${count !== 1 ? 's' : ''}`);
    }
    return `This week: ${parts.join(', ')}.`;
  }

  /**
   * Use LLM to generate drift observations by comparing behavior against intent.
   */
  private async generateObservations(
    intent: NonNullable<ReturnType<IntentManager['getIntent']>>,
    behavioralSummary: string,
  ): Promise<IntentObservation[]> {
    const intentSummary = [
      intent.primaryGoal ? `Goal: ${intent.primaryGoal}` : '',
      ...intent.personalValues.filter(v => v.active).map(v => `Value: ${v.rawText}`),
    ].filter(Boolean).join('\n');

    const prompt = `You are analyzing a user's recent behavior patterns against their stated values and goals.

STATED INTENT:
${intentSummary}

BEHAVIORAL SUMMARY (action counts only, no content):
${behavioralSummary}

Based on these aggregate patterns (NOT specific content), identify any alignment observations:
- "drift": behavior that may not align with stated values (e.g., stated family priority but no calendar events for personal time)
- "alignment": behavior that clearly supports stated goals
- "conflict": contradictory patterns

Output a JSON array of 0-2 observations. Each observation:
{"type": "drift"|"alignment"|"conflict", "description": "A gentle, curious observation. Never judgmental."}

If there's nothing notable, output an empty array: []

IMPORTANT: Be gentle and curious, not judgmental. Frame as questions, not accusations.
Example: "You mentioned family is important. This week's activity was heavily work-focused. Is that the balance you want?"`;

    try {
      const request: GenerateRequest = {
        model: this.model!,
        system: 'You analyze behavioral patterns. Output ONLY valid JSON arrays. Be gentle and curious.',
        prompt,
        temperature: 0.3,
        maxTokens: 512,
      };

      const response = await this.llm!.generate(request);
      const text = response.text.trim();

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as Array<{ type: string; description: string }>;
      if (!Array.isArray(parsed)) return [];

      const now = new Date().toISOString();
      return parsed
        .filter(p => (p.type === 'drift' || p.type === 'alignment' || p.type === 'conflict') && p.description)
        .slice(0, 2) // Max 2 observations per analysis
        .map(p => ({
          id: nanoid(),
          observedAt: now,
          type: p.type as IntentObservation['type'],
          description: p.description,
          evidence: [behavioralSummary],
          surfacedMorningBrief: false,
          surfacedInChat: false,
          dismissed: false,
        }));
    } catch {
      return [];
    }
  }
}
