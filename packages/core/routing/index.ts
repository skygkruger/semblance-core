// @semblance/core/routing — Task Routing Foundation
// Device capability registry, task assessment, and routing decisions.
// CRITICAL: No networking imports. All routing logic is pure.

export { DeviceRegistry } from './device-registry.js';
export { TaskAssessor } from './task-assessor.js';
export { TaskRouter } from './router.js';
export type {
  DeviceCapabilities,
  TaskRequirements,
} from './device-registry.js';
export type {
  TaskDescription,
} from './task-assessor.js';
export type {
  RoutingDecision,
} from './router.js';
export type {
  DiscoveredDevice,
  TaskDelegation,
  DelegationStatus,
  DelegationResult,
  IncomingDelegation,
  TaskDelegationProtocol,
} from './protocol.js';
