// Haptic Feedback — Mobile haptic patterns for meaningful actions.
// Light: swipe threshold. Medium: action confirmation. Heavy: destructive.
// DESIGN_SYSTEM.md: Motion (and haptics) with purpose, never decorative.

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error';

export interface HapticProvider {
  trigger(type: HapticType): void;
}

/**
 * Map of actions to their haptic feedback type.
 */
const ACTION_HAPTICS: Record<string, HapticType> = {
  // Threshold crossed during swipe
  'swipe.threshold': 'light',

  // Action confirmations
  'email.archived': 'medium',
  'email.sent': 'medium',
  'email.categorized': 'medium',
  'reminder.created': 'medium',
  'reminder.snoozed': 'medium',
  'capture.saved': 'medium',
  'pairing.accepted': 'success',

  // Selection / navigation
  'tab.selected': 'selection',
  'pull.refresh': 'light',

  // Errors and destructive
  'action.failed': 'error',
  'pairing.rejected': 'error',
  'reminder.deleted': 'heavy',
};

/**
 * Get the haptic type for a given action.
 * Returns null if no haptic is configured for the action.
 */
export function getHapticForAction(action: string): HapticType | null {
  return ACTION_HAPTICS[action] ?? null;
}

/**
 * Create a haptic feedback controller that wraps the platform provider.
 * Falls back to a no-op if no provider is available.
 */
export function createHapticController(provider?: HapticProvider): {
  triggerAction: (action: string) => void;
  trigger: (type: HapticType) => void;
} {
  const trigger = (type: HapticType) => {
    provider?.trigger(type);
  };

  return {
    triggerAction: (action: string) => {
      const type = getHapticForAction(action);
      if (type) trigger(type);
    },
    trigger,
  };
}
