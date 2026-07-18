/** Well-known key names persisted through KeyStore adapters. */
export const DEVICE_ID_KEY = 'kernel.deviceId';
export const PRINCIPAL_ID_KEY = 'kernel.principalId';
export const SIGNING_PRIVATE_KEY_KEY = 'kernel.signingPrivateKey';
export const SIGNING_PUBLIC_KEY_KEY = 'kernel.signingPublicKey';

export interface KeyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SigningKeyMaterial {
  privateKey: string;
  publicKey: string;
}
