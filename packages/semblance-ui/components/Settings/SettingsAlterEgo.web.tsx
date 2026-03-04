import { useTranslation } from 'react-i18next';
import './Settings.css';
import { BackArrow } from './SettingsIcons';
import type { SettingsAlterEgoProps } from './SettingsAlterEgo.types';

/** Categories the user can toggle off confirmation for */
const toggleableCategories = [
  'email',
  'message',
  'calendar',
  'file',
  'financial_routine',
  'irreversible',
] as const;

/** Categories that are hardcoded — always require confirmation, never shown as toggles */
const _hardcodedCategories = ['financial_significant', 'novel'] as const;

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="settings-toggle"
      data-on={String(on)}
      onClick={onToggle}
    >
      <span className="settings-toggle__thumb" />
    </button>
  );
}

export function SettingsAlterEgo({
  dollarThreshold,
  confirmationDisabledCategories,
  onChange,
  onBack,
}: SettingsAlterEgoProps) {
  const { t } = useTranslation('settings');

  function handleThresholdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      onChange('dollarThreshold', value);
    }
  }

  function handleCategoryToggle(category: string) {
    const isCurrentlyDisabled = confirmationDisabledCategories.includes(category);
    if (isCurrentlyDisabled) {
      // Re-enable confirmation for this category (remove from disabled list)
      onChange(
        'confirmationDisabledCategories',
        confirmationDisabledCategories.filter((c) => c !== category),
      );
    } else {
      // Disable confirmation for this category (add to disabled list)
      onChange('confirmationDisabledCategories', [
        ...confirmationDisabledCategories,
        category,
      ]);
    }
  }

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('alter_ego.title')}</h1>
      </div>

      <div className="settings-content">
        {/* Financial threshold */}
        <div className="settings-section-header">{t('alter_ego.section_financial')}</div>

        <div className="settings-row settings-row--static">
          <label
            htmlFor="alter-ego-dollar-threshold"
            className="settings-row__label"
            style={{ flex: 1 }}
          >
            {t('alter_ego.label_dollar_threshold')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#8593A4', fontSize: 14 }}>$</span>
            <input
              id="alter-ego-dollar-threshold"
              type="number"
              min={0}
              step={1}
              value={dollarThreshold}
              onChange={handleThresholdChange}
              style={{
                width: 80,
                background: '#12161b',
                border: '1px solid #2a2e36',
                borderRadius: 4,
                color: '#e8e8e8',
                fontSize: 14,
                padding: '6px 8px',
                fontFamily: 'var(--fm)',
                textAlign: 'right',
              }}
            />
          </div>
        </div>

        <p className="settings-explanation settings-explanation--small" style={{ paddingTop: 8 }}>
          {t('alter_ego.dollar_threshold_explanation')}
        </p>

        {/* Category confirmation toggles */}
        <div className="settings-section-header">{t('alter_ego.section_categories')}</div>

        <p className="settings-explanation" style={{ marginBottom: 12 }}>
          {t('alter_ego.categories_explanation')}
        </p>

        {toggleableCategories.map((category) => {
          const isDisabled = confirmationDisabledCategories.includes(category);
          return (
            <div key={category}>
              <div
                className="settings-row"
                onClick={() => handleCategoryToggle(category)}
              >
                <span className="settings-row__label">
                  {t(`alter_ego.categories.${category}`)}
                </span>
                <Toggle
                  on={isDisabled}
                  onToggle={() => handleCategoryToggle(category)}
                />
              </div>
              {isDisabled && (
                <p
                  className="settings-explanation settings-explanation--small"
                  style={{
                    paddingTop: 4,
                    paddingBottom: 8,
                    color: '#C9A85C',
                  }}
                >
                  {t('alter_ego.warning_no_confirmation')}
                </p>
              )}
            </div>
          );
        })}

        <p className="settings-explanation settings-explanation--small" style={{ paddingTop: 16 }}>
          {t('alter_ego.hardcoded_note')}
        </p>
      </div>
    </div>
  );
}
