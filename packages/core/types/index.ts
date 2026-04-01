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
  WebSearchPayload,
  WebSearchResponse,
  WebDeepSearchPayload,
  WebDeepSearchResponse,
  WebFetchPayload,
  WebFetchResponse,
  ReminderCreatePayload,
  ReminderUpdatePayload,
  ReminderListPayload,
  ReminderDeletePayload,
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

// Cloud Bridge types (zero network imports — pure data shapes)
export type {
  CloudBridgeProvider,
  CloudBridgeModel,
  CloudBridgeRequest,
  CloudBridgeResponse,
  CloudBridgeRoutingPolicy,
  CloudBridgeRoutingMode,
  CloudBridgeDomainRule,
  CloudBridgeAuditEntry,
  DataCategory,
  KnownProviderConfig,
} from './cloud-bridge.js';

export {
  DEFAULT_ROUTING_POLICY,
  KNOWN_PROVIDERS,
  getKnownProvider,
} from './cloud-bridge.js';
