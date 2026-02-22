// InProcessTransport — Mobile IPC transport using direct function calls.
// Same validation pipeline as socket-based IPC, but no serialization overhead.
// The handler is the Gateway's validateAndExecute function, injected at construction.
// CRITICAL: This file has NO platform-specific imports. Safe for mobile.

import type { ActionRequest, ActionResponse } from '../types/ipc.js';
import type { IPCTransport, IPCHandler } from './transport.js';

/**
 * InProcessTransport — Runs the Gateway's validation pipeline in-process.
 * Used on mobile where Core and Gateway share the same JavaScript thread.
 *
 * The handler receives the raw ActionRequest and returns an ActionResponse.
 * All signing, schema validation, allowlist, rate limiting, and audit logging
 * still occurs — the only difference is transport (function call vs socket).
 *
 * Security: The handler is the same validateAndExecute function used by the
 * socket-based Gateway. Core cannot bypass validation because:
 * 1. The handler is opaque — Core doesn't get a reference to Gateway internals.
 * 2. Signing is still required — the handler verifies HMAC-SHA256 signatures.
 * 3. Audit trail is still logged — every action is recorded before execution.
 */
export class InProcessTransport implements IPCTransport {
  private handler: IPCHandler;
  private started: boolean = false;

  constructor(handler: IPCHandler) {
    if (typeof handler !== 'function') {
      throw new Error('[InProcessTransport] Handler must be a function');
    }
    this.handler = handler;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  isReady(): boolean {
    return this.started;
  }

  async send(request: ActionRequest): Promise<ActionResponse> {
    if (!this.started) {
      throw new Error('[InProcessTransport] Not started. Call start() first.');
    }

    // Pass the request through the handler (Gateway's validation pipeline).
    // The request is passed as a plain object — same shape, no socket serialization.
    // The handler runs the full pipeline: schema -> signature -> allowlist ->
    // rate limit -> anomaly -> audit -> execute -> audit -> respond.
    const raw = await this.handler(request);

    // Validate the response shape
    if (!raw || typeof raw !== 'object') {
      throw new Error('[InProcessTransport] Handler returned invalid response');
    }

    const response = raw as ActionResponse;

    // Basic structural check — must have requestId matching our request
    if (response.requestId !== request.id) {
      throw new Error(
        `[InProcessTransport] Response requestId mismatch: expected ${request.id}, got ${response.requestId}`
      );
    }

    return response;
  }
}
