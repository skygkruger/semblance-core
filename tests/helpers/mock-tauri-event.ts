import { vi } from 'vitest';

const listeners = new Map<string, Array<(event: unknown) => void>>();

export const listen = vi.fn(async (eventName: string, handler: (event: unknown) => void) => {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, []);
  }
  listeners.get(eventName)!.push(handler);

  // Return unlisten function
  return () => {
    const handlers = listeners.get(eventName);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  };
});

export const emit = vi.fn(async (eventName: string, payload?: unknown) => {
  const handlers = listeners.get(eventName);
  if (handlers) {
    for (const handler of handlers) {
      handler({ payload });
    }
  }
});

export function clearEventMocks(): void {
  listen.mockClear();
  emit.mockClear();
  listeners.clear();
}
