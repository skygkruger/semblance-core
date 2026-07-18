import { z } from 'zod';

export const ProtocolVersion = z.literal(1);
export type ProtocolVersion = z.infer<typeof ProtocolVersion>;

export const SchemaVersion = z.literal(1);
export type SchemaVersion = z.infer<typeof SchemaVersion>;

export const ProcessType = z.enum([
  'kernel',
  'core',
  'gateway',
  'model',
  'extension-runner',
  'cloud-broker',
  'vault',
]);
export type ProcessType = z.infer<typeof ProcessType>;

export const SensitivityLevel = z.enum(['public', 'personal', 'sensitive', 'restricted']);
export type SensitivityLevel = z.infer<typeof SensitivityLevel>;

export const ExecutionDestination = z.enum([
  'local',
  'gateway',
  'self_hosted',
  'byo',
  'semblance_confidential',
]);
export type ExecutionDestination = z.infer<typeof ExecutionDestination>;

export const CapabilityResource = z.enum([
  'vault',
  'gateway',
  'model',
  'extension',
  'commerce',
  'cloud-transport',
  'sync',
]);
export type CapabilityResource = z.infer<typeof CapabilityResource>;

export const AutonomyProfile = z.enum(['guardian', 'partner', 'alter_ego']);
export type AutonomyProfile = z.infer<typeof AutonomyProfile>;

export const IsoDateTime = z.string().datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;
