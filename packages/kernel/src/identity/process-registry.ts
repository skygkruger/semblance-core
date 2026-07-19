import type { ProcessType } from '@semblance/protocol';
import { KernelError } from '../errors.js';

/**
 * Process types the kernel accepts during Slice 2 handshake.
 * `host` is registered for supervisor wiring (Task 2.4) but does not appear
 * on the frozen ProcessHelloV1 wire shape; runtime peers use protocol ProcessType values.
 */
export const REGISTERED_KERNEL_PROCESS_TYPES = [
  'host',
  'kernel',
  'core',
  'gateway',
  'model',
] as const;

export type RegisteredKernelProcessType = (typeof REGISTERED_KERNEL_PROCESS_TYPES)[number];

const REGISTERED = new Set<string>(REGISTERED_KERNEL_PROCESS_TYPES);

/** Process types allowed to complete ProcessHelloV1 against the kernel. */
export const HANDSHAKE_PROCESS_TYPES = new Set<ProcessType>(['kernel', 'core', 'gateway', 'model']);

export function isRegisteredKernelProcessType(processType: string): processType is RegisteredKernelProcessType {
  return REGISTERED.has(processType);
}

export function assertHandshakeProcessType(processType: ProcessType): void {
  if (!HANDSHAKE_PROCESS_TYPES.has(processType)) {
    throw new KernelError('UNKNOWN_PROCESS', `Process type "${processType}" is not registered with the kernel`);
  }
}

export class ProcessRegistry {
  register(processType: RegisteredKernelProcessType): void {
    if (!isRegisteredKernelProcessType(processType)) {
      throw new KernelError('UNKNOWN_PROCESS', `Process type "${processType}" is not registered with the kernel`);
    }
  }

  isRegistered(processType: string): boolean {
    return isRegisteredKernelProcessType(processType);
  }

  assertRegistered(processType: string): asserts processType is RegisteredKernelProcessType {
    if (!this.isRegistered(processType)) {
      throw new KernelError('UNKNOWN_PROCESS', `Process type "${processType}" is not registered with the kernel`);
    }
  }
}

export function createProcessRegistry(): ProcessRegistry {
  const registry = new ProcessRegistry();
  for (const processType of REGISTERED_KERNEL_PROCESS_TYPES) {
    registry.register(processType);
  }
  return registry;
}
