// Swipe Actions — Gesture handlers for mobile inbox.
// Swipe-right: archive. Swipe-left: categorize/action.
// Uses react-native-gesture-handler + react-native-reanimated concepts.
// DESIGN_SYSTEM.md: Motion is purposeful, never decorative.

export type SwipeDirection = 'left' | 'right';

export interface SwipeAction {
  direction: SwipeDirection;
  label: string;
  color: string;
  icon: string;
  onTrigger: () => void;
}

export interface SwipeConfig {
  /** Minimum distance in points to trigger the action */
  threshold: number;
  /** Whether to enable the swipe */
  enabled: boolean;
}

export interface SwipeState {
  /** Current swipe offset in points */
  translateX: number;
  /** Whether the threshold has been crossed */
  triggered: boolean;
  /** Currently active direction */
  direction: SwipeDirection | null;
}

/** Default swipe config */
export const DEFAULT_SWIPE_CONFIG: SwipeConfig = {
  threshold: 80,
  enabled: true,
};

/**
 * Calculate swipe state from a horizontal gesture offset.
 */
export function calculateSwipeState(
  translationX: number,
  config: SwipeConfig = DEFAULT_SWIPE_CONFIG,
): SwipeState {
  if (!config.enabled) {
    return { translateX: 0, triggered: false, direction: null };
  }

  const direction: SwipeDirection | null =
    translationX > 10 ? 'right' :
    translationX < -10 ? 'left' :
    null;

  const triggered = Math.abs(translationX) >= config.threshold;

  return {
    translateX: translationX,
    triggered,
    direction,
  };
}

/**
 * Get the swipe action for the current state.
 */
export function getActiveSwipeAction(
  state: SwipeState,
  rightAction: SwipeAction,
  leftAction: SwipeAction,
): SwipeAction | null {
  if (!state.triggered || !state.direction) return null;
  return state.direction === 'right' ? rightAction : leftAction;
}

/**
 * Standard inbox swipe actions.
 */
export function createInboxSwipeActions(
  onArchive: () => void,
  onCategorize: () => void,
): { right: SwipeAction; left: SwipeAction } {
  return {
    right: {
      direction: 'right',
      label: 'Archive',
      color: '#4A7FBA', // primary from tokens
      icon: 'archive',
      onTrigger: onArchive,
    },
    left: {
      direction: 'left',
      label: 'Categorize',
      color: '#E8A838', // accent from tokens
      icon: 'tag',
      onTrigger: onCategorize,
    },
  };
}

/**
 * Calculate swipe progress as 0–1 for animation interpolation.
 */
export function swipeProgress(translateX: number, threshold: number): number {
  return Math.min(1, Math.abs(translateX) / threshold);
}
