// App — Root component for the Semblance mobile app.
//
// Navigation structure:
// - Onboarding flow (first launch only)
// - Main app with bottom tabs: Inbox, Chat, Capture, Settings
//
// On app startup:
// 1. Initialize platform adapter (setPlatform with mobile adapter)
// 2. Check if onboarding is complete
// 3. Show onboarding or main app

import React, { useState } from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { colors } from './theme/tokens.js';
import { OnboardingScreen, type OnboardingStep } from './screens/OnboardingScreen.js';
import { SimpleTabView } from './navigation/TabNavigator.js';
import type { TabParamList } from './navigation/types.js';

export function App(): React.JSX.Element {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('naming');
  const [activeTab, setActiveTab] = useState<keyof TabParamList>('Inbox');

  if (!onboardingComplete) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
        <OnboardingScreen
          step={onboardingStep}
          onNameSubmit={() => setOnboardingStep('hardware')}
          onConsent={() => setOnboardingStep('download-consent')}
          onSkip={() => setOnboardingStep('knowledge-moment')}
          onComplete={() => setOnboardingComplete(true)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <SimpleTabView activeTab={activeTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
});
