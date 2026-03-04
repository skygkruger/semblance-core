// Toggle — Opal-bordered switch component.
// Import Toggle.css in the consuming file.

import './Toggle.css';

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="toggle-row">
      <div>
        <p className="toggle-label">{label}</p>
        {description && <p className="toggle-description">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`toggle-track${checked ? ' toggle-track--on' : ''}`}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}
