// Commerce Transport — Gateway-only Stripe portal, waitlist, and renewal calls.
// All requests target the allowlisted Semblance license worker host only.

import { nanoid } from 'nanoid';
import { sha256 } from '@semblance/core';
import { runWithGatewayNetwork } from '@semblance/core/security/egress-guard.js';
import type { AuditTrail } from '../audit/trail.js';

export const COMMERCE_WORKER_HOST = 'semblance-license-worker.conduit-gw.workers.dev';
export const COMMERCE_WORKER_BASE_URL = `https://${COMMERCE_WORKER_HOST}`;

const APPROVED_COMMERCE_PATHS = new Set(['/portal', '/waitlist', '/latest-key']);
const APPROVED_PORTAL_HOSTS = new Set(['billing.stripe.com']);

export type CommerceOperation = 'commerce.portal_session' | 'commerce.waitlist' | 'commerce.renewal_check';

export interface CommerceTransportDeps {
  auditTrail?: AuditTrail;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface PortalSessionResult {
  url: string | null;
}

export interface WaitlistSubmitResult {
  success: boolean;
}

export interface RenewalCheckResult {
  ok: boolean;
  status: number;
  data: {
    valid?: boolean;
    key?: string;
    tier?: string;
    expiresAt?: string | null;
    isNewer?: boolean;
    revoked?: boolean;
  } | null;
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? globalThis.fetch;
}

function assertCommerceUrl(path: string): URL {
  if (!APPROVED_COMMERCE_PATHS.has(path)) {
    throw new Error(`Commerce path not allowlisted: ${path}`);
  }
  const url = new URL(path, COMMERCE_WORKER_BASE_URL);
  if (url.protocol !== 'https:' || url.hostname !== COMMERCE_WORKER_HOST) {
    throw new Error(`Commerce URL host mismatch: ${url.hostname}`);
  }
  return url;
}

export function approvedPortalUrl(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (
      parsed.protocol !== 'https:'
      || !APPROVED_PORTAL_HOSTS.has(parsed.hostname)
      || parsed.port
      || parsed.username
      || parsed.password
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function logCommerceAudit(
  auditTrail: AuditTrail | undefined,
  operation: CommerceOperation,
  payload: Record<string, unknown>,
  status: 'pending' | 'success' | 'error',
  metadata?: Record<string, unknown>,
): string {
  const requestId = nanoid();
  if (!auditTrail) return requestId;

  auditTrail.append({
    requestId,
    timestamp: new Date().toISOString(),
    action: 'service.api_call',
    direction: status === 'pending' ? 'request' : 'response',
    status,
    payloadHash: sha256(JSON.stringify({ operation, ...payload })),
    signature: 'commerce-transport',
    metadata: {
      commerceOperation: operation,
      workerHost: COMMERCE_WORKER_HOST,
      ...metadata,
    },
    estimatedTimeSavedSeconds: 0,
  });

  return requestId;
}

export class CommerceTransport {
  private readonly auditTrail?: AuditTrail;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(deps: CommerceTransportDeps = {}) {
    this.auditTrail = deps.auditTrail;
    this.fetchImpl = resolveFetch(deps.fetchImpl);
    this.timeoutMs = deps.timeoutMs ?? 10_000;
  }

  async createPortalSession(licenseKey: string): Promise<PortalSessionResult> {
    return runWithGatewayNetwork(async () => {
      logCommerceAudit(this.auditTrail, 'commerce.portal_session', { licenseKeyPresent: !!licenseKey }, 'pending');

      const url = assertCommerceUrl('/portal');
      const response = await this.fetchImpl(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        logCommerceAudit(
          this.auditTrail,
          'commerce.portal_session',
          { licenseKeyPresent: !!licenseKey },
          'error',
          { httpStatus: response.status },
        );
        return { url: null };
      }

      const data = await response.json() as { url?: unknown };
      const approved = typeof data.url === 'string' ? approvedPortalUrl(data.url) : null;

      logCommerceAudit(
        this.auditTrail,
        'commerce.portal_session',
        { licenseKeyPresent: !!licenseKey },
        approved ? 'success' : 'error',
        { portalApproved: !!approved },
      );

      return { url: approved };
    });
  }

  async submitWaitlist(email: string): Promise<WaitlistSubmitResult> {
    return runWithGatewayNetwork(async () => {
      logCommerceAudit(this.auditTrail, 'commerce.waitlist', { emailPresent: !!email }, 'pending');

      const url = assertCommerceUrl('/waitlist');
      try {
        const response = await this.fetchImpl(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const success = response.ok;
        logCommerceAudit(
          this.auditTrail,
          'commerce.waitlist',
          { emailPresent: !!email },
          success ? 'success' : 'error',
          { httpStatus: response.status },
        );
        return { success };
      } catch (error) {
        logCommerceAudit(
          this.auditTrail,
          'commerce.waitlist',
          { emailPresent: !!email },
          'error',
          { message: error instanceof Error ? error.message : String(error) },
        );
        return { success: false };
      }
    });
  }

  async checkRenewal(licenseKey: string): Promise<RenewalCheckResult> {
    return runWithGatewayNetwork(async () => {
      logCommerceAudit(this.auditTrail, 'commerce.renewal_check', { licenseKeyPresent: !!licenseKey }, 'pending');

      const url = assertCommerceUrl('/latest-key');
      try {
        const response = await this.fetchImpl(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          logCommerceAudit(
            this.auditTrail,
            'commerce.renewal_check',
            { licenseKeyPresent: !!licenseKey },
            'error',
            { httpStatus: response.status },
          );
          return { ok: false, status: response.status, data: null };
        }

        const data = await response.json() as RenewalCheckResult['data'];
        logCommerceAudit(
          this.auditTrail,
          'commerce.renewal_check',
          { licenseKeyPresent: !!licenseKey },
          'success',
          { valid: data?.valid ?? false, isNewer: data?.isNewer ?? false },
        );
        return { ok: true, status: response.status, data };
      } catch (error) {
        logCommerceAudit(
          this.auditTrail,
          'commerce.renewal_check',
          { licenseKeyPresent: !!licenseKey },
          'error',
          { message: error instanceof Error ? error.message : String(error) },
        );
        return { ok: false, status: 0, data: null };
      }
    });
  }
}
