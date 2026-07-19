// @semblance/gateway/audit — Append-only tamper-evident audit trail

export { AuditTrail, assertAuditPendingBeforeDispatch, AuditPendingMissingError } from './trail.js';
export { AuditQuery } from './audit-query.js';
export type { QueryOptions, ServiceAggregate, TimelinePoint } from './audit-query.js';
