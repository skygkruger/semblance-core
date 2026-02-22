// Location Reminder Parser Tests — NL parsing for location-based reminders.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import { parseLocationReminder } from '../../../packages/core/location/location-reminder-parser';

describe('parseLocationReminder', () => {
  it('"buy milk near Safeway" is location-based with placeName "Safeway"', () => {
    const result = parseLocationReminder('buy milk near Safeway');
    expect(result.isLocationBased).toBe(true);
    expect(result.placeName).toBe('Safeway');
  });

  it('"at 3pm call Sarah" is NOT location-based', () => {
    const result = parseLocationReminder('at 3pm call Sarah');
    expect(result.isLocationBased).toBe(false);
    expect(result.placeName).toBeUndefined();
  });

  it('"pick up prescription at Walgreens" is location-based with placeName "Walgreens"', () => {
    const result = parseLocationReminder('pick up prescription at Walgreens');
    expect(result.isLocationBased).toBe(true);
    expect(result.placeName).toBe('Walgreens');
  });
});
