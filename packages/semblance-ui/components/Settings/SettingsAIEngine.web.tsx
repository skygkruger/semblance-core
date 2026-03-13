import { useTranslation } from 'react-i18next';
import './Settings.css';
import { BackArrow } from './SettingsIcons';
import type { SettingsAIEngineProps, BitNetModelInfo } from './SettingsAIEngine.types';
import { threadOptions, contextOptions, contextLabels } from './SettingsAIEngine.types';

function formatModelSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function ModelCard({
  model,
  isActive,
  isDownloading,
  downloadProgress,
  onDownload,
  onActivate,
}: {
  model: BitNetModelInfo;
  isActive: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  onDownload: () => void;
  onActivate: () => void;
}) {
  const cardClass = [
    'settings-model-card',
    isActive ? 'settings-model-card--active' : '',
  ].filter(Boolean).join(' ');

  let actionButton: React.ReactNode;
  if (isActive) {
    actionButton = (
      <span className="settings-model-card__action settings-model-card__action--active">
        Active
      </span>
    );
  } else if (isDownloading) {
    actionButton = (
      <span className="settings-model-card__action settings-model-card__action--downloading">
        {downloadProgress > 0 ? `${downloadProgress}%` : 'Starting...'}
      </span>
    );
  } else if (model.isDownloaded) {
    actionButton = (
      <button
        type="button"
        className="settings-model-card__action settings-model-card__action--activate"
        onClick={onActivate}
      >
        Activate
      </button>
    );
  } else {
    actionButton = (
      <button
        type="button"
        className="settings-model-card__action settings-model-card__action--download"
        onClick={onDownload}
      >
        Download
      </button>
    );
  }

  return (
    <div className={cardClass}>
      <div className="settings-model-card__info">
        <div className="settings-model-card__header">
          <span className="settings-model-card__name">{model.displayName}</span>
          {model.isRecommended && (
            <span className="settings-badge--recommended">Recommended</span>
          )}
          {model.nativeOneBit && (
            <span className="settings-model-card__tag settings-model-card__tag--native">Native 1-bit</span>
          )}
        </div>
        <div className="settings-model-card__meta">
          <span className="settings-model-card__tag settings-model-card__tag--size">
            {model.parameterCount}
          </span>
          <span className="settings-model-card__tag settings-model-card__tag--separator">/</span>
          <span className="settings-model-card__tag settings-model-card__tag--size">
            {formatModelSize(model.fileSizeBytes)}
          </span>
          <span className="settings-model-card__tag settings-model-card__tag--separator">/</span>
          <span className="settings-model-card__tag">
            {model.contextLength >= 1024 ? `${model.contextLength / 1024}K ctx` : `${model.contextLength} ctx`}
          </span>
          <span className="settings-model-card__tag settings-model-card__tag--separator">/</span>
          <span className="settings-model-card__tag">
            {model.license}
          </span>
        </div>
        {isDownloading && (
          <div className="settings-model-card__progress">
            <div
              className="settings-model-card__progress-fill"
              style={{ width: `${Math.max(downloadProgress, 2)}%` }}
            />
          </div>
        )}
      </div>
      {actionButton}
    </div>
  );
}

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
  bitnetModels,
  bitnetActiveModelId,
  bitnetDownloadingModelId,
  bitnetDownloadProgress,
  onBitNetDownload,
  onBitNetActivate,
}: SettingsAIEngineProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('ai_engine.title')}</h1>
      </div>

      <div className="settings-content">
        {/* Active Model */}
        <div className="settings-section-header">{t('ai_engine.section_model')}</div>
        <div className="settings-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--fm)', fontSize: 15, fontWeight: 400, color: '#EEF1F4' }}>
              {modelName}
            </span>
            <span className={isModelRunning ? 'settings-badge settings-badge--veridian' : 'settings-badge settings-badge--muted'}>
              {isModelRunning ? t('ai_engine.badge_running') : t('ai_engine.badge_not_loaded')}
            </span>
          </div>
          <span style={{ fontFamily: 'var(--fm)', fontSize: 12, fontWeight: 300, color: '#A8B4C0' }}>
            {modelSize}
          </span>
        </div>

        {/* BitNet Models */}
        <div className="settings-section-header">Local Models</div>
        <div className="settings-bitnet-explainer">
          1-bit quantized models that run entirely on CPU. No GPU required, no external tools.
          Managed within Semblance.
        </div>
        <div className="settings-model-grid">
          {bitnetModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isActive={bitnetActiveModelId === model.id}
              isDownloading={bitnetDownloadingModelId === model.id}
              downloadProgress={bitnetDownloadingModelId === model.id ? bitnetDownloadProgress : 0}
              onDownload={() => onBitNetDownload(model.id)}
              onActivate={() => onBitNetActivate(model.id)}
            />
          ))}
        </div>

        {/* Hardware Profile */}
        <div className="settings-section-header">{t('ai_engine.section_hardware')}</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{hardwareProfile}</span>
        </div>

        {/* Performance Settings */}
        <div className="settings-section-header">{t('ai_engine.section_performance')}</div>

        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>{t('ai_engine.label_inference_threads')}</div>
          <div className="settings-segment">
            {threadOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`settings-segment__option ${String(inferenceThreads) === opt ? 'settings-segment__option--active' : ''}`}
                onClick={() => onChange('inferenceThreads', opt === 'auto' ? 'auto' : Number(opt))}
              >
                {opt === 'auto' ? t('ai_engine.thread_option_auto') : opt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>{t('ai_engine.label_context_window')}</div>
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
          <span className="settings-row__label">{t('ai_engine.label_gpu_acceleration')}</span>
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
        <div className="settings-section-header">{t('ai_engine.section_advanced')}</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{t('ai_engine.label_custom_model_path')}</span>
          <span className="settings-row__value">{customModelPath || t('ai_engine.value_custom_model_none')}</span>
        </div>
        <button
          type="button"
          className="settings-row"
          onClick={() => onChange('resetDefaults', true)}
        >
          <span className="settings-row__label" style={{ color: '#8593A4' }}>{t('ai_engine.btn_reset_defaults')}</span>
        </button>
      </div>
    </div>
  );
}
