import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import type { SplashScreenProps } from './SplashScreen.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function SplashScreen({ onBegin, autoAdvanceMs = 0 }: SplashScreenProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoAdvanceMs > 0 && onBegin) {
      timerRef.current = setTimeout(onBegin, autoAdvanceMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoAdvanceMs, onBegin]);

  return (
    <View style={styles.container}>
      <LogoMark size={96} />

      <Text style={styles.headline}>This is your Semblance.</Text>

      <Text style={styles.subtext}>
        A digital representation that understands your world,
        acts on your behalf, and is architecturally incapable
        of betraying your trust.
      </Text>

      <View style={styles.btnWrap}>
        <Button
          variant="approve"
          size="lg"
          onPress={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            onBegin?.();
          }}
        >
          Begin
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s8,
    paddingHorizontal: nativeSpacing.s5,
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  btnWrap: {
    marginTop: nativeSpacing.s3,
  },
});
