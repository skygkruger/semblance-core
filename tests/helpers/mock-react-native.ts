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

// Type re-export stubs
export type ListRenderItemInfo<T> = { item: T; index: number };
