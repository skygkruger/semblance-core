import type { AutonomyTier } from '../../components/AutonomySelector/AutonomySelector.types';

export type { AutonomyTier };

export interface AutonomyTierProps {
  value: AutonomyTier;
  onChange: (tier: AutonomyTier) => void;
  onContinue?: () => void;
}
