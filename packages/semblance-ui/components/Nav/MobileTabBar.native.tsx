import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { MobileTabBarProps } from './MobileTabBar.types';
import { brandColors, nativeSpacing, nativeFontFamily, opalSurface } from '../../tokens/native';

export function MobileTabBar({
  items,
  activeId,
  onNavigate,
}: MobileTabBarProps) {
  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const isActive = activeId === item.id;
        return (
          <Pressable
            key={item.id}
            style={styles.item}
            onPress={() => onNavigate?.(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
          >
            <View style={isActive ? styles.iconActive : styles.iconInactive}>
              {item.icon}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 56,
    backgroundColor: opalSurface.backgroundColor,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: opalSurface.borderWidth,
    borderColor: opalSurface.borderColor,
    paddingBottom: 0, // Safe area handled by parent
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: nativeSpacing.s1,
    paddingHorizontal: nativeSpacing.s2,
    minHeight: 44,
    minWidth: 44,
  },
  iconInactive: {
    // tintColor handled by icon component
  },
  iconActive: {
    // tintColor handled by icon component
  },
  label: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 10,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: brandColors.sv1,
  },
  labelActive: {
    color: brandColors.veridian,
  },
});
