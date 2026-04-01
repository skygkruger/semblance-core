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
// Phase 4 — Advanced Routing Intelligence
export { ConfidenceDetector, type ConfidenceResult, type ConfidenceThresholds, type ConfidenceSignal } from './confidence-detector.js';
export { CostOptimizer, type CostEstimate, type ProviderRanking } from './cost-optimizer.js';
export { PromptMinimizer, type MinimizationResult } from './prompt-minimizer.js';
