import { randomUUID } from 'node:crypto';
import {
  generateEd25519KeyMaterial,
  type Ed25519KeyMaterial,
} from '../crypto/ed25519.js';
import {
  syncDevicePrivateKey,
  syncDevicePublicKey,
  type SyncSecureStorageAdapter,
} from './secure-storage.js';

export interface StoredDeviceKeys {
  readonly deviceId: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

export async function getOrCreateDeviceKeys(
  secureStorage: SyncSecureStorageAdapter,
  deviceId: string = `device-${randomUUID()}`,
): Promise<StoredDeviceKeys> {
  const existingPublic = await secureStorage.get(syncDevicePublicKey(deviceId));
  const existingPrivate = await secureStorage.get(syncDevicePrivateKey(deviceId));

  if (existingPublic && existingPrivate) {
    return {
      deviceId,
      publicKey: existingPublic,
      privateKey: existingPrivate,
    };
  }

  const material = generateEd25519KeyMaterial();
  await secureStorage.set(syncDevicePublicKey(deviceId), material.publicKey);
  await secureStorage.set(syncDevicePrivateKey(deviceId), material.privateKey);

  return {
    deviceId,
    publicKey: material.publicKey,
    privateKey: material.privateKey,
  };
}

export async function loadDevicePublicKey(
  secureStorage: SyncSecureStorageAdapter,
  deviceId: string,
): Promise<string | null> {
  return secureStorage.get(syncDevicePublicKey(deviceId));
}

export function exportDeviceKeyMaterial(material: Ed25519KeyMaterial): Pick<StoredDeviceKeys, 'publicKey' | 'privateKey'> {
  return {
    publicKey: material.publicKey,
    privateKey: material.privateKey,
  };
}
