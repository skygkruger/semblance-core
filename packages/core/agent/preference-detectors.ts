// Preference Detectors — Background analysis tasks that detect behavioral patterns.
// Run weekly via kg-maintenance CronScheduler job.
// Each detector reads the knowledge graph and emails to find behavioral patterns,
// then emits PreferenceSignal objects fed into PreferenceGraph.recordSignal().
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { PreferenceSignal } from './preference-graph.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PreferenceDetectorDeps {
  db: DatabaseHandle;
}

// ─── Temporal Response Detector ────────────────────────────────────────────────

/**
 * For each high-relationship contact, measure the distribution of response times.
 * If the user consistently responds within 1 hour to emails from a specific sender
 * category (accountant, manager, etc.), emit a preference signal.
 */
export function detectTemporalResponsePatterns(deps: PreferenceDetectorDeps): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Get contacts with known relationship types and sufficient email history
  const contacts = deps.db.prepare(`
    SELECT c.id, c.display_name, c.relationship_type, c.emails
    FROM contacts c
    WHERE c.relationship_type NOT IN ('unknown', 'acquaintance')
  `).all() as Array<{
    id: string;
    display_name: string;
    relationship_type: string;
    emails: string;
  }>;

  for (const contact of contacts) {
    let contactEmails: string[];
    try {
      contactEmails = JSON.parse(contact.emails || '[]') as string[];
    } catch { continue; }

    if (contactEmails.length === 0) continue;

    // Find sent email response times to this contact
    // Look at emails FROM this contact, then find our replies within the same thread
    const responseTimes: number[] = [];
    for (const email of contactEmails) {
      const incomingEmails = deps.db.prepare(`
        SELECT thread_id, received_at FROM indexed_emails
        WHERE "from" = ? AND received_at > datetime('now', '-90 days')
        ORDER BY received_at ASC LIMIT 20
      `).all(email) as Array<{ thread_id: string; received_at: string }>;

      for (const incoming of incomingEmails) {
        // Find our reply in the same thread
        const reply = deps.db.prepare(`
          SELECT received_at FROM indexed_emails
          WHERE thread_id = ? AND "from" != ? AND received_at > ?
          ORDER BY received_at ASC LIMIT 1
        `).get(incoming.thread_id, email, incoming.received_at) as { received_at: string } | undefined;

        if (reply) {
          const diffMs = new Date(reply.received_at).getTime() - new Date(incoming.received_at).getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 0 && diffHours < 168) { // within a week
            responseTimes.push(diffHours);
          }
        }
      }
    }

    if (responseTimes.length < 3) continue; // need enough data

    const avgResponseHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const medianResponseHours = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)] ?? avgResponseHours;

    if (medianResponseHours <= 1) {
      signals.push({
        domain: 'email',
        pattern: `responds to ${contact.relationship_type} (${contact.display_name}) within 1 hour`,
        actionType: 'email.send',
        confidence: Math.min(0.9, 0.5 + responseTimes.length * 0.05),
        evidence: { contactId: contact.id, medianResponseHours, sampleSize: responseTimes.length },
      });
    } else if (medianResponseHours <= 4) {
      signals.push({
        domain: 'email',
        pattern: `responds to ${contact.relationship_type} (${contact.display_name}) within 4 hours`,
        confidence: Math.min(0.7, 0.3 + responseTimes.length * 0.04),
        evidence: { contactId: contact.id, medianResponseHours, sampleSize: responseTimes.length },
      });
    }
  }

  return signals;
}

// ─── Meeting Time Detector ─────────────────────────────────────────────────────

/**
 * Analyze accepted vs declined meeting invitations.
 * Detect patterns like "rarely accepts meetings before 9am" or
 * "prefers afternoon for deep work".
 */
export function detectMeetingTimePatterns(deps: PreferenceDetectorDeps): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Analyze meeting start times over the last 90 days
  const events = deps.db.prepare(`
    SELECT start_time, status FROM indexed_calendar_events
    WHERE start_time > datetime('now', '-90 days')
      AND is_all_day = 0
    ORDER BY start_time ASC
  `).all() as Array<{ start_time: string; status: string }>;

  if (events.length < 5) return signals;

  // Count meetings by hour
  const hourCounts: Record<number, number> = {};
  for (const event of events) {
    if (event.status === 'cancelled') continue;
    const hour = new Date(event.start_time).getHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
  }

  // Detect early morning avoidance (before 9am)
  const earlyMorningCount = Object.entries(hourCounts)
    .filter(([h]) => parseInt(h) < 9)
    .reduce((sum, [, count]) => sum + count, 0);
  const totalCount = events.filter(e => e.status !== 'cancelled').length;

  if (totalCount >= 10 && earlyMorningCount / totalCount < 0.05) {
    signals.push({
      domain: 'calendar',
      pattern: 'rarely accepts meetings before 9am',
      actionType: 'calendar.create',
      confidence: 0.7,
      evidence: { earlyMorningCount, totalCount },
    });
  }

  // Detect afternoon preference (2-5pm)
  const afternoonCount = Object.entries(hourCounts)
    .filter(([h]) => parseInt(h) >= 14 && parseInt(h) < 17)
    .reduce((sum, [, count]) => sum + count, 0);

  if (totalCount >= 10 && afternoonCount / totalCount > 0.4) {
    signals.push({
      domain: 'calendar',
      pattern: 'prefers afternoon meetings (2-5pm)',
      confidence: 0.6,
      evidence: { afternoonCount, totalCount },
    });
  }

  return signals;
}

// ─── Format Preference Detector ────────────────────────────────────────────────

/**
 * Track communication length patterns (short replies vs long).
 */
export function detectFormatPatterns(deps: PreferenceDetectorDeps): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Analyze sent email lengths over the last 90 days
  const sentEmails = deps.db.prepare(`
    SELECT snippet, LENGTH(snippet) as len FROM indexed_emails
    WHERE received_at > datetime('now', '-90 days')
    ORDER BY received_at DESC LIMIT 100
  `).all() as Array<{ snippet: string; len: number }>;

  if (sentEmails.length < 10) return signals;

  const avgLen = sentEmails.reduce((sum, e) => sum + e.len, 0) / sentEmails.length;

  if (avgLen < 80) {
    signals.push({
      domain: 'email',
      pattern: 'prefers concise email communication (avg < 80 chars)',
      confidence: 0.6,
      evidence: { avgLength: avgLen, sampleSize: sentEmails.length },
    });
  } else if (avgLen > 150) {
    signals.push({
      domain: 'email',
      pattern: 'prefers detailed email communication (avg > 150 chars)',
      confidence: 0.6,
      evidence: { avgLength: avgLen, sampleSize: sentEmails.length },
    });
  }

  return signals;
}

// ─── System Behavior Detector ──────────────────────────────────────────────────

/**
 * Track file organization conventions from the knowledge graph.
 */
export function detectSystemPatterns(deps: PreferenceDetectorDeps): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Check for file organization patterns from indexed directories
  try {
    const docs = deps.db.prepare(`
      SELECT source_path, mime_type FROM documents
      WHERE source = 'local_file' AND created_at > datetime('now', '-90 days')
      LIMIT 200
    `).all() as Array<{ source_path: string; mime_type: string }>;

    if (docs.length < 10) return signals;

    // Detect common file extension usage
    const extCounts: Record<string, number> = {};
    for (const doc of docs) {
      const ext = doc.source_path.split('.').pop()?.toLowerCase() ?? '';
      if (ext) extCounts[ext] = (extCounts[ext] ?? 0) + 1;
    }

    const totalFiles = docs.length;
    const topExt = Object.entries(extCounts).sort(([, a], [, b]) => b - a)[0];

    if (topExt && topExt[1] / totalFiles > 0.4) {
      signals.push({
        domain: 'system',
        pattern: `predominantly works with .${topExt[0]} files (${Math.round(topExt[1] / totalFiles * 100)}%)`,
        confidence: 0.5,
        evidence: { topExtension: topExt[0], ratio: topExt[1] / totalFiles },
      });
    }
  } catch {
    // documents table may not exist yet — skip
  }

  return signals;
}

// ─── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run all preference detectors and return all detected signals.
 * Called by kg-maintenance cron job.
 */
export function runAllPreferenceDetectors(deps: PreferenceDetectorDeps): PreferenceSignal[] {
  const allSignals: PreferenceSignal[] = [];

  try { allSignals.push(...detectTemporalResponsePatterns(deps)); } catch (e) {
    console.error('[PreferenceDetectors] Temporal response detection failed:', e);
  }
  try { allSignals.push(...detectMeetingTimePatterns(deps)); } catch (e) {
    console.error('[PreferenceDetectors] Meeting time detection failed:', e);
  }
  try { allSignals.push(...detectFormatPatterns(deps)); } catch (e) {
    console.error('[PreferenceDetectors] Format pattern detection failed:', e);
  }
  try { allSignals.push(...detectSystemPatterns(deps)); } catch (e) {
    console.error('[PreferenceDetectors] System pattern detection failed:', e);
  }

  return allSignals;
}
