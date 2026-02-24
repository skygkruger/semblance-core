// Witness — Barrel exports for Semblance Witness attestation system.

export type {
  WitnessAttestation,
  WitnessConfig,
  WitnessGenerationResult,
} from './types.js';

export { WitnessGenerator } from './witness-generator.js';
export { WitnessVerifier } from './witness-verifier.js';
export { WitnessExporter } from './witness-exporter.js';
export { VtiBridge } from './vti-bridge.js';
export {
  buildWitnessPayload,
  WITNESS_CONTEXT,
  WITNESS_TYPE,
} from './witness-format.js';
