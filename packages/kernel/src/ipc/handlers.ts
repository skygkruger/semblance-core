import { randomUUID } from 'node:crypto';
import type { ProcessHelloV1, ProcessSessionV1 } from '@semblance/protocol';
import { ProcessSessionV1 as ProcessSessionSchema } from '@semblance/protocol';
import type { DeviceIdentity } from '../identity/device-identity.js';
import { assertHandshakeProcessType } from '../identity/process-registry.js';
import { KernelError } from '../errors.js';
import { isoAfterMs, sessionSigningPayload } from '../crypto/signing.js';
import type { SessionStore, StoredSession } from '../session/session-store.js';
import type { CapabilityIssuer, IssueCapabilityRequest } from '../policy/capability-issuer.js';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import type { EntitlementService } from '../entitlement/service.js';
import type { EntitlementSnapshot } from '../entitlement/store.js';

export interface ProcessHelloRequest {
  hello: ProcessHelloV1;
  /**
   * Policy epoch asserted by the connecting process.
   * Frozen ProcessHelloV1 omits this field until a versioned schema bump; the kernel
   * requires an exact match with its current epoch (lower epochs are rejected).
   */
  policyEpoch: number;
  sessionPublicKey: string;
  extensionInstanceId?: string | null;
  sessionTtlMs?: number;
}

export interface KernelIpcHandlers {
  handleProcessHello(request: ProcessHelloRequest): Promise<ProcessSessionV1>;
  validateSession(sessionId: string): Promise<ProcessSessionV1>;
  issueCapability(request: IssueCapabilityRequest): Promise<CapabilityGrantV1>;
  getEntitlementSnapshot(): Promise<EntitlementSnapshot | null>;
  activateEntitlement(request: ActivateEntitlementRequest): Promise<EntitlementActivationResponse>;
}

export interface ActivateEntitlementRequest {
  bearer?: string;
  entitlement?: unknown;
}

export interface EntitlementActivationResponse {
  success: boolean;
  snapshot?: EntitlementSnapshot;
  error?: string;
}

export interface KernelIpcContext {
  buildHash: string;
  policyEpoch: number;
  defaultSessionTtlMs: number;
  identity: DeviceIdentity;
  sessions: SessionStore;
  capabilityIssuer: CapabilityIssuer;
  entitlement: EntitlementService;
}

export function createKernelIpcHandlers(context: KernelIpcContext): KernelIpcHandlers {
  return {
    async handleProcessHello(request: ProcessHelloRequest): Promise<ProcessSessionV1> {
      const { hello, policyEpoch, sessionPublicKey } = request;

      if (hello.protocolVersion !== 1) {
        throw new KernelError(
          'PROTOCOL_VERSION_MISMATCH',
          `Unsupported protocol version ${String(hello.protocolVersion)}`,
        );
      }

      assertHandshakeProcessType(hello.processType);

      if (hello.buildHash !== context.buildHash) {
        throw new KernelError(
          'BUILD_HASH_MISMATCH',
          `Process build hash "${hello.buildHash}" does not match kernel build "${context.buildHash}"`,
        );
      }

      // Connecting processes must observe the kernel's current policy epoch exactly.
      if (policyEpoch < context.policyEpoch) {
        throw new KernelError(
          'POLICY_EPOCH_STALE',
          `Process policy epoch ${policyEpoch} is lower than kernel epoch ${context.policyEpoch}`,
        );
      }
      if (policyEpoch > context.policyEpoch) {
        throw new KernelError(
          'POLICY_EPOCH_STALE',
          `Process policy epoch ${policyEpoch} is higher than kernel epoch ${context.policyEpoch}`,
        );
      }

      // Reserve before any await so concurrent identical nonces cannot both succeed.
      if (!context.sessions.reserveNonce(hello.nonce)) {
        throw new KernelError('REPLAYED_NONCE', `Nonce "${hello.nonce}" was already used`);
      }

      const expiresAt = isoAfterMs(request.sessionTtlMs ?? context.defaultSessionTtlMs);
      const unsigned: Omit<ProcessSessionV1, 'kernelSignature'> = {
        protocolVersion: 1,
        helloNonce: hello.nonce,
        processId: hello.processId,
        processType: hello.processType,
        buildHash: context.buildHash,
        policyEpoch: context.policyEpoch,
        principalId: context.identity.principalId,
        deviceId: context.identity.deviceId,
        extensionInstanceId: request.extensionInstanceId ?? null,
        sessionId: `session-${randomUUID()}`,
        expiresAt,
        sessionPublicKey,
      };

      const kernelSignature = await context.identity.signPayload(sessionSigningPayload(unsigned));
      const session = ProcessSessionSchema.parse({
        ...unsigned,
        kernelSignature,
      });

      context.sessions.put({
        ...session,
        issuedAtMs: Date.now(),
      });

      return session;
    },

    async validateSession(sessionId: string): Promise<ProcessSessionV1> {
      return context.capabilityIssuer.validateSession(sessionId);
    },

    async issueCapability(request: IssueCapabilityRequest): Promise<CapabilityGrantV1> {
      return context.capabilityIssuer.issue(request);
    },

    async getEntitlementSnapshot(): Promise<EntitlementSnapshot | null> {
      return context.entitlement.getSnapshot();
    },

    async activateEntitlement(request: ActivateEntitlementRequest): Promise<EntitlementActivationResponse> {
      if (request.entitlement !== undefined) {
        const result = await context.entitlement.activate(request.entitlement as never);
        return {
          success: result.success,
          snapshot: result.snapshot,
          error: result.error,
        };
      }

      if (typeof request.bearer !== 'string' || request.bearer.trim().length === 0) {
        throw new KernelError(
          'INVALID_ENTITLEMENT',
          'kernel.entitlement.activate requires bearer or entitlement',
        );
      }

      const result = await context.entitlement.activate(request.bearer);
      return {
        success: result.success,
        snapshot: result.snapshot,
        error: result.error,
      };
    },
  };
}
