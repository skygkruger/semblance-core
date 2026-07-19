import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { KeyStore, SigningKeyMaterial } from '../keys/key-store.js';
import {
  DEVICE_ID_KEY,
  PRINCIPAL_ID_KEY,
  SIGNING_PRIVATE_KEY_KEY,
  SIGNING_PUBLIC_KEY_KEY,
} from '../keys/key-store.js';

function encodeKeyMaterial(privateKey: Buffer, publicKey: Buffer): SigningKeyMaterial {
  return {
    privateKey: `ed25519:${privateKey.toString('base64url')}`,
    publicKey: `ed25519:${publicKey.toString('base64url')}`,
  };
}

function decodePrivateKey(encoded: string): Buffer {
  const prefix = 'ed25519:';
  if (!encoded.startsWith(prefix)) {
    throw new Error('Unsupported signing private key encoding');
  }
  return Buffer.from(encoded.slice(prefix.length), 'base64url');
}

export interface DeviceIdentity {
  readonly deviceId: string;
  readonly principalId: string;
  getSigningKeyMaterial(): Promise<SigningKeyMaterial>;
  signPayload(payload: string): Promise<string>;
}

export async function createDeviceIdentity(keyStore: KeyStore): Promise<DeviceIdentity> {
  let deviceId = await keyStore.get(DEVICE_ID_KEY);
  let principalId = await keyStore.get(PRINCIPAL_ID_KEY);
  let privateKeyEncoded = await keyStore.get(SIGNING_PRIVATE_KEY_KEY);
  let publicKeyEncoded = await keyStore.get(SIGNING_PUBLIC_KEY_KEY);

  if (!deviceId) {
    deviceId = `device-${randomUUID()}`;
    await keyStore.set(DEVICE_ID_KEY, deviceId);
  }

  if (!principalId) {
    principalId = `principal-${createHash('sha256').update(deviceId).digest('hex').slice(0, 12)}`;
    await keyStore.set(PRINCIPAL_ID_KEY, principalId);
  }

  if (!privateKeyEncoded || !publicKeyEncoded) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const material = encodeKeyMaterial(
      privateKey.export({ type: 'pkcs8', format: 'der' }),
      publicKey.export({ type: 'spki', format: 'der' }),
    );
    privateKeyEncoded = material.privateKey;
    publicKeyEncoded = material.publicKey;
    await keyStore.set(SIGNING_PRIVATE_KEY_KEY, privateKeyEncoded);
    await keyStore.set(SIGNING_PUBLIC_KEY_KEY, publicKeyEncoded);
  }

  const resolvedDeviceId = deviceId;
  const resolvedPrincipalId = principalId;
  const resolvedPrivateKey = privateKeyEncoded;
  const resolvedPublicKey = publicKeyEncoded;

  return {
    deviceId: resolvedDeviceId,
    principalId: resolvedPrincipalId,
    async getSigningKeyMaterial(): Promise<SigningKeyMaterial> {
      return {
        privateKey: resolvedPrivateKey,
        publicKey: resolvedPublicKey,
      };
    },
    async signPayload(payload: string): Promise<string> {
      const { createPrivateKey, sign } = await import('node:crypto');
      const privateKey = createPrivateKey({
        key: decodePrivateKey(resolvedPrivateKey),
        format: 'der',
        type: 'pkcs8',
      });
      const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey);
      return `ed25519:${signature.toString('base64url')}`;
    },
  };
}
