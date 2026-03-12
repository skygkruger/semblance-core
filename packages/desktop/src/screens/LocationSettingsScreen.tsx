import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './LocationSettingsScreen.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LocationSettings {
  enabled: boolean;
  defaultCity: string;
  weatherEnabled: boolean;
  commuteEnabled: boolean;
  remindersEnabled: boolean;
  retentionDays: number;
}

const STORAGE_KEY = 'semblance.location_settings';

const DEFAULT_SETTINGS: LocationSettings = {
  enabled: false,
  defaultCity: '',
  weatherEnabled: false,
  commuteEnabled: false,
  remindersEnabled: false,
  retentionDays: 30,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function LocationSettingsScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LocationSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    async function loadData() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch (err) {
        console.error('[LocationSettingsScreen] load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const updateSettings = useCallback((changes: Partial<LocationSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...changes };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const retentionOptions = [
    { value: 7, label: t('screen.location.retention_7') },
    { value: 30, label: t('screen.location.retention_30') },
    { value: 90, label: t('screen.location.retention_90') },
    { value: 365, label: t('screen.location.retention_365') },
  ];

  const toggleSetting = (key: keyof LocationSettings) => {
    updateSettings({ [key]: !settings[key] });
  };

  if (loading) {
    return (
      <div className="location-settings h-full overflow-y-auto">
        <div className="location-settings__container">
          <h1 className="location-settings__title">{t('screen.location.title')}</h1>
          <div className="location-settings__card surface-void opal-wireframe">
            <p>{t('common.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="location-settings h-full overflow-y-auto">
      <div className="location-settings__container">
        <h1 className="location-settings__title">{t('screen.location.title')}</h1>
        <p className="location-settings__subtitle">
          {t('screen.location.subtitle')}
        </p>

        {/* Enable card */}
        <div className="location-settings__card surface-void opal-wireframe">
          <div className="location-settings__toggle-row">
            <div className="location-settings__toggle-info">
              <span className="location-settings__toggle-name">{t('screen.location.services')}</span>
              <span className="location-settings__toggle-detail">
                {t('screen.location.services_detail')}
              </span>
            </div>
            <button
              className={`location-settings__toggle ${settings.enabled ? 'location-settings__toggle--on' : ''}`}
              onClick={() => toggleSetting('enabled')}
              aria-label="Toggle location services"
            >
              <span className="location-settings__toggle-thumb" />
            </button>
          </div>
        </div>

        {/* Manual city entry */}
        <div className="location-settings__card surface-void opal-wireframe">
          <div className="location-settings__card-header">
            <h2 className="location-settings__card-title">{t('screen.location.default_city')}</h2>
          </div>
          <p className="location-settings__field-hint">
            {t('screen.location.default_city_hint')}
          </p>
          <input
            type="text"
            className="location-settings__input"
            placeholder={t('screen.location.city_placeholder')}
            value={settings.defaultCity}
            onChange={(e) => updateSettings({ defaultCity: e.target.value })}
          />
        </div>

        {/* Feature toggles */}
        <div className="location-settings__card surface-void opal-wireframe">
          <div className="location-settings__card-header">
            <h2 className="location-settings__card-title">{t('screen.location.features')}</h2>
          </div>
          <div className="location-settings__toggle-list">
            <div className="location-settings__toggle-row">
              <div className="location-settings__toggle-info">
                <span className="location-settings__toggle-name">{t('screen.location.weather')}</span>
                <span className="location-settings__toggle-detail">
                  {t('screen.location.weather_detail')}
                </span>
              </div>
              <button
                className={`location-settings__toggle ${settings.weatherEnabled ? 'location-settings__toggle--on' : ''}`}
                onClick={() => toggleSetting('weatherEnabled')}
                aria-label="Toggle weather"
              >
                <span className="location-settings__toggle-thumb" />
              </button>
            </div>
            <div className="location-settings__toggle-row">
              <div className="location-settings__toggle-info">
                <span className="location-settings__toggle-name">{t('screen.location.commute')}</span>
                <span className="location-settings__toggle-detail">
                  {t('screen.location.commute_detail')}
                </span>
              </div>
              <button
                className={`location-settings__toggle ${settings.commuteEnabled ? 'location-settings__toggle--on' : ''}`}
                onClick={() => toggleSetting('commuteEnabled')}
                aria-label="Toggle commute"
              >
                <span className="location-settings__toggle-thumb" />
              </button>
            </div>
            <div className="location-settings__toggle-row">
              <div className="location-settings__toggle-info">
                <span className="location-settings__toggle-name">{t('screen.location.reminders')}</span>
                <span className="location-settings__toggle-detail">
                  {t('screen.location.reminders_detail')}
                </span>
              </div>
              <button
                className={`location-settings__toggle ${settings.remindersEnabled ? 'location-settings__toggle--on' : ''}`}
                onClick={() => toggleSetting('remindersEnabled')}
                aria-label="Toggle location reminders"
              >
                <span className="location-settings__toggle-thumb" />
              </button>
            </div>
          </div>
        </div>

        {/* Data retention */}
        <div className="location-settings__card surface-void opal-wireframe">
          <div className="location-settings__card-header">
            <h2 className="location-settings__card-title">{t('screen.location.data_retention')}</h2>
          </div>
          <p className="location-settings__field-hint">
            {t('screen.location.retention_hint')}
          </p>
          <div className="location-settings__retention-options">
            {retentionOptions.map((opt) => (
              <button
                key={opt.value}
                className={`location-settings__retention-btn ${settings.retentionDays === opt.value ? 'location-settings__retention-btn--active' : ''}`}
                onClick={() => updateSettings({ retentionDays: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clear history */}
        <div className="location-settings__card surface-void opal-wireframe">
          <div className="location-settings__card-header">
            <h2 className="location-settings__card-title">{t('screen.location.clear_history')}</h2>
          </div>
          <p className="location-settings__field-hint">
            {t('screen.location.clear_history_hint')}
          </p>
          <button className="location-settings__danger-btn" disabled>
            {t('screen.location.clear_all')}
          </button>
        </div>
      </div>
    </div>
  );
}
