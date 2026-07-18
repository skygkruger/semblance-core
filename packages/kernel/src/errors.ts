export type KernelErrorCode =
  | 'UNKNOWN_PROCESS'
  | 'REPLAYED_NONCE'
  | 'EXPIRED_SESSION'
  | 'BUILD_HASH_MISMATCH'
  | 'POLICY_EPOCH_STALE'
  | 'INVALID_SESSION'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'INVALID_ENTITLEMENT';

export class KernelError extends Error {
  readonly code: KernelErrorCode;

  constructor(code: KernelErrorCode, message: string) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
  }
}
