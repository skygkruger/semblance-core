/**
 * Injectable secure storage for sync root and device keys.
 * Compatible with kernel KeyStore and core SecureStorageAdapter shapes.
 */
export interface SyncSecureStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KeyStoreLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createSyncSecureStorageAdapter(store: KeyStoreLike): SyncSecureStorageAdapter {
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
  };
}

export function createMemorySyncSecureStorage(initial: Record<string, string> = {}): SyncSecureStorageAdapter {
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

export const SYNC_ROOT_PRIVATE_KEY = 'sync.root.privateKey';
export const SYNC_ROOT_PUBLIC_KEY = 'sync.root.publicKey';
export const SYNC_ROOT_SECRET_KEY = 'sync.root.recoverySecret';

export function syncDevicePrivateKey(deviceId: string): string {
  return `sync.device.${deviceId}.privateKey`;
}

export function syncDevicePublicKey(deviceId: string): string {
  return `sync.device.${deviceId}.publicKey`;
}

export function syncRecoveryShareKey(index: number): string {
  return `sync.recovery.share.${index}`;
}
