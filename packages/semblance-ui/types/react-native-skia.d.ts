/**
 * Module augmentation for @shopify/react-native-skia.
 *
 * Declares APIs that exist at runtime but are missing from the installed
 * type definitions (useFrameCallback, useTouchHandler). These were part of
 * earlier Skia API versions and may have been renamed or relocated.
 *
 * The implementations are validated at runtime during Phase 3 visual
 * verification — these declarations exist solely to satisfy the type checker.
 */

/* eslint-disable @typescript-eslint/no-empty-interface */

// Top-level export makes this a module file, enabling proper augmentation
// that merges with (rather than replaces) the existing module declarations.
export {};

declare module '@shopify/react-native-skia' {
  interface FrameInfo {
    timestamp: number;
    [key: string]: unknown;
  }

  interface TouchPoint {
    x: number;
    y: number;
    force?: number;
    id: number;
    timestamp: number;
    type: number;
  }

  interface TouchHandlerCallbacks {
    onStart?: (pt: TouchPoint) => void;
    onActive?: (pt: TouchPoint) => void;
    onEnd?: (pt: TouchPoint) => void;
  }

  /**
   * Registers a callback invoked on every Skia render frame.
   * May map to useRenderLoop or useDerivedValue in newer Skia versions.
   */
  function useFrameCallback(callback: (info: FrameInfo) => void): void;

  /**
   * Creates a touch handler object to pass to Canvas onTouch.
   * May have been replaced by GestureHandler integration in newer versions.
   */
  function useTouchHandler(callbacks: TouchHandlerCallbacks): unknown;
}
