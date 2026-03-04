import { useTranslation } from 'react-i18next';
import type { ThemeMode, ThemeToggleProps } from './ThemeToggle.types';
import './ThemeToggle.css';

const modes: Array<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export function ThemeToggle({ value, onChange, className = '' }: ThemeToggleProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`theme-toggle ${className}`}
      role="radiogroup"
      aria-label={t('a11y.theme_selection')}
    >
      {modes.map((mode) => {
        const isActive = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(mode.id)}
            className={`theme-toggle__option ${isActive ? 'theme-toggle__option--active' : ''}`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
