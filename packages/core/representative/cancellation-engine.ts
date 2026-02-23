// Cancellation Engine — Manages subscription cancellation workflow.
// Maps RecurringCharge → CancellableSubscription, enriches with support info,
// drafts cancellation emails, and tracks cancellation status.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { RecurringDetector, RecurringCharge } from '../finance/recurring-detector.js';
import type { RepresentativeEmailDrafter } from './email-drafter.js';
import type { SupportEmailExtractor } from './support-email-extractor.js';
import type { CancellableSubscription, RepresentativeDraft } from './types.js';

// ─── SQLite Schema ───────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS representative_cancellations (
    id TEXT PRIMARY KEY,
    charge_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    support_email TEXT,
    cancellation_url TEXT,
    status TEXT NOT NULL DEFAULT 'not-started',
    draft_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cancel_charge ON representative_cancellations(charge_id);
`;

interface CancellationRow {
  id: string;
  charge_id: string;
  merchant_name: string;
  support_email: string | null;
  cancellation_url: string | null;
  status: string;
  draft_json: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class CancellationEngine {
  private db: DatabaseHandle;
  private recurringDetector: RecurringDetector;
  private emailDrafter: RepresentativeEmailDrafter;
  private supportExtractor: SupportEmailExtractor;

  constructor(config: {
    db: DatabaseHandle;
    recurringDetector: RecurringDetector;
    emailDrafter: RepresentativeEmailDrafter;
    supportExtractor: SupportEmailExtractor;
  }) {
    this.db = config.db;
    this.recurringDetector = config.recurringDetector;
    this.emailDrafter = config.emailDrafter;
    this.supportExtractor = config.supportExtractor;
    this.db.exec(CREATE_TABLE);
  }

  /**
   * List all cancellable subscriptions by mapping stored recurring charges.
   * Enriches with support contact info via the SupportEmailExtractor.
   */
  async listCancellable(): Promise<CancellableSubscription[]> {
    const charges = this.recurringDetector.getStoredCharges();
    const activeCharges = charges.filter(c => c.status === 'active' || c.status === 'forgotten');

    const results: CancellableSubscription[] = [];

    for (const charge of activeCharges) {
      // Check if we already have a cancellation record
      const existingRow = this.db.prepare(
        'SELECT * FROM representative_cancellations WHERE charge_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(charge.id) as CancellationRow | undefined;

      let supportContact = null;
      try {
        const contact = await this.supportExtractor.extract(charge.merchantName);
        if (contact.email) {
          supportContact = contact;
        }
      } catch {
        // Support extraction failed — proceed without contact
      }

      results.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        amount: charge.amount,
        frequency: charge.frequency,
        estimatedAnnualCost: charge.estimatedAnnualCost,
        supportContact,
        cancellationStatus: (existingRow?.status as CancellableSubscription['cancellationStatus']) ?? 'not-started',
      });
    }

    return results;
  }

  /**
   * Initiate a cancellation: draft a cancellation email for the subscription.
   */
  async initiateCancellation(chargeId: string): Promise<RepresentativeDraft | null> {
    const charges = this.recurringDetector.getStoredCharges();
    const charge = charges.find(c => c.id === chargeId);
    if (!charge) return null;

    const contact = await this.supportExtractor.extract(charge.merchantName);

    if (!contact.email) return null;

    const draft = await this.emailDrafter.draftEmail({
      to: contact.email,
      subject: `Cancel Subscription — ${charge.merchantName}`,
      intent: `Cancel my ${charge.merchantName} subscription. My account is charged ${formatAmount(charge.amount)} ${charge.frequency}.`,
      draftType: 'cancellation',
      additionalContext: contact.cancellationUrl
        ? `Their cancellation page is ${contact.cancellationUrl}`
        : undefined,
    });

    // Store the cancellation record
    const id = `rc_${nanoid()}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO representative_cancellations (id, charge_id, merchant_name, support_email, cancellation_url, status, draft_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, chargeId, charge.merchantName, contact.email,
      contact.cancellationUrl ?? null, 'draft-ready',
      JSON.stringify(draft), now, now,
    );

    return draft;
  }

  /**
   * Update the cancellation status for a charge.
   */
  updateCancellationStatus(chargeId: string, status: CancellableSubscription['cancellationStatus']): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE representative_cancellations SET status = ?, updated_at = ? WHERE charge_id = ?'
    ).run(status, now, chargeId);
  }

  /**
   * Get the current cancellation status for a charge.
   */
  getCancellationStatus(chargeId: string): CancellableSubscription['cancellationStatus'] {
    const row = this.db.prepare(
      'SELECT status FROM representative_cancellations WHERE charge_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(chargeId) as { status: string } | undefined;

    return (row?.status as CancellableSubscription['cancellationStatus']) ?? 'not-started';
  }
}

function formatAmount(amount: number): string {
  return `$${Math.abs(amount / 100).toFixed(2)}`;
}
