// Mock react-native components for vitest/jsdom environment.
// Used via alias in vitest.config.ts.
import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export const View = ({ children, ...props }: React.PropsWithChildren<AnyProps>) =>
  React.createElement('div', props, children);

export const Text = ({ children, ...props }: React.PropsWithChildren<AnyProps>) =>
  React.createElement('span', props, children);

export const TextInput = ({ onChangeText, ...props }: AnyProps) =>
  React.createElement('input', {
    ...props,
    onChange: onChangeText ? (e: { target: { value: string } }) => onChangeText(e.target.value) : undefined,
  });

export const TouchableOpacity = ({ children, onPress, ...props }: React.PropsWithChildren<AnyProps>) =>
  React.createElement('button', { ...props, onClick: onPress }, children);

export const ScrollView = ({ children, contentContainerStyle, ...props }: React.PropsWithChildren<AnyProps>) =>
  React.createElement('div', props, children);

export const RefreshControl = (_props: AnyProps) => null;

export const FlatList = ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, keyExtractor, ...props }: AnyProps) => {
  const header = ListHeaderComponent
    ? typeof ListHeaderComponent === 'function'
      ? React.createElement(ListHeaderComponent)
      : ListHeaderComponent
    : null;
  const items = data?.map((item: unknown, index: number) =>
    React.createElement('div', { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index })),
  ) ?? [];
  const empty = items.length === 0 && ListEmptyComponent
    ? typeof ListEmptyComponent === 'function'
      ? React.createElement(ListEmptyComponent)
      : ListEmptyComponent
    : null;
  return React.createElement('div', props, header, items.length > 0 ? items : empty);
};

export const StyleSheet = {
  create: <T extends Record<string, AnyProps>>(styles: T): T => styles,
};

export const Switch = (_props: AnyProps) => null;

export const Alert = {
  alert: (_title: string, _message?: string, _buttons?: unknown[]) => {},
};

export const Linking = {
  openURL: async (_url: string) => {},
  canOpenURL: async (_url: string) => true,
  addEventListener: () => ({ remove: () => {} }),
};

export const Platform = {
  OS: 'ios' as 'ios' | 'android',
  select: <T>(specifics: { ios?: T; android?: T; default?: T }): T | undefined =>
    specifics.ios ?? specifics.default,
  Version: 17,
};

export const NativeModules = {};

export const Dimensions = {
  get: (_dim: string) => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
};

export const Animated = {
  View,
  Text,
  Value: class {
    constructor(_val: number) {}
    interpolate(_config: unknown) { return this; }
    setValue(_val: number) {}
  },
  timing: (_value: unknown, _config: unknown) => ({ start: (_cb?: () => void) => _cb?.() }),
  spring: (_value: unknown, _config: unknown) => ({ start: (_cb?: () => void) => _cb?.() }),
  parallel: (_anims: unknown[]) => ({ start: (_cb?: () => void) => _cb?.() }),
  sequence: (_anims: unknown[]) => ({ start: (_cb?: () => void) => _cb?.() }),
  event: () => () => {},
};

// Type re-export stubs
export type ListRenderItemInfo<T> = { item: T; index: number };
