// Clipboard Action Mapper — Maps recognized patterns to suggested actions.
//
// Each clipboard pattern type has a corresponding action that Semblance can take.
// The user decides whether to execute the action based on their autonomy tier.
//
// CRITICAL: No network imports. Pure mapping logic.

import type { ClipboardPatternType, PatternMatch } from './patterns.js';

export type ClipboardActionType =
  | 'track_package'
  | 'track_flight'
  | 'get_directions'
  | 'lookup_contact'
  | 'summarize_url'
  | 'compose_email'
  | 'create_event'
  | 'track_price'
  | 'save_snippet';

export interface SuggestedClipboardAction {
  actionType: ClipboardActionType;
  description: string;
  pattern: PatternMatch;
}

const ACTION_MAP: Record<ClipboardPatternType, { actionType: ClipboardActionType; description: string }> = {
  tracking_number: { actionType: 'track_package', description: 'Track this package' },
  flight_code: { actionType: 'track_flight', description: 'Track this flight' },
  address: { actionType: 'get_directions', description: 'Get directions to this address' },
  phone_number: { actionType: 'lookup_contact', description: 'Look up this contact' },
  url: { actionType: 'summarize_url', description: 'Summarize this page' },
  email_address: { actionType: 'compose_email', description: 'Compose email to this address' },
  date_time: { actionType: 'create_event', description: 'Create a calendar event' },
  price: { actionType: 'track_price', description: 'Track this price' },
  code_snippet: { actionType: 'save_snippet', description: 'Save this code snippet' },
};

export class ClipboardActionMapper {
  /**
   * Map a recognized pattern to a suggested action.
   */
  mapPatternToAction(pattern: PatternMatch): SuggestedClipboardAction {
    const mapping = ACTION_MAP[pattern.type];
    let description = mapping.description;

    // Add carrier-specific description for tracking numbers
    if (pattern.type === 'tracking_number' && pattern.carrier) {
      const carrierName = pattern.carrier.toUpperCase();
      description = `Track ${carrierName} package`;
    }

    return {
      actionType: mapping.actionType,
      description,
      pattern,
    };
  }
}
