import { useState, useCallback } from 'react';
import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import type { IntentCaptureProps } from './IntentCapture.types';
import './Onboarding.css';

type SubStep = 'goal' | 'limit' | 'value';

const SUB_STEPS: SubStep[] = ['goal', 'limit', 'value'];

const CONFIG: Record<SubStep, {
  headline: string;
  subtext: string;
  placeholder: string;
  skippable: boolean;
}> = {
  goal: {
    headline: 'What\u2019s your primary reason for using Semblance?',
    subtext: 'This helps it understand how to prioritize on your behalf.',
    placeholder: 'e.g. Get on top of my work so I have more time for family',
    skippable: false,
  },
  limit: {
    headline: 'Is there anything you\u2019d never want Semblance to do without asking first?',
    subtext: 'You can add more limits anytime in Settings.',
    placeholder: 'e.g. Never send emails on my behalf without showing me first',
    skippable: true,
  },
  value: {
    headline: 'What matters most to you that most people wouldn\u2019t know?',
    subtext: 'Semblance uses this to make better decisions on your behalf.',
    placeholder: "e.g. I always prioritize my kids' schedules over work commitments",
    skippable: true,
  },
};

export function IntentCapture({ onComplete, onSkip }: IntentCaptureProps) {
  const [subStep, setSubStep] = useState<SubStep>('goal');
  const [responses, setResponses] = useState({
    primaryGoal: '',
    hardLimit: '',
    personalValue: '',
  });

  const currentIndex = SUB_STEPS.indexOf(subStep);
  const config = CONFIG[subStep];

  const currentValue = subStep === 'goal'
    ? responses.primaryGoal
    : subStep === 'limit'
      ? responses.hardLimit
      : responses.personalValue;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setResponses(prev => ({
      ...prev,
      ...(subStep === 'goal' ? { primaryGoal: val } :
          subStep === 'limit' ? { hardLimit: val } :
          { personalValue: val }),
    }));
  }, [subStep]);

  const handleContinue = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < SUB_STEPS.length) {
      const next = SUB_STEPS[nextIndex];
      if (next) setSubStep(next);
    } else {
      onComplete(responses);
    }
  }, [currentIndex, responses, onComplete]);

  const handleBack = useCallback(() => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const prev = SUB_STEPS[prevIndex];
      if (prev) setSubStep(prev);
    }
  }, [currentIndex]);

  const handleSkip = useCallback(() => {
    // Skip current sub-step (clear its value)
    setResponses(prev => ({
      ...prev,
      ...(subStep === 'limit' ? { hardLimit: '' } : { personalValue: '' }),
    }));
    const nextIndex = currentIndex + 1;
    if (nextIndex < SUB_STEPS.length) {
      const next = SUB_STEPS[nextIndex];
      if (next) setSubStep(next);
    } else {
      onComplete(responses);
    }
  }, [subStep, currentIndex, responses, onComplete]);

  const handleSkipAll = useCallback(() => {
    onSkip?.();
  }, [onSkip]);

  const hasValue = currentValue.trim().length > 0;
  const isFirstStep = currentIndex === 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 460,
      width: '100%',
      animation: 'dissolve 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      {/* Sub-step indicator */}
      <div style={{ display: 'flex', gap: 8 }}>
        {SUB_STEPS.map((s, i) => (
          <div
            key={s}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: i <= currentIndex ? '#6ECFA3' : '#2A2F35',
              transition: 'background-color 300ms ease',
            }}
          />
        ))}
      </div>

      <h1 className="naming__headline" style={{ fontSize: 'clamp(22px, 4vw, 32px)' }}>
        {config.headline}
      </h1>

      <div className="onboarding-content-frame" style={{ width: '100%' }}>
        <p className="naming__subtext" style={{ maxWidth: 380, margin: 0 }}>
          {config.subtext}
        </p>

        <div style={{ width: '100%' }}>
          <Input
            placeholder={config.placeholder}
            value={currentValue}
            onChange={handleChange}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' && hasValue) handleContinue();
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        {!isFirstStep && (
          <Button variant="ghost" size="md" onClick={handleBack}>
            Back
          </Button>
        )}
        <Button
          variant="opal"
          size="lg"
          disabled={!hasValue && !config.skippable}
          onClick={hasValue ? handleContinue : handleSkip}
        >
          <span className="btn__text">{hasValue ? 'Continue' : 'Skip for now'}</span>
        </Button>
      </div>

      {/* Skip all — only on first step */}
      {isFirstStep && onSkip && (
        <button
          type="button"
          onClick={handleSkipAll}
          style={{
            background: 'none',
            border: 'none',
            color: '#8593A4',
            fontFamily: 'var(--fb)',
            fontSize: 13,
            cursor: 'pointer',
            marginTop: 4,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Skip all intent questions
        </button>
      )}
    </div>
  );
}
