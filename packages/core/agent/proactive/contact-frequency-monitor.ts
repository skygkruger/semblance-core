// Contact Frequency Monitor — Detects decreasing contact frequency and
// unresolved frequent email addresses.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../../platform/types.js';
import type { ContactStore } from '../../knowledge/contacts/contact-store.js';
import type { RelationshipAnalyzer } from '../../knowledge/contacts/relationship-analyzer.js';
import type { FrequencyAlert, ContactEntity } from '../../knowledge/contacts/contact-types.js';

export class ContactFrequencyMonitor {
  private db: DatabaseHandle;
  private contactStore: ContactStore;
  private analyzer: RelationshipAnalyzer;

  constructor(config: {
    db: DatabaseHandle;
    contactStore: ContactStore;
    analyzer: RelationshipAnalyzer;
  }) {
    this.db = config.db;
    this.contactStore = config.contactStore;
    this.analyzer = config.analyzer;
  }

  /**
   * Get contacts with decreasing communication frequency.
   * Filters out acquaintance/unknown — only meaningful relationships are alerted.
   */
  getDecreasingContacts(): FrequencyAlert[] {
    const contacts = this.contactStore.listContacts({ limit: 10000 });
    const alerts: FrequencyAlert[] = [];

    for (const contact of contacts) {
      if (contact.relationshipType === 'acquaintance' || contact.relationshipType === 'unknown') {
        continue;
      }

      const trend = this.analyzer.analyzeTrend(contact.id);
      if (trend !== 'decreasing' && trend !== 'inactive') continue;

      const gapDescription = this.describeGap(contact);

      alerts.push({
        contactId: contact.id,
        displayName: contact.displayName,
        relationshipType: contact.relationshipType,
        lastContactDate: contact.lastContactDate,
        gapDescription,
        trend,
      });
    }

    return alerts;
  }

  /**
   * Find email addresses that appear frequently (10+ emails in 90 days)
   * but don't match any known contact.
   */
  getUnresolvedFrequentContacts(): Array<{
    email: string;
    emailCount: number;
  }> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const rows = this.db.prepare(`
      SELECT "from" as email, COUNT(*) as count
      FROM indexed_emails
      WHERE received_at >= ?
      GROUP BY "from"
      HAVING COUNT(*) >= 10
      ORDER BY count DESC
    `).all(ninetyDaysAgo) as Array<{ email: string; count: number }>;

    const unresolved: Array<{ email: string; emailCount: number }> = [];

    for (const row of rows) {
      const contacts = this.contactStore.findByEmail(row.email);
      if (contacts.length === 0) {
        unresolved.push({ email: row.email, emailCount: row.count });
      }
    }

    return unresolved;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private describeGap(contact: ContactEntity): string {
    if (!contact.lastContactDate) {
      return 'No recent communication';
    }

    const lastDate = new Date(contact.lastContactDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays > 90) return `No contact in over ${Math.floor(diffDays / 30)} months`;
    if (diffDays > 30) return `No contact in over ${Math.floor(diffDays / 7)} weeks`;
    if (diffDays > 7) return `Last contact ${diffDays} days ago`;
    return `Last contact ${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}
