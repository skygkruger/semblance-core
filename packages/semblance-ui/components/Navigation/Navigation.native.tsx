import { View, Pressable, Text, ScrollView, StyleSheet } from 'react-native';
import type { NavigationProps } from './Navigation.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function Navigation({
  items,
  activeId,
  onNavigate,
  collapsed = false,
  footer,
}: NavigationProps) {
  return (
    <View style={[styles.container, collapsed && styles.containerCollapsed]} accessibilityRole="none">
      <ScrollView style={styles.items} contentContainerStyle={styles.itemsContent}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <Pressable
              key={item.id}
              onPress={() => onNavigate(item.id)}
              style={({ pressed }) => [
                styles.item,
                isActive && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={item.label}
            >
              <View style={styles.icon}>{item.icon}</View>
              {!collapsed ? (
                <Text
                  style={[styles.label, isActive && styles.labelActive]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: brandColors.s1,
    borderRightWidth: 1,
    borderRightColor: brandColors.s3,
  },
  containerCollapsed: {
    width: 64,
  },
  items: {
    flex: 1,
  },
  itemsContent: {
    paddingVertical: nativeSpacing.s4,
    paddingHorizontal: nativeSpacing.s2,
    gap: nativeSpacing.s1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2 + 2,
    borderRadius: nativeRadius.md,
    minHeight: 44,
  },
  itemActive: {
    backgroundColor: 'rgba(110,207,163,0.1)',
  },
  itemPressed: {
    opacity: 0.7,
  },
  icon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: nativeFontSize.sm,
    fontFamily: nativeFontFamily.uiMedium,
    color: brandColors.silver,
    flex: 1,
  },
  labelActive: {
    color: brandColors.veridian,
  },
  footer: {
    paddingHorizontal: nativeSpacing.s2,
    paddingBottom: nativeSpacing.s4,
  },
});
