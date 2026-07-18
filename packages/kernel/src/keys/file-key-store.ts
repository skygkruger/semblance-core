import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { KeyStore } from './key-store.js';

const DEFAULT_PATH = join(homedir(), '.semblance', 'kernel-keystore.json');

interface FileKeyStorePayload {
  version: 1;
  secrets: Record<string, string>;
}

function readPayload(path: string): FileKeyStorePayload {
  if (!existsSync(path)) {
    return { version: 1, secrets: {} };
  }

  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as FileKeyStorePayload;
  if (parsed.version !== 1 || typeof parsed.secrets !== 'object' || parsed.secrets === null) {
    throw new Error('Invalid kernel file keystore format');
  }
  return parsed;
}

function writePayload(path: string, payload: FileKeyStorePayload): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows — best effort
  }
}

/**
 * File-backed KeyStore for explicit headless/test configuration only.
 * Production desktop and mobile paths must use OS-backed storage.
 */
export function createFileKeyStore(path: string = DEFAULT_PATH): KeyStore {
  return {
    async get(key: string): Promise<string | null> {
      const payload = readPayload(path);
      return payload.secrets[key] ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      const payload = readPayload(path);
      payload.secrets[key] = value;
      writePayload(path, payload);
    },
    async delete(key: string): Promise<void> {
      const payload = readPayload(path);
      delete payload.secrets[key];
      writePayload(path, payload);
    },
  };
}

/** Remove the on-disk file keystore if present. */
export function deleteFileKeyStore(path: string = DEFAULT_PATH): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export { DEFAULT_PATH as FILE_KEYSTORE_DEFAULT_PATH };
