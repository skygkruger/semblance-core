// Cloud Bridge — Gateway-side module for routing inference to cloud AI providers.
//
// This is the ONLY module that makes outbound API calls to cloud providers.
// All network access is contained here, in packages/gateway/.
// packages/core/ NEVER imports from this module.

export { ProviderRegistry } from './provider-registry.js';
export { CloudBridgeAdapter, type CloudBridgeAdapterConfig } from './cloud-bridge-adapter.js';
export { validateApiKey, type ValidationResult } from './api-key-validator.js';
export { classifyContent, checkExclusions } from './content-classifier.js';
export {
  CloudBridgeRoutingEngine,
  type RoutingDecision,
  type RoutingEngineConfig,
} from './routing-engine.js';
