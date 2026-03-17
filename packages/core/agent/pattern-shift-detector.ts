// Pattern Shift Detector — Detects meaningful changes in how specific people
// communicate with the user over time.
//
// Detection methods:
// - Length decreasing: mean email length drops >40% in last 3 weeks vs prior 3 weeks
// - Response time increasing: mean time-to-reply doubles
// - Formality increasing: heuristic formality score increases significantly
// - Topic narrowing: distinct topic count drops >50%
//
// Pattern shifts surface as ProactiveInsight records with type 'contact_frequency'.
// They do NOT generate notifications — they surface in the morning brief and
// relationships screen as contextual observations.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PatternShift {
  contactId: string;
  contactName: string;
  shiftType: 'length_decreasing' | 'response_time_increasing' | 'formality_increasing' | 'topic_narrowing';
  description: string;
  confidence: number;
  windowDays: number;
  detectedAt: string;
}

// ─── Pattern Shift Detector ────────────────────────────────────────────────────

export class PatternShiftDetector {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
  }

  /**
   * Detect pattern shifts for all active relationships.
   * Runs weekly via kg-maintenance cron job.
   */
  async detectShifts(): Promise<PatternShift[]> {
    const shifts: PatternShift[] = [];

    // Get contacts with sufficient email history
    const contacts = this.db.prepare(`
      SELECT c.id, c.display_name, c.emails, c.relationship_type
      FROM contacts c
      WHERE c.relationship_type NOT IN ('unknown', 'acquaintance')
    `).all() as Array<{
      id: string;
      display_name: string;
      emails: string;
      relationship_type: string;
    }>;

    for (const contact of contacts) {
      let contactEmails: string[];
      try {
        contactEmails = JSON.parse(contact.emails || '[]') as string[];
      } catch { continue; }

      if (contactEmails.length === 0) continue;

      // Get emails from this contact, split into recent (3 weeks) and prior (3 weeks before that)
      const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
      const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString();

      const recentEmails = this.getEmailsFromContact(contactEmails, threeWeeksAgo, new Date().toISOString());
      const priorEmails = this.getEmailsFromContact(contactEmails, sixWeeksAgo, threeWeeksAgo);

      if (recentEmails.length < 3 || priorEmails.length < 3) continue;

      // Length decreasing detection
      const recentAvgLen = avg(recentEmails.map(e => e.snippetLen));
      const priorAvgLen = avg(priorEmails.map(e => e.snippetLen));

      if (priorAvgLen > 0 && recentAvgLen / priorAvgLen < 0.6) {
        shifts.push({
          contactId: contact.id,
          contactName: contact.display_name,
          shiftType: 'length_decreasing',
          description: `${contact.display_name}'s emails have been shorter over the last 3 weeks (${Math.round(recentAvgLen)} chars avg vs ${Math.round(priorAvgLen)} previously)`,
          confidence: Math.min(0.9, 0.5 + (1 - recentAvgLen / priorAvgLen) * 0.5),
          windowDays: 42,
          detectedAt: new Date().toISOString(),
        });
      }

      // Response time increasing detection
      const recentResponseMs = this.getResponseTimes(contactEmails, threeWeeksAgo, new Date().toISOString());
      const priorResponseMs = this.getResponseTimes(contactEmails, sixWeeksAgo, threeWeeksAgo);

      if (recentResponseMs.length >= 2 && priorResponseMs.length >= 2) {
        const recentAvgResponse = avg(recentResponseMs);
        const priorAvgResponse = avg(priorResponseMs);

        if (priorAvgResponse > 0 && recentAvgResponse / priorAvgResponse > 2.0) {
          const recentHours = Math.round(recentAvgResponse / (1000 * 60 * 60));
          const priorHours = Math.round(priorAvgResponse / (1000 * 60 * 60));
          shifts.push({
            contactId: contact.id,
            contactName: contact.display_name,
            shiftType: 'response_time_increasing',
            description: `${contact.display_name}'s response time has increased significantly (${recentHours}h avg vs ${priorHours}h previously)`,
            confidence: Math.min(0.8, 0.4 + Math.min(recentResponseMs.length, 5) * 0.08),
            windowDays: 42,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // Formality increasing detection (heuristic: formal greeting/closing patterns)
      const recentFormality = avg(recentEmails.map(e => this.formalityScore(e.snippet)));
      const priorFormality = avg(priorEmails.map(e => this.formalityScore(e.snippet)));

      if (recentFormality - priorFormality > 1.5) {
        shifts.push({
          contactId: contact.id,
          contactName: contact.display_name,
          shiftType: 'formality_increasing',
          description: `${contact.display_name}'s emails have become more formal over the last 3 weeks`,
          confidence: Math.min(0.7, 0.3 + (recentFormality - priorFormality) * 0.2),
          windowDays: 42,
          detectedAt: new Date().toISOString(),
        });
      }

      // Topic narrowing detection (distinct first-word topics)
      const recentTopics = new Set(recentEmails.map(e => extractTopicKey(e.subject)));
      const priorTopics = new Set(priorEmails.map(e => extractTopicKey(e.subject)));

      if (priorTopics.size >= 3 && recentTopics.size / priorTopics.size < 0.5) {
        shifts.push({
          contactId: contact.id,
          contactName: contact.display_name,
          shiftType: 'topic_narrowing',
          description: `Communication with ${contact.display_name} has narrowed in scope (${recentTopics.size} topics vs ${priorTopics.size} previously)`,
          confidence: Math.min(0.7, 0.4 + (1 - recentTopics.size / priorTopics.size) * 0.4),
          windowDays: 42,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return shifts;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private getEmailsFromContact(
    contactEmails: string[],
    after: string,
    before: string,
  ): Array<{ snippet: string; snippetLen: number; subject: string }> {
    const results: Array<{ snippet: string; snippetLen: number; subject: string }> = [];

    for (const email of contactEmails) {
      const rows = this.db.prepare(`
        SELECT snippet, LENGTH(snippet) as snippet_len, subject
        FROM indexed_emails
        WHERE "from" = ? AND received_at >= ? AND received_at < ?
        ORDER BY received_at DESC LIMIT 20
      `).all(email, after, before) as Array<{ snippet: string; snippet_len: number; subject: string }>;

      for (const row of rows) {
        results.push({ snippet: row.snippet, snippetLen: row.snippet_len, subject: row.subject });
      }
    }

    return results;
  }

  private getResponseTimes(contactEmails: string[], after: string, before: string): number[] {
    const times: number[] = [];

    for (const email of contactEmails) {
      const incoming = this.db.prepare(`
        SELECT thread_id, received_at FROM indexed_emails
        WHERE "from" = ? AND received_at >= ? AND received_at < ?
        ORDER BY received_at ASC LIMIT 10
      `).all(email, after, before) as Array<{ thread_id: string; received_at: string }>;

      for (const msg of incoming) {
        const reply = this.db.prepare(`
          SELECT received_at FROM indexed_emails
          WHERE thread_id = ? AND "from" = ? AND received_at > ?
          ORDER BY received_at ASC LIMIT 1
        `).get(msg.thread_id, email, msg.received_at) as { received_at: string } | undefined;

        if (reply) {
          const diffMs = new Date(reply.received_at).getTime() - new Date(msg.received_at).getTime();
          if (diffMs > 0 && diffMs < 7 * 24 * 60 * 60 * 1000) {
            times.push(diffMs);
          }
        }
      }
    }

    return times;
  }

  /**
   * Heuristic formality score (1-5 scale).
   * Looks for formal greetings, closings, and language patterns.
   */
  private formalityScore(text: string): number {
    let score = 3; // neutral baseline

    // Formal indicators
    if (/\b(Dear|Respected|Esteemed)\b/i.test(text)) score += 1.5;
    if (/\b(Sincerely|Regards|Best regards|Kind regards|Respectfully)\b/i.test(text)) score += 1;
    if (/\b(Please find attached|As per our|In accordance|Per your request)\b/i.test(text)) score += 0.5;
    if (/\b(Mr\.|Mrs\.|Ms\.|Dr\.)\b/.test(text)) score += 0.5;

    // Informal indicators
    if (/\b(Hey|Yo|Sup|Hiya)\b/i.test(text)) score -= 1.5;
    if (/\b(lol|haha|btw|fyi|tbh|omg)\b/i.test(text)) score -= 1;
    if (/[!]{2,}/.test(text)) score -= 0.5;
    if (/[:;]-?[)D(P]/.test(text)) score -= 0.5; // emoticons

    return Math.max(1, Math.min(5, score));
  }
}

// ─── Utility functions ─────────────────────────────────────────────────────────

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function extractTopicKey(subject: string): string {
  // Remove Re:/Fwd: prefixes, then take first 2 meaningful words
  const cleaned = subject.replace(/^(Re:|Fwd:|FW:)\s*/gi, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 2).slice(0, 2);
  return words.join(' ').toLowerCase() || 'other';
}
