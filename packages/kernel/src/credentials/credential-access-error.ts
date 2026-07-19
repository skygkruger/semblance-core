export type CredentialAccessErrorCode =
  | 'INVALID_SESSION'
  | 'EXPIRED_GRANT'
  | 'WRONG_PRINCIPAL'
  | 'OPERATION_NOT_PERMITTED'
  | 'SECRET_NOT_FOUND';

export class CredentialAccessError extends Error {
  readonly code: CredentialAccessErrorCode;

  constructor(code: CredentialAccessErrorCode, message: string) {
    super(message);
    this.name = 'CredentialAccessError';
    this.code = code;
  }
}
