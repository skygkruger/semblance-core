// @semblance/core/types — Shared type definitions for IPC protocol
// These types are the contract between AI Core and Gateway.
// CRITICAL: No networking imports. This directory is scanned by the privacy audit.

export {
  ActionType,
  ActionRequest,
  ActionResponse,
  EmailSendPayload,
  EmailFetchPayload,
  EmailArchivePayload,
  EmailMovePayload,
  EmailMarkReadPayload,
  CalendarFetchPayload,
  CalendarCreatePayload,
  CalendarUpdatePayload,
  CalendarDeletePayload,
  ServiceApiCallPayload,
  FinanceFetchPayload,
  HealthFetchPayload,
  ModelDownloadPayload,
  ModelDownloadCancelPayload,
  ModelVerifyPayload,
  ActionPayloadMap,
} from './ipc.js';

export { AuditEntry } from './audit.js';

export {
  sha256,
  buildSigningPayload,
  signRequest,
  verifySignature,
} from './signing.js';
