// App — Root component for the Semblance mobile app.
//
// Navigation structure:
// - Onboarding flow (first launch only)
// - Main app with 5 bottom tabs: Chat, Brief, Knowledge, Privacy, Settings
//
// Wrapped with SafeAreaProvider + NavigationContainer for React Navigation.

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './theme/tokens.js';
import { OnboardingFlow } from './screens/OnboardingFlow.js';
import { MainTabNavigator } from './navigation/TabNavigator.js';
import { BiometricGate } from './auth/BiometricGate.js';
import { NativeNotificationProvider } from './notifications/native-notification-provider.js';
import { NotificationScheduler } from './notifications/local-notifications.js';
import './i18n/config.js';

// Initialize notification infrastructure on module load
const notificationProvider = new NativeNotificationProvider();
const notificationScheduler = new NotificationScheduler(notificationProvider);

// Export for use by other modules that need to schedule notifications
export { notificationScheduler, notificationProvider };

type RootStackParams = {
  Onboarding: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParams>();

function RootNavigator() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Request notification permission after onboarding completes
  useEffect(() => {
    if (onboardingComplete) {
      notificationProvider.requestPermission().catch(() => {
        // Permission denied — notifications will silently fail
      });
    }
  }, [onboardingComplete]);

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
    notification: '#B07A8A',
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
      <BiometricGate>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </BiometricGate>
    </SafeAreaProvider>
  );
}
