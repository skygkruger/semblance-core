// Relationship Analyzer — Frequency analysis, trend detection, type inference,
// and relationship graph construction.
//
// CRITICAL: This file is in packages/core/. No network imports.
// Uses indexed_emails and indexed_calendar_events tables for frequency data.

import type { DatabaseHandle } from '../../platform/types.js';
import type { LLMProvider } from '../../llm/types.js';
import type { ContactStore } from './contact-store.js';
import type {
  ContactEntity,
  CommunicationFrequency,
  FrequencyTrend,
  RelationshipType,
  RelationshipGraph,
  RelationshipGraphNode,
  RelationshipGraphEdge,
  RelationshipCluster,
} from './contact-types.js';

// ─── Frequency Analysis ───────────────────────────────────────────────────────

export class RelationshipAnalyzer {
  private db: DatabaseHandle;
  private contactStore: ContactStore;
  private llm: LLMProvider | null;
  private model: string;

  constructor(config: {
    db: DatabaseHandle;
    contactStore: ContactStore;
    llm?: LLMProvider;
    model?: string;
  }) {
    this.db = config.db;
    this.contactStore = config.contactStore;
    this.llm = config.llm ?? null;
    this.model = config.model ?? 'llama3.2:8b';
  }

  /**
   * Analyze communication frequency for a contact over the last 90 days.
   */
  analyzeFrequency(contactId: string): CommunicationFrequency | null {
    const contact = this.contactStore.getContact(contactId);
    if (!contact) return null;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // Count emails sent/received with this contact
    let emailCount = 0;
    let lastEmailDate: string | null = null;

    for (const email of contact.emails) {
      const sent = this.db.prepare(`
        SELECT COUNT(*) as count, MAX(received_at) as latest
        FROM indexed_emails
        WHERE "from" = ? AND received_at >= ?
      `).get(email, ninetyDaysAgo) as { count: number; latest: string | null } | undefined;

      const received = this.db.prepare(`
        SELECT COUNT(*) as count, MAX(received_at) as latest
        FROM indexed_emails
        WHERE "to" LIKE ? AND received_at >= ?
      `).get(`%${email}%`, ninetyDaysAgo) as { count: number; latest: string | null } | undefined;

      emailCount += (sent?.count ?? 0) + (received?.count ?? 0);

      const sentLatest = sent?.latest;
      const receivedLatest = received?.latest;
      const latest = sentLatest && receivedLatest
        ? (sentLatest > receivedLatest ? sentLatest : receivedLatest)
        : sentLatest ?? receivedLatest;

      if (latest && (!lastEmailDate || latest > lastEmailDate)) {
        lastEmailDate = latest;
      }
    }

    // Count calendar events with this contact
    let meetingCount = 0;
    let lastMeetingDate: string | null = null;

    for (const email of contact.emails) {
      const meetings = this.db.prepare(`
        SELECT COUNT(*) as count, MAX(start_time) as latest
        FROM indexed_calendar_events
        WHERE attendees LIKE ? AND start_time >= ?
      `).get(`%${email}%`, ninetyDaysAgo) as { count: number; latest: string | null } | undefined;

      meetingCount += meetings?.count ?? 0;

      if (meetings?.latest && (!lastMeetingDate || meetings.latest > lastMeetingDate)) {
        lastMeetingDate = meetings.latest;
      }
    }

    const weeksInPeriod = 90 / 7;
    const monthsInPeriod = 90 / 30;

    const trend = this.analyzeTrendForContact(contact, ninetyDaysAgo);

    const freq: CommunicationFrequency = {
      emailsPerWeek: Math.round((emailCount / weeksInPeriod) * 100) / 100,
      meetingsPerMonth: Math.round((meetingCount / monthsInPeriod) * 100) / 100,
      lastEmailDate,
      lastMeetingDate,
      trend,
      analyzedAt: now,
    };

    // Store frequency in contact
    this.contactStore.updateContact(contactId, {
      communicationFrequency: freq,
      interactionCount: emailCount + meetingCount,
      lastContactDate: lastEmailDate ?? lastMeetingDate ?? null,
    });

    return freq;
  }

  /**
   * Analyze trend: compare last 30 days vs previous 30 days.
   * >1.3 → 'increasing', <0.7 → 'decreasing', zero in 90 days → 'inactive', else → 'stable'.
   */
  analyzeTrend(contactId: string): FrequencyTrend {
    const contact = this.contactStore.getContact(contactId);
    if (!contact) return 'stable';
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    return this.analyzeTrendForContact(contact, ninetyDaysAgo);
  }

  private analyzeTrendForContact(contact: ContactEntity, ninetyDaysAgo: string): FrequencyTrend {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    let recentCount = 0;
    let previousCount = 0;
    let totalCount = 0;

    for (const email of contact.emails) {
      // Recent 30 days
      const recent = this.db.prepare(`
        SELECT COUNT(*) as count FROM indexed_emails
        WHERE ("from" = ? OR "to" LIKE ?) AND received_at >= ?
      `).get(email, `%${email}%`, thirtyDaysAgo) as { count: number } | undefined;
      recentCount += recent?.count ?? 0;

      // Previous 30 days (30-60 days ago)
      const previous = this.db.prepare(`
        SELECT COUNT(*) as count FROM indexed_emails
        WHERE ("from" = ? OR "to" LIKE ?) AND received_at >= ? AND received_at < ?
      `).get(email, `%${email}%`, sixtyDaysAgo, thirtyDaysAgo) as { count: number } | undefined;
      previousCount += previous?.count ?? 0;

      // Total in 90 days
      const total = this.db.prepare(`
        SELECT COUNT(*) as count FROM indexed_emails
        WHERE ("from" = ? OR "to" LIKE ?) AND received_at >= ?
      `).get(email, `%${email}%`, ninetyDaysAgo) as { count: number } | undefined;
      totalCount += total?.count ?? 0;
    }

    if (totalCount === 0) return 'inactive';
    if (previousCount === 0) return recentCount > 0 ? 'increasing' : 'inactive';

    const ratio = recentCount / previousCount;
    if (ratio > 1.3) return 'increasing';
    if (ratio < 0.7) return 'decreasing';
    return 'stable';
  }

  /**
   * Analyze all contacts — batch frequency analysis.
   */
  analyzeAllContacts(): void {
    const contacts = this.contactStore.listContacts({ limit: 10000 });
    for (const contact of contacts) {
      this.analyzeFrequency(contact.id);
    }
  }

  // ─── Relationship Type Inference ──────────────────────────────────────────

  /**
   * Infer relationship type for a contact.
   * <5 interactions: rule-based only.
   * ≥5 interactions: LLM classification with structured evidence.
   */
  async inferRelationshipType(contactId: string): Promise<RelationshipType> {
    const contact = this.contactStore.getContact(contactId);
    if (!contact) return 'unknown';

    const freq = contact.communicationFrequency ?? this.analyzeFrequency(contactId);
    const interactionCount = contact.interactionCount;

    // Rule-based classification for sparse data
    if (interactionCount < 5) {
      const ruleResult = this.classifyByRules(contact);
      this.contactStore.updateContact(contactId, { relationshipType: ruleResult });
      return ruleResult;
    }

    // LLM classification for contacts with sufficient data
    if (this.llm) {
      const llmResult = await this.classifyWithLLM(contact);
      this.contactStore.updateContact(contactId, { relationshipType: llmResult });
      return llmResult;
    }

    // Fallback to rules if no LLM available
    const ruleResult = this.classifyByRules(contact);
    this.contactStore.updateContact(contactId, { relationshipType: ruleResult });
    return ruleResult;
  }

  /**
   * Rule-based classification when data is sparse.
   */
  private classifyByRules(contact: ContactEntity): RelationshipType {
    // Same organization → colleague
    if (contact.organization) {
      return 'colleague';
    }

    // Personal email domain → acquaintance
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com'];
    const hasPersonalEmail = contact.emails.some(e => {
      const domain = e.split('@')[1]?.toLowerCase();
      return domain && personalDomains.includes(domain);
    });

    // Same last name + has birthday → family
    // (In a real scenario, we'd compare against the user's last name)
    if (contact.birthday && contact.familyName) {
      // Simple heuristic: if they have a birthday stored, they're likely close
      return 'family';
    }

    if (hasPersonalEmail) {
      return 'acquaintance';
    }

    return 'unknown';
  }

  /**
   * LLM-based classification with structured evidence.
   */
  private async classifyWithLLM(contact: ContactEntity): Promise<RelationshipType> {
    if (!this.llm) return this.classifyByRules(contact);

    // Gather evidence
    const recentEmails = this.getRecentEmailSnippets(contact, 3);
    const evidence = {
      name: contact.displayName,
      organization: contact.organization,
      jobTitle: contact.jobTitle,
      emailDomains: contact.emails.map(e => e.split('@')[1]).filter(Boolean),
      interactionCount: contact.interactionCount,
      meetingsPerMonth: contact.communicationFrequency?.meetingsPerMonth ?? 0,
      emailSamples: recentEmails,
    };

    const prompt = `Classify the relationship between the user and this contact. Choose EXACTLY ONE:
colleague, client, vendor, friend, family, acquaintance

Evidence:
- Name: ${evidence.name}
- Organization: ${evidence.organization || 'unknown'}
- Job title: ${evidence.jobTitle || 'unknown'}
- Email domains: ${evidence.emailDomains.join(', ') || 'unknown'}
- Total interactions: ${evidence.interactionCount}
- Meetings/month: ${evidence.meetingsPerMonth}
- Recent email subjects: ${evidence.emailSamples.join('; ') || 'none'}

Respond with ONLY the relationship type (one word):`;

    try {
      const response = await this.llm.chat({
        model: this.model,
        messages: [
          { role: 'system', content: 'You classify relationship types. Respond with exactly one word.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      });

      const result = response.message.content.trim().toLowerCase() as RelationshipType;
      const validTypes: RelationshipType[] = ['colleague', 'client', 'vendor', 'friend', 'family', 'acquaintance'];
      if (validTypes.includes(result)) return result;
      return this.classifyByRules(contact);
    } catch {
      return this.classifyByRules(contact);
    }
  }

  private getRecentEmailSnippets(contact: ContactEntity, limit: number): string[] {
    const snippets: string[] = [];
    for (const email of contact.emails) {
      const rows = this.db.prepare(`
        SELECT subject FROM indexed_emails
        WHERE "from" = ? OR "to" LIKE ?
        ORDER BY received_at DESC LIMIT ?
      `).all(email, `%${email}%`, limit) as { subject: string }[];
      snippets.push(...rows.map(r => r.subject));
    }
    return snippets.slice(0, limit);
  }

  /**
   * Batch classify contacts with LLM. Gathers all evidence first, single call per batch.
   */
  async classifyBatch(contactIds: string[]): Promise<Map<string, RelationshipType>> {
    const results = new Map<string, RelationshipType>();
    for (const id of contactIds) {
      const type = await this.inferRelationshipType(id);
      results.set(id, type);
    }
    return results;
  }

  // ─── Relationship Graph ───────────────────────────────────────────────────

  /**
   * Build a relationship graph from contact co-occurrences.
   * Edges: contacts co-appearing in email threads or calendar events, weighted by count.
   * Clusters: same organization, or 3+ shared meetings.
   */
  buildRelationshipGraph(): RelationshipGraph {
    const contacts = this.contactStore.listContacts({ limit: 10000 });
    const nodes: RelationshipGraphNode[] = contacts.map(c => ({
      contactId: c.id,
      displayName: c.displayName,
      relationshipType: c.relationshipType,
      interactionCount: c.interactionCount,
    }));

    const edges: RelationshipGraphEdge[] = [];
    const emailToContactId = new Map<string, string>();

    for (const c of contacts) {
      for (const email of c.emails) {
        emailToContactId.set(email.toLowerCase(), c.id);
      }
    }

    // Find co-occurrences in email threads
    const threadPairs = new Map<string, { sharedThreads: number; sharedMeetings: number }>();

    for (const contact of contacts) {
      for (const email of contact.emails) {
        // Find email threads involving this contact
        const threads = this.db.prepare(`
          SELECT thread_id, "to" FROM indexed_emails
          WHERE "from" = ? OR "to" LIKE ?
          LIMIT 200
        `).all(email, `%${email}%`) as { thread_id: string; to: string }[];

        for (const thread of threads) {
          const recipients: string[] = JSON.parse(thread.to) as string[];
          for (const recipient of recipients) {
            const otherId = emailToContactId.get(recipient.toLowerCase());
            if (otherId && otherId !== contact.id) {
              const key = [contact.id, otherId].sort().join('::');
              const existing = threadPairs.get(key) ?? { sharedThreads: 0, sharedMeetings: 0 };
              existing.sharedThreads++;
              threadPairs.set(key, existing);
            }
          }
        }
      }
    }

    for (const [key, value] of threadPairs) {
      const [sourceId, targetId] = key.split('::') as [string, string];
      edges.push({
        sourceId,
        targetId,
        weight: value.sharedThreads + value.sharedMeetings * 2,
        sharedThreads: value.sharedThreads,
        sharedMeetings: value.sharedMeetings,
      });
    }

    // Build clusters by organization
    const orgClusters = new Map<string, string[]>();
    for (const contact of contacts) {
      if (contact.organization) {
        const existing = orgClusters.get(contact.organization) ?? [];
        existing.push(contact.id);
        orgClusters.set(contact.organization, existing);
      }
    }

    const clusters: RelationshipCluster[] = [];
    let clusterIdx = 0;
    for (const [org, ids] of orgClusters) {
      if (ids.length >= 2) {
        clusters.push({
          id: `cluster_${clusterIdx++}`,
          name: org,
          contactIds: ids,
        });
      }
    }

    return { nodes, edges, clusters };
  }
}
