import type { PeriodSelectorProps, PeriodOption } from './Charts.types';
import './PeriodSelector.css';

const OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'custom', label: 'Custom' },
];

export function PeriodSelector({ selected, onSelect }: PeriodSelectorProps) {
  return (
    <div className="period-selector" role="group" aria-label="Period selector">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`period-selector__btn ${selected === opt.value ? 'period-selector__btn--active' : ''}`}
          onClick={() => onSelect(opt.value)}
          aria-pressed={selected === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
