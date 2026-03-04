/**
 * HardwareProfileDisplay — Shows detected hardware capabilities in plain language.
 */

import type { HardwareProfileTier } from '@semblance/core/llm/hardware-types.js';
import { Card } from '@semblance/ui';
import './HardwareProfileDisplay.css';

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
      <Card>
        <div className="hw-profile__compact">
          <svg className="hw-profile__compact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M15 2v2" /><path d="M15 20v2" />
            <path d="M2 15h2" /><path d="M2 9h2" />
            <path d="M20 15h2" /><path d="M20 9h2" />
            <path d="M9 2v2" /><path d="M9 20v2" />
          </svg>
          <div className="hw-profile__compact-body">
            <p className="hw-profile__compact-tier">{tierLabel} Profile</p>
            <p className="hw-profile__compact-specs">
              {formatRam(hardware.totalRamMb)} &middot; {hardware.cpuCores} cores
              {hardware.gpuName ? ` · ${hardware.gpuName}` : ''}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="hw-profile__full">
        <div className="hw-profile__header">
          <svg className="hw-profile__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M15 2v2" /><path d="M15 20v2" />
            <path d="M2 15h2" /><path d="M2 9h2" />
            <path d="M20 15h2" /><path d="M20 9h2" />
            <path d="M9 2v2" /><path d="M9 20v2" />
          </svg>
          <div>
            <p className="hw-profile__tier-name">{tierLabel} Profile</p>
            <p className="hw-profile__tier-desc">{tierDescription}</p>
          </div>
        </div>

        <div className="hw-profile__specs">
          <div className="hw-profile__spec">
            <p className="hw-profile__spec-label">Memory</p>
            <p className="hw-profile__spec-value">{formatRam(hardware.totalRamMb)}</p>
          </div>
          <div className="hw-profile__spec">
            <p className="hw-profile__spec-label">CPU Cores</p>
            <p className="hw-profile__spec-value">{hardware.cpuCores}</p>
          </div>
          {hardware.gpuName && (
            <div className="hw-profile__spec hw-profile__spec--wide">
              <p className="hw-profile__spec-label">GPU</p>
              <p className="hw-profile__spec-value">
                {hardware.gpuName}
                {hardware.gpuVramMb ? ` (${formatRam(hardware.gpuVramMb)})` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
