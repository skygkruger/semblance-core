// Mock @react-navigation/native for vitest environment.
// Mobile-only module — not installed in the monorepo root.

export function useNavigation() {
  return {
    navigate: () => {},
    goBack: () => {},
    setOptions: () => {},
    dispatch: () => {},
    reset: () => {},
    isFocused: () => true,
    canGoBack: () => false,
    getParent: () => null,
    getState: () => ({ routes: [], index: 0 }),
  };
}

export function useRoute() {
  return { key: 'mock', name: 'Mock', params: {} };
}

export function useFocusEffect(_effect: unknown) {}
export function useIsFocused() { return true; }

export const NavigationContainer = ({ children }: { children: unknown }) => children;
