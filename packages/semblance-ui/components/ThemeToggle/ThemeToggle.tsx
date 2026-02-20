type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  className?: string;
}

const modes: Array<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export function ThemeToggle({ value, onChange, className = '' }: ThemeToggleProps) {
  return (
    <div
      className={`
        inline-flex p-1
        bg-semblance-surface-2 dark:bg-semblance-surface-2-dark
        rounded-md
        ${className}
      `.trim()}
      role="radiogroup"
      aria-label="Theme selection"
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
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md
              transition-all duration-fast
              focus-visible:outline-none focus-visible:shadow-focus
              ${isActive
                ? 'bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark shadow-sm'
                : 'text-semblance-text-tertiary hover:text-semblance-text-secondary dark:hover:text-semblance-text-secondary-dark'
              }
            `.trim()}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

export type { ThemeMode };
