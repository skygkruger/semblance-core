import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { MobileTabBarProps } from './MobileTabBar.types';
import { brandColors, nativeSpacing, nativeFontFamily, nativeSurfaces, nativeSurfaceIdentity } from '../../tokens/native';

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
            style={[styles.item, isActive && styles.itemActive]}
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
    ...nativeSurfaces.void,
    borderTopWidth: 1,
    borderColor: nativeSurfaceIdentity.sovereignty.borderColor,
    borderBottomWidth: 0,
    borderRadius: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s3,
    paddingBottom: 0, // Safe area handled by parent
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s3,
    minHeight: 44,
    minWidth: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(152,160,168,0.35)',
    backgroundColor: '#111518',
  },
  itemActive: {
    borderColor: 'rgba(110,207,163,0.35)',
    backgroundColor: 'rgba(110,207,163,0.10)',
  },
  iconInactive: {},
  iconActive: {},
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
