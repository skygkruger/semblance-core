import { vi } from 'vitest';

const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>();

export const invoke = vi.fn(async (cmd: string, ...args: unknown[]) => {
  const handler = invokeHandlers.get(cmd);
  if (handler) return handler(...args);
  return null;
});

export function mockInvokeCommand(cmd: string, handler: (...args: unknown[]) => unknown): void {
  invokeHandlers.set(cmd, handler);
}

export function clearInvokeMocks(): void {
  invoke.mockClear();
  invokeHandlers.clear();
}
