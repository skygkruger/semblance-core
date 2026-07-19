export interface SharedSpaceSecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KeyStoreLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createSharedSpaceSecureStorage(store: KeyStoreLike): SharedSpaceSecureStorage {
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
  };
}

export function createMemorySharedSpaceSecureStorage(
  initial: Record<string, string> = {},
): SharedSpaceSecureStorage {
  const backing = new Map<string, string>(Object.entries(initial));
  return {
    async get(key: string): Promise<string | null> {
      return backing.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      backing.set(key, value);
    },
    async delete(key: string): Promise<void> {
      backing.delete(key);
    },
  };
}
