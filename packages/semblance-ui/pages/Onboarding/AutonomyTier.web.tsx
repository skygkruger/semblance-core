import { Button } from '../../components/Button/Button';
import type { AutonomyTierProps } from './AutonomyTier.types';
import type { AutonomyTier as AutonomyTierType } from '../../components/AutonomySelector/AutonomySelector.types';
import './Onboarding.css';

const tiers: Array<{ id: AutonomyTierType; name: string; desc: string; recommended: boolean }> = [
  { id: 'guardian', name: 'Guardian', desc: 'Shows everything, asks before acting. You approve every action.', recommended: false },
  { id: 'partner', name: 'Partner', desc: 'Handles routine tasks autonomously. Asks for anything new or high-stakes.', recommended: true },
  { id: 'alter_ego', name: 'Alter Ego', desc: 'Acts as you across your digital life. Confirms before irreversible actions, high-stakes decisions, and anything above your financial threshold. Everything else: handled.', recommended: false },
];

export function AutonomyTier({ value, onChange, onContinue }: AutonomyTierProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 560,
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-2xl)' }}>
        How much should Semblance do on its own?
      </h2>
      <div className="onboarding-content-frame">
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            onClick={() => onChange(tier.id)}
            className={`onboarding-content-frame__item ${tier.id === value ? 'onboarding-content-frame__item--selected' : ''}`}
            style={{
              animation: 'dissolve 700ms var(--eo) both',
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-lg)', fontWeight: 400, color: '#EEF1F4' }}>
                {tier.name}
              </span>
              {tier.recommended && (
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#6ECFA3',
                  background: 'rgba(110, 207, 163, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-sm)',
                }}>
                  Recommended
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: '#8593A4', marginTop: 6, lineHeight: 1.5 }}>
              {tier.desc}
            </p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Button variant="approve" onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
