import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import type { HardwareDetectionProps } from './HardwareDetection.types';
import './Onboarding.css';

function formatRam(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;
}

interface HardwareRow {
  label: string;
  value: string;
  ok: boolean;
}

function buildRows(info: NonNullable<HardwareDetectionProps['hardwareInfo']>): HardwareRow[] {
  const rows: HardwareRow[] = [
    { label: 'CPU', value: `${info.cpuCores} cores`, ok: info.cpuCores >= 4 },
    { label: 'RAM', value: formatRam(info.totalRamMb), ok: info.totalRamMb >= 8192 },
  ];
  if (info.gpuName) {
    rows.push({
      label: 'GPU',
      value: info.gpuVramMb ? `${info.gpuName} (${formatRam(info.gpuVramMb)})` : info.gpuName,
      ok: true,
    });
  }
  rows.push({ label: 'OS', value: `${info.os} (${info.arch})`, ok: true });
  return rows;
}

export function HardwareDetection({ hardwareInfo, detecting, onContinue }: HardwareDetectionProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 480,
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-2xl)' }}>
        Checking your hardware
      </h2>

      {detecting && (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <ProgressBar indeterminate />
        </div>
      )}

      {hardwareInfo && !detecting && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          width: '100%',
          marginTop: 16,
        }}>
          {buildRows(hardwareInfo).map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--s1)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--b1)',
              animation: 'dissolve 700ms var(--eo) both',
              animationDelay: `${i * 80}ms`,
            }}>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sv1)' }}>
                {item.label}
              </span>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: item.ok ? 'var(--v)' : 'var(--rust)' }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {hardwareInfo && !detecting && (
        <div style={{ marginTop: 16 }}>
          <Button variant="approve" size="md" onClick={onContinue}>Continue</Button>
        </div>
      )}
    </div>
  );
}
