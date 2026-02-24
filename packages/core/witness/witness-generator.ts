// Witness Generator — Creates signed attestations for autonomous actions.
// Premium-gated: requires Digital Representative tier.
// CRITICAL: No networking imports. No Gateway. No IPC. Entirely local.

import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { AttestationSigner } from '../attestation/attestation-signer.js';
import type { DeviceIdentity } from '../attestation/types.js';
import type { WitnessAttestation, WitnessGenerationResult } from './types.js';
import { buildWitnessPayload, WITNESS_CONTEXT, WITNESS_TYPE } from './witness-format.js';
import { nanoid } from 'nanoid';

export interface WitnessGeneratorDeps {
  db: DatabaseHandle;
  premiumGate: PremiumGate;
  attestationSigner: AttestationSigner;
  deviceIdentity: DeviceIdentity;
}

/**
 * Generates and stores Semblance Witness attestations for autonomous actions.
 */
export class WitnessGenerator {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;
  private signer: AttestationSigner;
  private deviceIdentity: DeviceIdentity;

  constructor(deps: WitnessGeneratorDeps) {
    this.db = deps.db;
    this.premiumGate = deps.premiumGate;
    this.signer = deps.attestationSigner;
    this.deviceIdentity = deps.deviceIdentity;
  }

  /**
   * Initialize the witness attestations table.
   */
  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS witness_attestations (
        id TEXT PRIMARY KEY,
        audit_entry_id TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        autonomy_tier TEXT NOT NULL,
        device_id TEXT NOT NULL,
        attestation_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Generate a witness attestation for a given audit entry.
   */
  generate(
    auditEntryId: string,
    actionSummary: string,
    autonomyTier: string = 'partner',
  ): WitnessGenerationResult {
    if (!this.premiumGate.isPremium()) {
      return {
        success: false,
        error: 'Witness attestation requires Digital Representative tier',
      };
    }

    const id = nanoid();

    // Build the payload (action summary only — privacy preserved, not full audit data)
    const payload = buildWitnessPayload(
      actionSummary,
      autonomyTier,
      this.deviceIdentity,
      auditEntryId,
    );

    // Sign the payload
    const signed = this.signer.sign(payload);

    // Assemble the full attestation
    const attestation: WitnessAttestation = {
      '@context': WITNESS_CONTEXT,
      '@type': WITNESS_TYPE,
      id,
      action: actionSummary,
      autonomyTier,
      device: this.deviceIdentity,
      createdAt: payload.createdAt as string,
      auditEntryId,
      proof: signed.proof,
      vti: null,
    };

    // Store in database
    this.db.prepare(`
      INSERT INTO witness_attestations (id, audit_entry_id, action_summary, autonomy_tier, device_id, attestation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      auditEntryId,
      actionSummary,
      autonomyTier,
      this.deviceIdentity.id,
      JSON.stringify(attestation),
      attestation.createdAt,
    );

    return { success: true, attestation };
  }

  /**
   * Retrieve a single attestation by ID.
   */
  getAttestation(id: string): WitnessAttestation | null {
    const row = this.db.prepare(
      'SELECT attestation_json FROM witness_attestations WHERE id = ?',
    ).get(id) as { attestation_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.attestation_json) as WitnessAttestation;
  }

  /**
   * List stored attestations, most recent first.
   */
  listAttestations(limit: number = 50): WitnessAttestation[] {
    const rows = this.db.prepare(
      'SELECT attestation_json FROM witness_attestations ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as Array<{ attestation_json: string }>;

    return rows.map((row) => JSON.parse(row.attestation_json) as WitnessAttestation);
  }
}
