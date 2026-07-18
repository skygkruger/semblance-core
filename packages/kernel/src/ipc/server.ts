import type { KernelIpcHandlers } from './handlers.js';

/**
 * In-process IPC surface for tests and host wiring.
 * A Unix socket transport may wrap these handlers in later tasks.
 */
export interface KernelIpcServer {
  readonly handlers: KernelIpcHandlers;
}

export function createKernelIpcServer(handlers: KernelIpcHandlers): KernelIpcServer {
  return { handlers };
}
