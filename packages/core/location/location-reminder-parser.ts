// Location Reminder Parser — Extract location-based intent from natural language.
//
// Pure function. No side effects. No network.
// Identifies phrases like "near Safeway", "at Walgreens", "when I'm at Home Depot".
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

export interface LocationReminderParseResult {
  isLocationBased: boolean;
  placeName?: string;
  remainingText: string;
}

/**
 * Patterns that indicate a location-based reminder.
 * Captures the place name after the location keyword.
 */
const LOCATION_PATTERNS = [
  /\bwhen\s+(?:I'm|I\s+am|i'm|im)\s+(?:at|near)\s+(.+?)(?:\s+(?:remind|tell|let)\b|$)/i,
  /\bnext\s+time\s+(?:I'm|I\s+am|i'm|im)\s+(?:at|near)\s+(.+?)(?:\s+(?:remind|tell|let)\b|$)/i,
  /\bnear\s+([A-Z][\w\s']+?)(?:\s*[,.]|\s+(?:remind|buy|get|pick|grab|drop)\b)/i,
  /\bat\s+([A-Z][\w\s']+?)(?:\s*[,.]|\s+(?:remind|buy|get|pick|grab|drop)\b)/i,
  /\b(?:buy|get|pick\s+up|grab|drop\s+off)\s+.+?\s+(?:at|near)\s+([A-Z][\w\s']+)/i,
  /\b(?:at|near)\s+([A-Z][\w\s']+?)$/i,
];

/**
 * Parse natural language text to determine if it contains a location-based reminder.
 * Returns the place name and the remaining text (action part).
 */
export function parseLocationReminder(text: string): LocationReminderParseResult {
  const trimmed = text.trim();

  for (const pattern of LOCATION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const placeName = match[1].trim();
      // Remove the location part from the text to get the action
      const remainingText = trimmed
        .replace(pattern, '')
        .replace(/\s+/g, ' ')
        .trim() || trimmed;

      return {
        isLocationBased: true,
        placeName,
        remainingText,
      };
    }
  }

  return {
    isLocationBased: false,
    remainingText: trimmed,
  };
}
