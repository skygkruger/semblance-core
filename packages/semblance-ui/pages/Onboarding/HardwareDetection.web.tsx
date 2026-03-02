import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import type { HardwareDetectionProps } from './HardwareDetection.types';
import './Onboarding.css';

function formatRam(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function tierLabel(tier: string): string {
  if (tier === 'capable') return 'High Performance';
  if (tier === 'standard') return 'Standard';
  return 'Constrained';
}

export function HardwareDetection({ hardwareInfo, detecting, onContinue }: HardwareDetectionProps) {
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
      <h2 className="naming__headline">Detecting your hardware...</h2>
      <p className="naming__subtext" style={{ maxWidth: 360 }}>
        Semblance will recommend the best model for your machine.
      </p>

      {detecting && (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <ProgressBar indeterminate />
        </div>
      )}

      {hardwareInfo && !detecting && (
        <div style={{
          width: '100%',
          maxWidth: 400,
          padding: 20,
          borderRadius: 12,
          backgroundColor: '#111518',
          border: '1px solid rgba(107,95,168,0.15)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 13, color: '#8593A4' }}>Tier</span>
              <span style={{
                fontFamily: 'var(--fm)', fontSize: 12, color: '#6ECFA3',
                padding: '2px 8px', borderRadius: 6,
                backgroundColor: 'rgba(110,207,163,0.1)',
              }}>
                {tierLabel(hardwareInfo.tier)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 13, color: '#8593A4' }}>RAM</span>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: '#EEF1F4' }}>
                {formatRam(hardwareInfo.totalRamMb)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 13, color: '#8593A4' }}>CPU</span>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: '#EEF1F4' }}>
                {hardwareInfo.cpuCores} cores
              </span>
            </div>
            {hardwareInfo.gpuName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--fb)', fontSize: 13, color: '#8593A4' }}>GPU</span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: '#EEF1F4' }}>
                  {hardwareInfo.gpuName}
                  {hardwareInfo.gpuVramMb ? ` (${formatRam(hardwareInfo.gpuVramMb)})` : ''}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 13, color: '#8593A4' }}>OS</span>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: '#EEF1F4' }}>
                {hardwareInfo.os} ({hardwareInfo.arch})
              </span>
            </div>
          </div>
        </div>
      )}

      {hardwareInfo && !detecting && (
        <Button variant="approve" onClick={onContinue}>Continue</Button>
      )}
    </div>
  );
}
