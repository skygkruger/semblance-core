import { useTranslation } from 'react-i18next';
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

function buildRows(info: NonNullable<HardwareDetectionProps['hardwareInfo']>, t: (key: string, opts?: Record<string, unknown>) => string): HardwareRow[] {
  const rows: HardwareRow[] = [
    { label: t('hardware.cpu_label'), value: t('hardware.cpu_cores', { count: info.cpuCores }), ok: info.cpuCores >= 4 },
    { label: t('hardware.memory'), value: formatRam(info.totalRamMb), ok: info.totalRamMb >= 8192 },
  ];
  if (info.gpuName) {
    rows.push({
      label: t('hardware.gpu_label'),
      value: info.gpuVramMb ? `${info.gpuName} (${formatRam(info.gpuVramMb)})` : info.gpuName,
      ok: true,
    });
  }
  rows.push({ label: t('hardware.os_label'), value: `${info.os} (${info.arch})`, ok: true });
  return rows;
}

export function HardwareDetection({ hardwareInfo, detecting, onContinue }: HardwareDetectionProps) {
  const { t } = useTranslation('onboarding');

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
        {t('hardware.checking')}
      </h2>

      {detecting && (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <ProgressBar indeterminate />
        </div>
      )}

      {hardwareInfo && !detecting && (
        <div className="onboarding-content-frame" style={{ width: '100%', marginTop: 16 }}>
          {buildRows(hardwareInfo, t).map((item, i) => (
            <div key={i} className="onboarding-content-frame__item" style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 16px',
              animation: 'dissolve 700ms var(--eo) both',
              animationDelay: `${i * 80}ms`,
            }}>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sv1)' }}>
                {item.label}
              </span>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: item.ok ? '#6ECFA3' : '#E8657A' }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {hardwareInfo && !detecting && (
        <div style={{ marginTop: 16 }}>
          <Button variant="opal" size="lg" onClick={onContinue}><span className="btn__text">{t('hardware.continue_button')}</span></Button>
        </div>
      )}
    </div>
  );
}
