export type VaultCapabilityErrorCode =
  | 'WRONG_PRINCIPAL'
  | 'EXPIRED_GRANT'
  | 'EXCESSIVE_RESULT_LIMIT'
  | 'WRONG_DATA_DOMAIN'
  | 'SENSITIVITY_CEILING'
  | 'OPERATION_NOT_PERMITTED';

export class VaultCapabilityError extends Error {
  readonly code: VaultCapabilityErrorCode;

  constructor(code: VaultCapabilityErrorCode, message: string) {
    super(message);
    this.name = 'VaultCapabilityError';
    this.code = code;
  }
}
