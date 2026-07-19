import {
  combineShares,
  sharesFromHex,
  splitSecret,
  type ShamirShare,
} from '../crypto/shamir.js';
import { hashRecoverySecret } from '../membership/event.js';
import type { RecoveryQuorumProof, RecoveryShare } from '../types.js';
import type { SyncSecureStorageAdapter } from '../keys/secure-storage.js';
import { syncRecoveryShareKey } from '../keys/secure-storage.js';

export interface RecoveryConfig {
  readonly threshold: number;
  readonly totalShares: number;
}

export function generateRecoveryShares(
  recoverySecret: Buffer,
  config: RecoveryConfig,
): ShamirShare[] {
  return splitSecret(recoverySecret, config.threshold, config.totalShares);
}

export async function persistRecoveryShares(
  secureStorage: SyncSecureStorageAdapter,
  shares: ShamirShare[],
): Promise<void> {
  for (const share of shares) {
    await secureStorage.set(syncRecoveryShareKey(share.index), share.value.toString('hex'));
  }
}

export async function loadRecoveryShare(
  secureStorage: SyncSecureStorageAdapter,
  index: number,
): Promise<RecoveryShare | null> {
  const shareHex = await secureStorage.get(syncRecoveryShareKey(index));
  if (!shareHex) {
    return null;
  }
  return { index, shareHex };
}

export function verifyRecoveryQuorum(
  shares: RecoveryShare[],
  threshold: number,
  expectedSecretHash: string,
): RecoveryQuorumProof {
  if (shares.length < threshold) {
    throw new Error(`Recovery quorum requires at least ${threshold} shares`);
  }

  const uniqueIndexes = new Set(shares.map((share) => share.index));
  if (uniqueIndexes.size !== shares.length) {
    throw new Error('Recovery shares must have unique indexes');
  }

  const shamirShares = sharesFromHex(shares.slice(0, threshold));
  const reconstructed = combineShares(shamirShares);
  const reconstructedSecretHash = hashRecoverySecret(reconstructed);

  if (reconstructedSecretHash !== expectedSecretHash) {
    throw new Error('Recovery shares failed to reconstruct the expected root secret');
  }

  return {
    threshold,
    shares: shares.slice(0, threshold),
    reconstructedSecretHash,
  };
}

export function buildRecoveryQuorumProofString(proof: RecoveryQuorumProof): string {
  return proof.reconstructedSecretHash;
}

export async function executeRecoveryRotation(params: {
  secureStorage: SyncSecureStorageAdapter;
  submittedShares: RecoveryShare[];
  threshold: number;
  expectedSecretHash: string;
  authorizedDeviceIds: string[];
}): Promise<RecoveryQuorumProof> {
  if (params.authorizedDeviceIds.length === 0) {
    throw new Error('Recovery requires at least one authorized device approval');
  }

  return verifyRecoveryQuorum(
    params.submittedShares,
    params.threshold,
    params.expectedSecretHash,
  );
}
