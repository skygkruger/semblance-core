import type { KeyStore } from './key-store.js';

export function createMemoryKeyStore(initial: Record<string, string> = {}): KeyStore {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}
