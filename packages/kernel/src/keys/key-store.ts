/** Well-known key names persisted through KeyStore adapters. */
export const DEVICE_ID_KEY = 'kernel.deviceId';
export const PRINCIPAL_ID_KEY = 'kernel.principalId';
export const SIGNING_PRIVATE_KEY_KEY = 'kernel.signingPrivateKey';
export const SIGNING_PUBLIC_KEY_KEY = 'kernel.signingPublicKey';
export const ENTITLEMENT_BEARER_KEY = 'kernel.entitlement.bearer';
export const ENTITLEMENT_SNAPSHOT_KEY = 'kernel.entitlement.snapshot';
export const LICENSE_KEY = 'kernel.license.key';

/** OAuth access token key for a provider. */
export function kernelOAuthAccessKey(provider: string): string {
  return `kernel.oauth.${provider}.access_token`;
}

/** OAuth refresh token key for a provider. */
export function kernelOAuthRefreshKey(provider: string): string {
  return `kernel.oauth.${provider}.refresh_token`;
}

/** Cloud Bridge API key for a provider. */
export function kernelCloudApiKey(providerId: string): string {
  return `kernel.cloud.${providerId}.api_key`;
}

/** Cloud Bridge metadata JSON for a provider. */
export function kernelCloudMetadataKey(providerId: string): string {
  return `kernel.cloud.${providerId}.metadata`;
}

export interface KeyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SigningKeyMaterial {
  privateKey: string;
  publicKey: string;
}
