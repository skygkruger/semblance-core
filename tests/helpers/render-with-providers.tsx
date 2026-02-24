import React, { useReducer, type ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { AppState, AppAction } from '@semblance/desktop/state/AppState';
import {
  appReducer,
  initialState,
  AppStateContext,
  AppDispatchContext,
} from '@semblance/desktop/state/AppState';

function TestAppStateProvider({
  children,
  stateOverrides,
}: {
  children: React.ReactNode;
  stateOverrides?: Partial<AppState>;
}) {
  const merged = { ...initialState, ...stateOverrides };
  const [state, dispatch] = useReducer(appReducer, merged);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  stateOverrides?: Partial<AppState>;
}

export function renderWithProviders(
  ui: ReactElement,
  { stateOverrides, ...renderOptions }: ProvidersOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <TestAppStateProvider stateOverrides={stateOverrides}>
        {children}
      </TestAppStateProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export { initialState };
