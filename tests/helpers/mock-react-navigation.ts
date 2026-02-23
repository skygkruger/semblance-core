// Mock @react-navigation/native-stack for vitest/jsdom environment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NativeStackNavigationProp<T, K = any> = {
  navigate: (screen: string, params?: unknown) => void;
  goBack: () => void;
  setOptions: (opts: unknown) => void;
};
