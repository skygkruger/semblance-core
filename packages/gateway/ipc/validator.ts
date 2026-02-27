// Validation Pipeline — Every request passes through this ordered, short-circuiting pipeline.
// Schema → Signature → Allowlist → Rate Limit → Anomaly → Log → Execute → Log
// Failure at any step stops the pipeline and logs the rejection.

import {
  ActionRequest,
  ActionResponse,
  ActionPayloadMap,
  sha256,
  verifySignature,
} from '@semblance/core';
import type { ActionType } from '@semblance/core';
import type { AuditTrail } from '../audit/trail.js';
import type { Allowlist } from '../security/allowlist.js';
import type { RateLimiter } from '../security/rate-limiter.js';
import type { AnomalyDetector } from '../security/anomaly-detector.js';
import type { ServiceRegistry } from '../services/registry.js';
import { getDefaultTimeSaved } from '../audit/time-saved-defaults.js';

export interface ValidatorDeps {
  signingKey: Buffer;
  auditTrail: AuditTrail;
  allowlist: Allowlist;
  rateLimiter: RateLimiter;
  anomalyDetector: AnomalyDetector;
  serviceRegistry: ServiceRegistry;
}

type RejectionReason =
  | 'schema_invalid'
  | 'payload_invalid'
  | 'signature_invalid'
  | 'timestamp_stale'
  | 'request_replayed'
  | 'domain_not_allowed'
  | 'rate_limited'
  | 'anomaly_detected';

// --- Replay Protection ---
// Requests older than TTL_MS are rejected. Duplicate request IDs within
// the TTL window are rejected. The rolling set caps at MAX_SEEN_IDS to
// bound memory; oldest entries are evicted when the cap is reached.
const TTL_MS = 30_000;
const MAX_SEEN_IDS = 10_000;

const recentRequestIds: Map<string, number> = new Map(); // id → receive timestamp

function isStale(timestamp: string): boolean {
  const requestTime = new Date(timestamp).getTime();
  if (Number.isNaN(requestTime)) return true;
  const age = Date.now() - requestTime;
  return age > TTL_MS || age < -TTL_MS; // Also reject future-dated requests
}

function isDuplicate(requestId: string): boolean {
  if (recentRequestIds.has(requestId)) return true;

  // Evict oldest entries if at capacity
  if (recentRequestIds.size >= MAX_SEEN_IDS) {
    const entriesToEvict = recentRequestIds.size - MAX_SEEN_IDS + 1;
    const iter = recentRequestIds.keys();
    for (let i = 0; i < entriesToEvict; i++) {
      const oldest = iter.next().value;
      if (oldest !== undefined) recentRequestIds.delete(oldest);
    }
  }

  recentRequestIds.set(requestId, Date.now());
  return false;
}

/** Purge expired entries from the dedup set. Called periodically. */
function purgeExpiredIds(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, ts] of recentRequestIds) {
    if (ts < cutoff) recentRequestIds.delete(id);
  }
}

// Purge every 60s to prevent unbounded growth from long-running processes
const purgeInterval = setInterval(purgeExpiredIds, 60_000);
// Don't block process exit
if (typeof purgeInterval === 'object' && 'unref' in purgeInterval) {
  purgeInterval.unref();
}

function makeErrorResponse(
  requestId: string,
  status: ActionResponse['status'],
  code: string,
  message: string,
  auditRef: string,
): ActionResponse {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    status,
    error: { code, message },
    auditRef,
  };
}

function logRejection(
  auditTrail: AuditTrail,
  requestId: string,
  action: ActionType,
  payloadHash: string,
  signature: string,
  reason: RejectionReason,
  details: string,
): string {
  const status = reason === 'rate_limited' ? 'rate_limited' as const : 'rejected' as const;
  return auditTrail.append({
    requestId,
    timestamp: new Date().toISOString(),
    action,
    direction: 'response',
    status,
    payloadHash,
    signature,
    metadata: { rejectionReason: reason, details },
  });
}

/**
 * Process a raw incoming message through the full validation pipeline.
 * Returns an ActionResponse regardless of outcome.
 */
export async function validateAndExecute(
  raw: unknown,
  deps: ValidatorDeps,
): Promise<ActionResponse> {
  // --- Step 1: Schema validation (ActionRequest envelope) ---
  const parseResult = ActionRequest.safeParse(raw);
  if (!parseResult.success) {
    const id = (raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string')
      ? raw.id
      : 'unknown';
    const auditRef = deps.auditTrail.append({
      requestId: id,
      timestamp: new Date().toISOString(),
      action: 'service.api_call', // fallback
      direction: 'response',
      status: 'rejected',
      payloadHash: 'invalid',
      signature: 'invalid',
      metadata: { rejectionReason: 'schema_invalid', details: parseResult.error.message },
    });
    return makeErrorResponse(id, 'error', 'SCHEMA_INVALID', parseResult.error.message, auditRef);
  }

  const request = parseResult.data;
  const payloadHash = sha256(JSON.stringify(request.payload));

  // --- Step 1b: Timestamp freshness check (replay protection) ---
  if (isStale(request.timestamp)) {
    const auditRef = logRejection(
      deps.auditTrail, request.id, request.action, payloadHash,
      request.signature, 'timestamp_stale',
      `Request timestamp ${request.timestamp} is outside the ${TTL_MS}ms freshness window`,
    );
    return makeErrorResponse(request.id, 'error', 'TIMESTAMP_STALE', 'Request timestamp is stale or future-dated', auditRef);
  }

  // --- Step 1c: Request ID deduplication (replay protection) ---
  if (isDuplicate(request.id)) {
    const auditRef = logRejection(
      deps.auditTrail, request.id, request.action, payloadHash,
      request.signature, 'request_replayed',
      `Duplicate request ID: ${request.id}`,
    );
    return makeErrorResponse(request.id, 'error', 'REQUEST_REPLAYED', 'Duplicate request ID rejected', auditRef);
  }

  // --- Step 1d: Payload schema validation (action-specific) ---
  const payloadSchema = ActionPayloadMap[request.action];
  if (payloadSchema) {
    const payloadResult = payloadSchema.safeParse(request.payload);
    if (!payloadResult.success) {
      const auditRef = logRejection(
        deps.auditTrail, request.id, request.action, payloadHash,
        request.signature, 'payload_invalid', payloadResult.error.message,
      );
      return makeErrorResponse(request.id, 'error', 'PAYLOAD_INVALID', payloadResult.error.message, auditRef);
    }
  }

  // --- Step 2: Signature verification ---
  const sigValid = verifySignature(
    deps.signingKey,
    request.signature,
    request.id,
    request.timestamp,
    request.action,
    request.payload,
  );
  if (!sigValid) {
    const auditRef = logRejection(
      deps.auditTrail, request.id, request.action, payloadHash,
      request.signature, 'signature_invalid', 'HMAC-SHA256 verification failed',
    );
    return makeErrorResponse(request.id, 'error', 'SIGNATURE_INVALID', 'Request signature verification failed', auditRef);
  }

  // --- Step 3: Allowlist check ---
  // Extract target domain from payload if applicable
  const targetDomain = extractTargetDomain(request.action, request.payload);
  if (targetDomain && !deps.allowlist.isAllowed(targetDomain)) {
    const auditRef = logRejection(
      deps.auditTrail, request.id, request.action, payloadHash,
      request.signature, 'domain_not_allowed', `Domain not on allowlist: ${targetDomain}`,
    );
    return makeErrorResponse(request.id, 'error', 'DOMAIN_NOT_ALLOWED', `Domain not on allowlist: ${targetDomain}`, auditRef);
  }

  // --- Step 4: Rate limit check ---
  const rateResult = deps.rateLimiter.check(request.action);
  if (!rateResult.allowed) {
    const auditRef = logRejection(
      deps.auditTrail, request.id, request.action, payloadHash,
      request.signature, 'rate_limited', `Retry after ${rateResult.retryAfterMs}ms`,
    );
    return makeErrorResponse(request.id, 'rate_limited', 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateResult.retryAfterMs}ms`, auditRef);
  }

  // --- Step 5: Anomaly check ---
  const anomalyResult = deps.anomalyDetector.check({
    payload: request.payload,
    targetDomain: targetDomain ?? undefined,
  });
  if (anomalyResult.flagged) {
    // Anomalies with burst detection block; others flag for approval
    const hasBurst = anomalyResult.anomalies.some(a => a.type === 'burst');
    if (hasBurst) {
      const auditRef = logRejection(
        deps.auditTrail, request.id, request.action, payloadHash,
        request.signature, 'anomaly_detected',
        anomalyResult.anomalies.map(a => a.message).join('; '),
      );
      return makeErrorResponse(
        request.id, 'requires_approval', 'ANOMALY_DETECTED',
        anomalyResult.anomalies.map(a => a.message).join('; '),
        auditRef,
      );
    }
    // Non-burst anomalies are logged but don't block
  }

  // --- Step 6: Log BEFORE execution (status: pending) ---
  const pendingAuditId = deps.auditTrail.append({
    requestId: request.id,
    timestamp: new Date().toISOString(),
    action: request.action,
    direction: 'request',
    status: 'pending',
    payloadHash,
    signature: request.signature,
    metadata: anomalyResult.flagged
      ? { anomalies: anomalyResult.anomalies.map(a => a.message) }
      : undefined,
    estimatedTimeSavedSeconds: getDefaultTimeSaved(request.action),
  });

  // --- Step 7: Execute action via service adapter ---
  deps.rateLimiter.record(request.action);

  let executionResult: { success: boolean; data?: unknown; error?: { code: string; message: string } };
  try {
    const adapter = deps.serviceRegistry.getAdapter(request.action);
    executionResult = await adapter.execute(request.action, request.payload);
  } catch (err) {
    executionResult = {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: err instanceof Error ? err.message : 'Unknown execution error',
      },
    };
  }

  // --- Step 8: Log AFTER execution ---
  const responseAuditId = deps.auditTrail.append({
    requestId: request.id,
    timestamp: new Date().toISOString(),
    action: request.action,
    direction: 'response',
    status: executionResult.success ? 'success' : 'error',
    payloadHash,
    signature: request.signature,
    metadata: executionResult.error
      ? { error: executionResult.error }
      : undefined,
    estimatedTimeSavedSeconds: getDefaultTimeSaved(request.action),
  });

  // --- Step 9: Return ActionResponse ---
  return {
    requestId: request.id,
    timestamp: new Date().toISOString(),
    status: executionResult.success ? 'success' : 'error',
    data: executionResult.data,
    error: executionResult.error,
    auditRef: responseAuditId,
  };
}

/**
 * Extract the target domain from a request payload, if applicable.
 * Returns null for actions that don't target external domains.
 *
 * Email and calendar actions use domains from user-configured credentials.
 * The domain check happens during adapter execution (the adapter uses stored
 * credentials which were validated and added to the allowlist at setup time).
 * Only service.api_call requires pipeline-level domain validation.
 */
function extractTargetDomain(
  action: ActionType,
  payload: Record<string, unknown>,
): string | null {
  if (action === 'service.api_call' && typeof payload['service'] === 'string') {
    return payload['service'];
  }
  // Model downloads always target huggingface.co
  if (action === 'model.download') {
    return 'huggingface.co';
  }
  // Web search targets the search API domain
  if (action === 'web.search') {
    return 'api.search.brave.com';
  }
  // Web fetch targets the URL's domain (dynamic per-request authorization)
  if (action === 'web.fetch' && typeof payload['url'] === 'string') {
    try {
      const url = new URL(payload['url']);
      return url.hostname;
    } catch {
      return null;
    }
  }
  // Cloud storage actions target Google Drive API
  if (action.startsWith('cloud.')) {
    return 'www.googleapis.com';
  }
  // Reminder actions are local-only — no domain
  return null;
}
