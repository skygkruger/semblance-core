export type VaultEventLogErrorCode =
  | 'WRITER_ALREADY_ACTIVE'
  | 'DUPLICATE_EVENT_ID'
  | 'INTEGRITY_FAILURE'
  | 'SIGNATURE_INVALID'
  | 'CAPABILITY_DENIED';

export class VaultEventLogError extends Error {
  readonly code: VaultEventLogErrorCode;

  constructor(code: VaultEventLogErrorCode, message: string) {
    super(message);
    this.name = 'VaultEventLogError';
    this.code = code;
  }
}
