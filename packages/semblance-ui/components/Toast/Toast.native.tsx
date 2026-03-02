import { useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import type { ToastItem, ToastVariant, ToastContainerProps } from './Toast.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

const variantBorders: Record<ToastVariant, string> = {
  info: brandColors.s3,
  success: 'rgba(110,207,163,0.3)',
  attention: 'rgba(201,168,92,0.3)',
  action: 'rgba(110,207,163,0.3)',
};

interface ToastEntryProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastEntry({ toast, onDismiss }: ToastEntryProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const autoDismiss = toast.variant !== 'action';

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 20, duration: 150, useNativeDriver: true }),
    ]).start(() => onDismiss(toast.id));
  }, [onDismiss, toast.id, opacity, translateY]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  useEffect(() => {
    if (!autoDismiss) return;
    const timer = setTimeout(handleDismiss, 5000);
    return () => clearTimeout(timer);
  }, [autoDismiss, handleDismiss]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { borderColor: variantBorders[toast.variant], opacity, transform: [{ translateY }] },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.toastContent}>
        <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
        <Pressable
          onPress={handleDismiss}
          style={styles.dismissButton}
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.dismissText}>X</Text>
        </Pressable>
      </View>
      {toast.action ? <View style={styles.action}>{toast.action}</View> : null}
    </Animated.View>
  );
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 50,
    gap: nativeSpacing.s2,
  },
  toast: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nativeSpacing.s3,
  },
  message: {
    flex: 1,
    fontSize: nativeFontSize.sm,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.text,
  },
  dismissButton: {
    padding: nativeSpacing.s1,
  },
  dismissText: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.silver,
  },
  action: {
    marginTop: nativeSpacing.s3,
  },
});
