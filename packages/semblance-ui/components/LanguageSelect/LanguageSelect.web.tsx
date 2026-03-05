import { useState, useCallback } from 'react';
import { Wordmark } from '../Wordmark/Wordmark';
import { Button } from '../Button/Button';
import type { LanguageSelectProps } from './LanguageSelect.types';
import { SUPPORTED_LANGUAGES, findLanguage } from '../../../core/i18n/supported-languages';
import '../../pages/Onboarding/Onboarding.css';

const CONTINUE_LABELS: Record<string, string> = {
  en: 'Continue',
  es: 'Continuar',
  de: 'Weiter',
  pt: 'Continuar',
  fr: 'Continuer',
  ja: '続ける',
  'zh-CN': '继续',
  'zh-TW': '繼續',
  ko: '계속',
  it: 'Continua',
};

export function LanguageSelect({ detectedCode, onConfirm }: LanguageSelectProps) {
  const initial = findLanguage(detectedCode);
  const [selected, setSelected] = useState(initial.code);

  const handleConfirm = useCallback(() => {
    onConfirm(selected);
  }, [selected, onConfirm]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 32,
      maxWidth: 420,
      width: '100%',
      animation: 'dissolve 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      <Wordmark size="hero" />

      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-xl)' }}>
        Choose your language
      </h2>

      <div className="onboarding-content-frame onboarding-content-frame__scrollable" style={{
        width: '100%',
        maxHeight: 400,
      }}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = lang.code === selected;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setSelected(lang.code)}
              className={`onboarding-content-frame__item ${isSelected ? 'onboarding-content-frame__item--selected' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '14px 16px',
                textAlign: 'left',
                font: 'inherit',
              }}
            >
              <span style={{
                fontFamily: lang.fontStack ?? 'var(--fb)',
                fontSize: 'var(--text-md)',
                fontWeight: isSelected ? 400 : 300,
                color: isSelected ? '#6ECFA3' : '#8593A4',
                transition: 'color 150ms ease',
              }}>
                {lang.nativeName}
              </span>
            </button>
          );
        })}
      </div>

      <Button variant="approve" size="lg" onClick={handleConfirm}>
        {CONTINUE_LABELS[selected] ?? 'Continue'}
      </Button>
    </div>
  );
}
