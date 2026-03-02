import { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Button } from '../../components/Button/Button';
import type { IntentCaptureProps } from './IntentCapture.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

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

  const handleChange = useCallback((val: string) => {
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

  const hasValue = currentValue.trim().length > 0;
  const isFirstStep = currentIndex === 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Sub-step indicator */}
        <View style={styles.dots}>
          {SUB_STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.dot,
                { backgroundColor: i <= currentIndex ? brandColors.veridian : brandColors.b2 },
              ]}
            />
          ))}
        </View>

        <Text style={styles.headline}>{config.headline}</Text>
        <Text style={styles.subtext}>{config.subtext}</Text>

        <TextInput
          style={styles.input}
          placeholder={config.placeholder}
          placeholderTextColor={brandColors.sv1}
          value={currentValue}
          onChangeText={handleChange}
          autoCapitalize="sentences"
          autoCorrect={false}
        />

        <View style={styles.buttonRow}>
          {!isFirstStep && (
            <Button variant="ghost" size="md" onPress={handleBack}>
              Back
            </Button>
          )}
          <Button
            variant="approve"
            size="lg"
            disabled={!hasValue && !config.skippable}
            onPress={hasValue ? handleContinue : handleSkip}
          >
            {hasValue ? 'Continue' : 'Skip for now'}
          </Button>
        </View>

        {isFirstStep && onSkip && (
          <Pressable onPress={onSkip}>
            <Text style={styles.skipAll}>Skip all intent questions</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s6,
    paddingHorizontal: nativeSpacing.s5,
    maxWidth: 460,
    alignSelf: 'center',
    width: '100%',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 380,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s4,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    backgroundColor: brandColors.s1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: nativeSpacing.s2,
  },
  skipAll: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textDecorationLine: 'underline',
    marginTop: nativeSpacing.s1,
  },
});
