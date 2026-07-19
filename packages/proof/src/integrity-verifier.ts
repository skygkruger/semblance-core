import type { AuditTrail } from '@semblance/gateway/audit/trail.js';
import type { ActionReceipt } from './action-receipt.js';
import { verifyActionReceipt } from './action-receipt.js';

export interface AuditChainVerificationResult {
  readonly valid: boolean;
  readonly brokenAt?: string;
  readonly entryCount: number;
}

export interface ReceiptIntegrityResult {
  readonly receiptValid: boolean;
  readonly auditChainValid: boolean;
  readonly auditChain?: AuditChainVerificationResult;
}

export function verifyAuditChainLinkage(auditTrail: AuditTrail): AuditChainVerificationResult {
  const result = auditTrail.verifyChainIntegrity();
  return {
    valid: result.valid,
    brokenAt: result.valid ? undefined : result.brokenAt,
    entryCount: auditTrail.count(),
  };
}

export function verifyReceiptIntegrity(
  receipt: ActionReceipt,
  auditTrail: AuditTrail,
  signingKey: Buffer,
): ReceiptIntegrityResult {
  const auditChain = verifyAuditChainLinkage(auditTrail);
  const receiptValid = verifyActionReceipt({ receipt, signingKey });
  return {
    receiptValid,
    auditChainValid: auditChain.valid,
    auditChain,
  };
}
