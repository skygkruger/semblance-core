// Semblance Network — Local consensual sharing between instances.
// Step 28, Sprint 5.
// CRITICAL: No networking imports in this barrel. All files are network-free.

export type {
  SharingCategory,
  RelationshipStatus,
  SharingRelationship,
  SharingOffer,
  SharingAcceptance,
  SharedContext,
  RevocationPayload,
  NetworkConfig,
  DiscoveredPeer,
  AssembledContext,
} from './types.js';

export {
  OFFER_EXPIRY_MS,
  NETWORK_MDNS_SERVICE_TYPE,
  NETWORK_PROTOCOL_VERSION,
} from './types.js';

export { NetworkConfigStore } from './network-config-store.js';
export { ContextAssembler } from './context-assembler.js';
export { SharedContextStore } from './shared-context-store.js';
export { SharingOfferHandler } from './sharing-offer-handler.js';
export type { OfferHandlerDeps } from './sharing-offer-handler.js';
export { RevocationHandler } from './revocation-handler.js';
export type { RevocationHandlerDeps, RevocationEvent } from './revocation-handler.js';
export { PeerDiscovery } from './peer-discovery.js';
export type { NetworkIPCClient } from './peer-discovery.js';
export { SharingRelationshipManager } from './sharing-relationship-manager.js';
export { NetworkSyncEngine } from './network-sync-engine.js';
export type { SyncResult, NetworkSyncEngineDeps } from './network-sync-engine.js';
export { NetworkTracker } from './network-tracker.js';
export type { NetworkTrackerDeps } from './network-tracker.js';
