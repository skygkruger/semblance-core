import { AutonomySelector } from '../../components/AutonomySelector/AutonomySelector';
import { Button } from '../../components/Button/Button';
import type { AutonomyTierProps } from './AutonomyTier.types';
import './Onboarding.css';

export function AutonomyTier({ value, onChange, onContinue }: AutonomyTierProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 480,
      width: '100%',
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <h2 className="naming__headline">
        How much should <em className="naming__pronoun">it</em> do on its own?
      </h2>
      <p className="naming__subtext" style={{ maxWidth: 360 }}>
        You can change this anytime in Settings. Most users start with Partner.
      </p>

      <div style={{ width: '100%', maxWidth: 400, textAlign: 'left' }}>
        <AutonomySelector value={value} onChange={onChange} />
      </div>

      <div style={{ marginTop: 8 }}>
        <Button variant="approve" onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
