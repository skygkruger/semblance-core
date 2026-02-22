/**
 * HardwareProfileDisplay — Shows detected hardware capabilities in plain language.
 * Used during onboarding (Step 3) and in Settings AI Engine section.
 */

import type { HardwareProfileTier } from '@semblance/core/llm/hardware-types.js';

export interface HardwareDisplayInfo {
  tier: HardwareProfileTier;
  totalRamMb: number;
  cpuCores: number;
  gpuName: string | null;
  gpuVramMb: number | null;
  os: string;
  arch: string;
}

const TIER_LABELS: Record<HardwareProfileTier, string> = {
  constrained: 'Basic',
  standard: 'Standard',
  performance: 'Performance',
  workstation: 'Workstation',
};

const TIER_DESCRIPTIONS: Record<HardwareProfileTier, string> = {
  constrained: 'Your device can run a lightweight AI model for basic tasks.',
  standard: 'Your device can run a capable AI model for everyday tasks.',
  performance: 'Your device can run a powerful AI model with fast responses.',
  workstation: 'Your device can run the highest-quality AI model available.',
};

function formatRam(mb: number): string {
  if (mb >= 1024) {
    const gb = Math.round(mb / 1024);
    return `${gb} GB RAM`;
  }
  return `${mb} MB RAM`;
}

export function HardwareProfileDisplay({
  hardware,
  compact = false,
}: {
  hardware: HardwareDisplayInfo;
  compact?: boolean;
}) {
  const tierLabel = TIER_LABELS[hardware.tier];
  const tierDescription = TIER_DESCRIPTIONS[hardware.tier];

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-semblance-success" />
        <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          {tierLabel} — {formatRam(hardware.totalRamMb)}
          {hardware.gpuName ? ` + ${hardware.gpuName}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="text-left space-y-4">
      <div className="flex items-center gap-3">
        <svg className="w-8 h-8 text-semblance-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <path d="M15 2v2" /><path d="M15 20v2" />
          <path d="M2 15h2" /><path d="M2 9h2" />
          <path d="M20 15h2" /><path d="M20 9h2" />
          <path d="M9 2v2" /><path d="M9 20v2" />
        </svg>
        <div>
          <p className="font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {tierLabel} Profile
          </p>
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {tierDescription}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
          <p className="text-semblance-text-tertiary">Memory</p>
          <p className="font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {formatRam(hardware.totalRamMb)}
          </p>
        </div>
        <div className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
          <p className="text-semblance-text-tertiary">CPU Cores</p>
          <p className="font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {hardware.cpuCores}
          </p>
        </div>
        {hardware.gpuName && (
          <div className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark col-span-2">
            <p className="text-semblance-text-tertiary">GPU</p>
            <p className="font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
              {hardware.gpuName}
              {hardware.gpuVramMb ? ` (${formatRam(hardware.gpuVramMb)})` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
