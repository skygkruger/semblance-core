export type AutonomyTier = 'guardian' | 'partner' | 'alter_ego';

export interface AutonomySelectorProps {
  value: AutonomyTier;
  onChange: (tier: AutonomyTier) => void;
  className?: string;
}

export interface TierOption {
  id: AutonomyTier;
  name: string;
  description: string;
  detail: string;
}

export const tiers: TierOption[] = [
  {
    id: 'guardian',
    name: 'Guardian',
    description: "I'll show you everything before I act",
    detail: 'Every action requires your explicit approval. Full control.',
  },
  {
    id: 'partner',
    name: 'Partner',
    description: "I'll handle the routine, check on the important stuff",
    detail: 'Routine tasks run autonomously. Novel or high-stakes actions need approval.',
  },
  {
    id: 'alter_ego',
    name: 'Alter Ego',
    description: "Acts as you across your digital life. Confirms before irreversible actions, high-stakes decisions, and anything above your financial threshold. Everything else: handled.",
    detail: 'Most users start with Partner and move here within a few weeks.',
  },
];
