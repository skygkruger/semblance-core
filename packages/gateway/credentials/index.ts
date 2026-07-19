export { CredentialStore } from './store.js';
export {
  createCredentialCapabilityClient,
  type CredentialAccessBackend,
  type CredentialAccessGrant,
  type CredentialCapabilityClient,
  type CredentialCapabilityClientConfig,
  type IssueCredentialAccessParams,
} from './credential-capability-client.js';
export { encryptPassword, decryptPassword, getEncryptionKey } from './encryption.js';
export {
  type ServiceCredential,
  type ServiceCredentialInput,
  type ServiceType,
  type ProtocolType,
  type ConnectionTestResult,
  type ProviderPreset,
  PROVIDER_PRESETS,
} from './types.js';
