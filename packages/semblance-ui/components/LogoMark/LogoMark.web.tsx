import type { LogoMarkProps } from './LogoMark.types';
import './LogoMark.css';

export function LogoMark({ size = 120, className = '' }: LogoMarkProps) {
  return (
    <span className={`logomark ${className}`.trim()} style={{ width: size, height: size }}>
      <img
        src="/semblance-logo-final-1.png"
        alt="Semblance"
        width={size}
        height={size}
        className="logomark__img"
      />
    </span>
  );
}
