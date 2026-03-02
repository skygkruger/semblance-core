import type { AutonomySelectorProps } from './AutonomySelector.types';
import { tiers } from './AutonomySelector.types';

export function AutonomySelector({ value, onChange, className = '' }: AutonomySelectorProps) {
  return (
    <div className={`grid gap-3 ${className}`} role="radiogroup" aria-label="Autonomy tier selection">
      {tiers.map((tier) => {
        const isSelected = tier.id === value;
        const isRecommended = tier.id === 'partner';

        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(tier.id)}
            className={`
              relative text-left p-5 rounded-lg border-2 transition-all duration-fast
              focus-visible:outline-none focus-visible:shadow-focus
              ${isSelected
                ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark'
                : isRecommended
                  ? 'border-semblance-border dark:border-semblance-border-dark bg-semblance-primary-subtle/30 dark:bg-semblance-primary-subtle-dark/30 hover:border-semblance-primary/50'
                  : 'border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark hover:border-semblance-primary/50'
              }
            `.trim()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-4 h-4 rounded-full border-2 flex items-center justify-center
                  ${isSelected ? 'border-semblance-primary' : 'border-semblance-muted'}
                `.trim()}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-semblance-primary" />
                )}
              </div>
              <span className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
                {tier.name}
              </span>
              {isRecommended && (
                <span className="text-xs font-medium text-semblance-primary bg-semblance-primary/10 px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
            </div>
            <p className="mt-2 ml-7 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {tier.description}
            </p>
            <p className="mt-1 ml-7 text-xs text-semblance-text-tertiary">
              {tier.detail}
            </p>
          </button>
        );
      })}
    </div>
  );
}
