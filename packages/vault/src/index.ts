export {
  VaultCapabilityError,
  type VaultCapabilityErrorCode,
} from './capabilities/errors.js';
export {
  assertVaultCapability,
  type VaultCapabilityGuardContext,
} from './capabilities/guard.js';
export {
  createVaultCapabilityClient,
  type VaultCapabilityClient,
  type VaultCapabilityClientOptions,
} from './capabilities/client.js';
