import { useTranslation } from 'react-i18next';
import './VoiceSettingsScreen.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoiceCapability {
  name: string;
  status: 'available' | 'not-available' | 'downloading';
  detail: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function VoiceSettingsScreen() {
  const { t } = useTranslation();

  const capabilities: VoiceCapability[] = [
    {
      name: t('screen.voice.stt_name'),
      status: 'not-available',
      detail: t('screen.voice.stt_detail'),
    },
    {
      name: t('screen.voice.tts_name'),
      status: 'not-available',
      detail: t('screen.voice.tts_detail'),
    },
  ];

  return (
    <div className="voice-settings h-full overflow-y-auto">
      <div className="voice-settings__container">
        <h1 className="voice-settings__title">{t('screen.voice.title')}</h1>
        <p className="voice-settings__subtitle">
          {t('screen.voice.subtitle')}
        </p>

        {/* Status card */}
        <div className="voice-settings__card surface-void opal-wireframe">
          <div className="voice-settings__card-header">
            <h2 className="voice-settings__card-title">{t('screen.voice.capability_status')}</h2>
          </div>
          <div className="voice-settings__capability-list">
            {capabilities.map((cap) => (
              <div key={cap.name} className="voice-settings__capability-row">
                <div className="voice-settings__capability-info">
                  <span className="voice-settings__capability-name">{cap.name}</span>
                  <span className="voice-settings__capability-detail">{cap.detail}</span>
                </div>
                <span className={`voice-settings__capability-status voice-settings__capability-status--${cap.status}`}>
                  {cap.status === 'not-available' ? t('screen.voice.not_available') : cap.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Info card */}
        <div className="voice-settings__card surface-slate opal-wireframe">
          <div className="voice-settings__info">
            <h2 className="voice-settings__card-title">{t('screen.voice.native_required')}</h2>
            <p className="voice-settings__info-text">
              {t('screen.voice.native_required_detail')}
            </p>
            <p className="voice-settings__info-text">
              {t('screen.voice.local_processing')}
            </p>
          </div>
        </div>

        {/* Architecture card */}
        <div className="voice-settings__card surface-void opal-wireframe">
          <div className="voice-settings__card-header">
            <h2 className="voice-settings__card-title">{t('screen.voice.how_it_works')}</h2>
          </div>
          <div className="voice-settings__architecture-list">
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.stt_engine')}</span>
              <span className="voice-settings__architecture-value">{t('screen.voice.whisper_on_device')}</span>
            </div>
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.tts_engine')}</span>
              <span className="voice-settings__architecture-value">{t('screen.voice.piper_on_device')}</span>
            </div>
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.model_size')}</span>
              <span className="voice-settings__architecture-value">{t('screen.voice.model_size_value')}</span>
            </div>
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.privacy')}</span>
              <span className="voice-settings__architecture-value">{t('screen.voice.fully_local')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
