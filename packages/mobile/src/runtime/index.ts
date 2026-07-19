// Mobile Runtime — Public API for the mobile AI runtime layer.
//
// Import from this module to access:
// - SemblanceProvider (React Context)
// - useSemblance hook
// - Runtime initialization functions
// - Platform adapter factories

export { SemblanceProvider, useSemblance } from './SemblanceProvider';
export type { SemblanceContextValue, ChatMessage } from './SemblanceProvider';

export {
  initializeMobileRuntime,
  getRuntimeState,
  sendChatMessage,
  streamChatMessage,
  shutdownMobileRuntime,
} from './mobile-runtime';
export type { MobileRuntimeState } from './mobile-runtime';

export {
  createSovereignNodeClient,
  SovereignNodeClient,
} from './sovereign-node-client';
export type { SovereignNodeClientOptions, SovereignNodeStatus } from './sovereign-node-client';

export {
  createRNFSAdapter,
  createCryptoAdapter,
  createSQLiteAdapter,
  createHardwareAdapter,
  createNotificationAdapter,
  ensureDirectories,
  initHardwareInfo,
  prewarmFileCache,
} from './platform-adapters';

export { createSQLiteVectorStore } from './sqlite-vector-store';
