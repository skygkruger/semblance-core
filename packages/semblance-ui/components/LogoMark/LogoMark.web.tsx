import { useTranslation } from 'react-i18next';
import type { LogoMarkProps } from './LogoMark.types';
import './LogoMark.css';

export function LogoMark({ size = 120, className = '' }: LogoMarkProps) {
  const { t } = useTranslation();

  return (
    <span className={`logomark ${className}`.trim()} style={{ width: size, height: size }}>
      <img
        src="/semblance-logo-final-1.png"
        alt={t('brand.semblance')}
        width={size}
        height={size}
        className="logomark__img"
      />
    </span>
  );
}
