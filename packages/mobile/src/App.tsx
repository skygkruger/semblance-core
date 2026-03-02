// App — Root component for the Semblance mobile app.
//
// Navigation structure:
// - Onboarding flow (first launch only)
// - Main app with 5 bottom tabs: Chat, Brief, Knowledge, Privacy, Settings
//
// Wrapped with SafeAreaProvider + NavigationContainer for React Navigation.

import React, { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './theme/tokens.js';
import { OnboardingFlow } from './screens/OnboardingFlow.js';
import { MainTabNavigator } from './navigation/TabNavigator.js';
import './i18n/config.js';

type RootStackParams = {
  Onboarding: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParams>();

function RootNavigator() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  if (!onboardingComplete) {
    return <OnboardingFlow onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={MainTabNavigator} />
    </RootStack.Navigator>
  );
}

const navTheme = {
  dark: true,
  colors: {
    primary: '#6ECFA3',
    background: colors.bgDark,
    card: colors.surface1Dark,
    text: colors.textPrimaryDark,
    border: colors.borderDark,
    notification: '#C97B6E',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '900' as const },
  },
};

export function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
