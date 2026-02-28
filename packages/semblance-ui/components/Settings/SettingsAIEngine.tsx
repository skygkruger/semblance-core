import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface SettingsAIEngineProps {
  modelName: string;
  modelSize: string;
  hardwareProfile: string;
  isModelRunning: boolean;
  inferenceThreads: number | 'auto';
  contextWindow: 4096 | 8192 | 16384 | 32768;
  gpuAcceleration: boolean;
  customModelPath: string | null;
  onChange: (key: string, value: unknown) => void;
  onBack: () => void;
}

const threadOptions = ['auto', '4', '8', '16'] as const;
const contextOptions = [4096, 8192, 16384, 32768] as const;
const contextLabels: Record<number, string> = { 4096: '4K', 8192: '8K', 16384: '16K', 32768: '32K' };

export function SettingsAIEngine({
  modelName,
  modelSize,
  hardwareProfile,
  isModelRunning,
  inferenceThreads,
  contextWindow,
  gpuAcceleration,
  customModelPath,
  onChange,
  onBack,
}: SettingsAIEngineProps) {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">AI Engine</h1>
      </div>

      <div className="settings-content">
        {/* Active Model */}
        <div className="settings-section-header">Active Model</div>
        <div className="settings-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 400, color: '#EEF1F4' }}>
              {modelName}
            </span>
            <span className={isModelRunning ? 'settings-badge settings-badge--veridian' : 'settings-badge settings-badge--muted'}>
              {isModelRunning ? 'Running' : 'Not loaded'}
            </span>
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 300, color: '#A8B4C0' }}>
            {modelSize}
          </span>
        </div>

        {/* Hardware Profile */}
        <div className="settings-section-header">Hardware</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{hardwareProfile}</span>
        </div>

        {/* Performance Settings */}
        <div className="settings-section-header">Performance</div>

        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>Inference threads</div>
          <div className="settings-segment">
            {threadOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`settings-segment__option ${String(inferenceThreads) === opt ? 'settings-segment__option--active' : ''}`}
                onClick={() => onChange('inferenceThreads', opt === 'auto' ? 'auto' : Number(opt))}
              >
                {opt === 'auto' ? 'Auto' : opt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>Context window</div>
          <div className="settings-segment">
            {contextOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`settings-segment__option ${contextWindow === opt ? 'settings-segment__option--active' : ''}`}
                onClick={() => onChange('contextWindow', opt)}
              >
                {contextLabels[opt]}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row" onClick={() => onChange('gpuAcceleration', !gpuAcceleration)}>
          <span className="settings-row__label">GPU acceleration</span>
          <button
            type="button"
            className="settings-toggle"
            data-on={String(gpuAcceleration)}
            onClick={(e) => { e.stopPropagation(); onChange('gpuAcceleration', !gpuAcceleration); }}
          >
            <span className="settings-toggle__thumb" />
          </button>
        </div>

        {/* Advanced */}
        <div className="settings-section-header">Advanced</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Custom model path</span>
          <span className="settings-row__value">{customModelPath || 'None'}</span>
        </div>
        <button
          type="button"
          className="settings-row"
          onClick={() => onChange('resetDefaults', true)}
        >
          <span className="settings-row__label" style={{ color: '#8593A4' }}>Reset to defaults</span>
        </button>
      </div>
    </div>
  );
}
