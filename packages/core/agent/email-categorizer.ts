// Email Categorizer — Uses the local LLM to classify emails by category and priority.
//
// AUTONOMOUS DECISION: Categorization uses the same LLM model as chat. Batch
// processing groups up to 5 emails per LLM call. If Ollama is unavailable,
// categorization gracefully degrades to priority: 'normal' with no categories.
// Reasoning: No separate model needed, graceful degradation keeps the product working.
// Escalation check: Build prompt explicitly authorizes this design.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider } from '../llm/types.js';
import type { EmailIndexer, IndexedEmail } from '../knowledge/email-indexer.js';

// ─── Category Taxonomy ─────────────────────────────────────────────────────────

export const EMAIL_CATEGORIES = [
  'actionable',      // requires the user to do something
  'informational',   // FYI, no action needed
  'routine',         // meeting confirmations, receipts, shipping
  'newsletter',      // subscribed content
  'automated',       // Jira, GitHub, CI, system notifications
  'personal',        // from known personal contacts
  'commercial',      // promotions, marketing
  'urgent',          // time-sensitive, flagged
] as const;

export type EmailCategory = typeof EMAIL_CATEGORIES[number];

export interface CategorizationResult {
  messageId: string;
  categories: EmailCategory[];
  priority: 'high' | 'normal' | 'low';
}

// ─── Time-Saved Estimates ──────────────────────────────────────────────────────

/**
 * AUTONOMOUS DECISION: Conservative time-saved estimates per action type.
 * These are logged with every action in the audit trail for the weekly digest (Step 7).
 * Reasoning: Starting conservative is safer than over-counting.
 * Escalation check: Build prompt explicitly authorizes tuning these values.
 */
export const TIME_SAVED_ESTIMATES: Record<string, number> = {
  'categorize_email': 5,         // 5 seconds saved per email categorized
  'archive_email': 10,           // 10 seconds saved per email archived
  'draft_reply': 120,            // 2 minutes saved per draft
  'send_routine_reply': 180,     // 3 minutes saved per routine reply sent
  'meeting_prep': 600,           // 10 minutes saved per meeting brief
  'follow_up_reminder': 30,      // 30 seconds saved per reminder
  'conflict_detection': 120,     // 2 minutes saved per conflict found
  'create_event': 60,            // 1 minute saved per event created
};

// ─── Email Categorizer ─────────────────────────────────────────────────────────

export class EmailCategorizer {
  private llm: LLMProvider;
  private emailIndexer: EmailIndexer;
  private model: string;
  private batchSize: number;
  private cache: Map<string, CategorizationResult> = new Map();

  constructor(config: {
    llm: LLMProvider;
    emailIndexer: EmailIndexer;
    model: string;
    batchSize?: number;
  }) {
    this.llm = config.llm;
    this.emailIndexer = config.emailIndexer;
    this.model = config.model;
    this.batchSize = config.batchSize ?? 5;
  }

  /**
   * Categorize a single email. Uses cache to prevent re-categorization.
   */
  async categorizeEmail(email: IndexedEmail): Promise<CategorizationResult> {
    // Check cache first
    const cached = this.cache.get(email.messageId);
    if (cached) return cached;

    // Check if already categorized (labels not empty)
    const labels = JSON.parse(email.labels) as string[];
    if (labels.length > 0) {
      const result: CategorizationResult = {
        messageId: email.messageId,
        categories: labels as EmailCategory[],
        priority: email.priority,
      };
      this.cache.set(email.messageId, result);
      return result;
    }

    const results = await this.categorizeBatch([email]);
    return results[0] ?? { messageId: email.messageId, categories: [], priority: 'normal' };
  }

  /**
   * Categorize a batch of emails. Groups into sub-batches for LLM efficiency.
   */
  async categorizeBatch(emails: IndexedEmail[]): Promise<CategorizationResult[]> {
    const results: CategorizationResult[] = [];

    // Filter out already-categorized emails
    const uncategorized = emails.filter(e => {
      const labels = JSON.parse(e.labels) as string[];
      if (labels.length > 0) {
        results.push({
          messageId: e.messageId,
          categories: labels as EmailCategory[],
          priority: e.priority,
        });
        return false;
      }
      return !this.cache.has(e.messageId);
    });

    if (uncategorized.length === 0) return results;

    // Check if LLM is available
    const available = await this.llm.isAvailable();
    if (!available) {
      // Graceful degradation: mark as normal priority with no categories
      for (const email of uncategorized) {
        const fallback: CategorizationResult = {
          messageId: email.messageId,
          categories: [],
          priority: 'normal',
        };
        results.push(fallback);
        this.cache.set(email.messageId, fallback);
      }
      return results;
    }

    // Process in sub-batches
    for (let i = 0; i < uncategorized.length; i += this.batchSize) {
      const batch = uncategorized.slice(i, i + this.batchSize);

      try {
        const batchResults = await this.categorizeLLMBatch(batch);
        for (const result of batchResults) {
          results.push(result);
          this.cache.set(result.messageId, result);

          // Update the email indexer with categorization
          this.emailIndexer.updateCategorization(
            result.messageId,
            result.categories,
            result.priority,
          );
        }
      } catch {
        // Fall back to individual categorization if batch parsing fails
        for (const email of batch) {
          try {
            const result = await this.categorizeSingle(email);
            results.push(result);
            this.cache.set(result.messageId, result);
            this.emailIndexer.updateCategorization(
              result.messageId,
              result.categories,
              result.priority,
            );
          } catch {
            const fallback: CategorizationResult = {
              messageId: email.messageId,
              categories: [],
              priority: 'normal',
            };
            results.push(fallback);
            this.cache.set(email.messageId, fallback);
          }
        }
      }
    }

    return results;
  }

  /**
   * Categorize a single email via LLM.
   */
  private async categorizeSingle(email: IndexedEmail): Promise<CategorizationResult> {
    const prompt = this.buildPrompt(email);

    const response = await this.llm.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    const parsed = this.parseResponse(response.message.content, email.messageId);
    return parsed;
  }

  /**
   * Categorize a batch of emails via a single LLM call.
   */
  private async categorizeLLMBatch(emails: IndexedEmail[]): Promise<CategorizationResult[]> {
    if (emails.length === 1) {
      return [await this.categorizeSingle(emails[0]!)];
    }

    const prompt = this.buildBatchPrompt(emails);

    const response = await this.llm.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    return this.parseBatchResponse(response.message.content, emails);
  }

  /**
   * Build categorization prompt for a single email.
   */
  private buildPrompt(email: IndexedEmail): string {
    return `Categorize this email. Respond with a JSON object containing "categories" (array of applicable categories) and "priority" (high/normal/low).

Categories: actionable, informational, routine, newsletter, automated, personal, commercial, urgent

Email:
From: ${email.fromName} <${email.from}>
Subject: ${email.subject}
Date: ${email.receivedAt}
Snippet: ${email.snippet}

Respond ONLY with JSON: {"categories": [...], "priority": "..."}`;
  }

  /**
   * Build categorization prompt for a batch of emails.
   */
  private buildBatchPrompt(emails: IndexedEmail[]): string {
    const emailList = emails.map((e, i) =>
      `Email ${i + 1}:\nFrom: ${e.fromName} <${e.from}>\nSubject: ${e.subject}\nDate: ${e.receivedAt}\nSnippet: ${e.snippet}`
    ).join('\n\n');

    return `Categorize each email. For each, provide "categories" (array) and "priority" (high/normal/low).

Categories: actionable, informational, routine, newsletter, automated, personal, commercial, urgent

${emailList}

Respond ONLY with a JSON array of objects, one per email in order:
[{"categories": [...], "priority": "..."}, ...]`;
  }

  /**
   * Parse LLM response for a single email categorization.
   */
  private parseResponse(content: string, messageId: string): CategorizationResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { messageId, categories: [], priority: 'normal' };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        categories?: string[];
        priority?: string;
      };

      const validCategories = (parsed.categories ?? [])
        .filter(c => (EMAIL_CATEGORIES as readonly string[]).includes(c)) as EmailCategory[];

      const validPriority = ['high', 'normal', 'low'].includes(parsed.priority ?? '')
        ? parsed.priority as 'high' | 'normal' | 'low'
        : 'normal';

      return {
        messageId,
        categories: validCategories,
        priority: validPriority,
      };
    } catch {
      return { messageId, categories: [], priority: 'normal' };
    }
  }

  /**
   * Parse LLM response for a batch categorization.
   */
  private parseBatchResponse(content: string, emails: IndexedEmail[]): CategorizationResult[] {
    try {
      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        categories?: string[];
        priority?: string;
      }>;

      return emails.map((email, i) => {
        const item = parsed[i];
        if (!item) {
          return { messageId: email.messageId, categories: [], priority: 'normal' as const };
        }

        const validCategories = (item.categories ?? [])
          .filter(c => (EMAIL_CATEGORIES as readonly string[]).includes(c)) as EmailCategory[];

        const validPriority = ['high', 'normal', 'low'].includes(item.priority ?? '')
          ? item.priority as 'high' | 'normal' | 'low'
          : 'normal';

        return {
          messageId: email.messageId,
          categories: validCategories,
          priority: validPriority,
        };
      });
    } catch {
      // Batch parsing failed — caller should fall back to individual categorization
      throw new Error('Batch parsing failed');
    }
  }

  /**
   * Clear the categorization cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
