import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getVoiceModelStatus, prefGet, prefSet } from '../ipc/commands';
import './VoiceSettingsScreen.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoiceCapability {
  name: string;
  status: 'available' | 'not-available' | 'downloading';
  detail: string;
}

interface VoiceSettings {
  speed: number;
  pitch: number;
  selectedVoice: string;
  autoListen: boolean;
}

const STORAGE_KEY = 'semblance.voice_settings';

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  speed: 1.0,
  pitch: 1.0,
  selectedVoice: 'default',
  autoListen: false,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sttStatus, setSttStatus] = useState<'available' | 'not-available' | 'downloading'>('not-available');
  const [ttsStatus, setTtsStatus] = useState<'available' | 'not-available' | 'downloading'>('not-available');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);

  useEffect(() => {
    async function loadData() {
      try {
        // Load persisted voice preferences from SQLite
        const saved = await prefGet(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...parsed });
        }

        // Check actual voice capability via IPC
        try {
          const modelStatus = await getVoiceModelStatus();
          if (modelStatus.whisperDownloaded) setSttStatus('available');
          if (modelStatus.piperDownloaded) setTtsStatus('available');
        } catch {
          // IPC command may not exist yet — default to not-available (honest state)
          console.info('[VoiceSettingsScreen] voice model status not available — native integration not yet wired');
        }
      } catch (err) {
        console.error('[VoiceSettingsScreen] load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const updateVoiceSettings = useCallback((changes: Partial<VoiceSettings>) => {
    setVoiceSettings((prev) => {
      const updated = { ...prev, ...changes };
      prefSet(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const capabilities: VoiceCapability[] = [
    {
      name: t('screen.voice.stt_name'),
      status: sttStatus,
      detail: t('screen.voice.stt_detail'),
    },
    {
      name: t('screen.voice.tts_name'),
      status: ttsStatus,
      detail: t('screen.voice.tts_detail'),
    },
  ];

  if (loading) {
    return (
      <div className="voice-settings h-full overflow-y-auto">
        <div className="voice-settings__container">
          <h1 className="voice-settings__title">{t('screen.voice.title')}</h1>
          <div className="voice-settings__card surface-void opal-wireframe">
            <p>{t('common.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

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

        {/* Voice preferences card — settings persist for when voice is wired */}
        <div className="voice-settings__card surface-void opal-wireframe">
          <div className="voice-settings__card-header">
            <h2 className="voice-settings__card-title">{t('screen.voice.preferences', 'Voice Preferences')}</h2>
          </div>
          <div className="voice-settings__architecture-list">
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.speed', 'Speed')}</span>
              <span className="voice-settings__architecture-value">
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={voiceSettings.speed}
                  onChange={(e) => updateVoiceSettings({ speed: parseFloat(e.target.value) })}
                  className="voice-settings__range-input"
                />
                {voiceSettings.speed.toFixed(1)}x
              </span>
            </div>
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.pitch', 'Pitch')}</span>
              <span className="voice-settings__architecture-value">
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={voiceSettings.pitch}
                  onChange={(e) => updateVoiceSettings({ pitch: parseFloat(e.target.value) })}
                  className="voice-settings__range-input"
                />
                {voiceSettings.pitch.toFixed(1)}x
              </span>
            </div>
            <div className="voice-settings__architecture-item">
              <span className="voice-settings__architecture-label">{t('screen.voice.auto_listen', 'Auto-listen after response')}</span>
              <span className="voice-settings__architecture-value">
                <button
                  type="button"
                  className={`voice-settings__capability-status voice-settings__capability-status--${voiceSettings.autoListen ? 'available' : 'not-available'} voice-settings__toggle-btn`}
                  onClick={() => updateVoiceSettings({ autoListen: !voiceSettings.autoListen })}
                >
                  {voiceSettings.autoListen ? t('screen.voice.on', 'On') : t('screen.voice.off', 'Off')}
                </button>
              </span>
            </div>
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
