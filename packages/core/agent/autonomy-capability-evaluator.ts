/**
 * Thin adapter — core delegates per-capability autonomy evaluation to the kernel policy map.
 */

export {
  evaluateAutonomyCapability,
  extractActionDestination,
  isCapabilityScopedAction,
  capabilityEscalationWouldHelp,
  CAPABILITY_ACTION_TYPES,
  type AutonomyCapabilityEvaluation,
  type EvaluateAutonomyCapabilityInput,
  type CapabilityActionType,
} from '@semblance/kernel';
