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
      {tiers.map((tier, i) => (
        <div
          key={tier.id}
          onClick={() => onChange(tier.id)}
          style={{
            width: '100%',
            padding: '20px 24px',
            background: tier.id === value ? 'var(--s2)' : 'var(--s1)',
            borderRadius: 'var(--r-lg)',
            border: `1px solid ${tier.id === value ? 'var(--v-wire)' : tier.recommended ? 'var(--v-wire)' : 'var(--b1)'}`,
            cursor: 'pointer',
            animation: 'dissolve 700ms var(--eo) both',
            animationDelay: `${i * 80}ms`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-lg)', fontWeight: 400, color: 'var(--w-dim)' }}>
              {tier.name}
            </span>
            {tier.recommended && (
              <span style={{
                fontFamily: 'var(--fm)',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--v)',
                background: 'var(--v-dim)',
                padding: '2px 8px',
                borderRadius: 'var(--r-sm)',
              }}>
                Recommended
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: 'var(--sv3)', marginTop: 6 }}>
            {tier.desc}
          </p>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <Button variant="approve" onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
