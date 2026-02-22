// IPC Transport Interface — Abstraction layer for Core <-> Gateway communication.
// SocketTransport: Desktop (Unix domain socket / named pipe)
// InProcessTransport: Mobile (direct function calls, same validation pipeline)
// CRITICAL: This file has NO platform-specific imports. Safe for mobile.

import type { ActionRequest, ActionResponse } from '../types/ipc.js';

/**
 * IPCTransport — Client-side transport abstraction for Core -> Gateway communication.
 * Desktop uses SocketTransport (existing socket IPC).
 * Mobile uses InProcessTransport (direct function calls in same process).
 *
 * Both transports preserve the full validation pipeline:
 * schema -> signature -> allowlist -> rate limit -> anomaly -> audit -> execute
 */
export interface IPCTransport {
  /** Send a signed ActionRequest and receive an ActionResponse. */
  send(request: ActionRequest): Promise<ActionResponse>;

  /** Start the transport (connect socket, initialize handler, etc.) */
  start(): Promise<void>;

  /** Stop the transport (close socket, clean up, etc.) */
  stop(): Promise<void>;

  /** Check if the transport is ready to send requests. */
  isReady(): boolean;
}

/**
 * Handler function type — the Gateway's validation pipeline entry point.
 * Takes a raw message (the ActionRequest object) and returns the ActionResponse.
 * Used by InProcessTransport to call the Gateway's validateAndExecute directly.
 */
export type IPCHandler = (raw: unknown) => Promise<unknown>;
