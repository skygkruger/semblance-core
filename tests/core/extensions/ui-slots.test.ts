/**
 * UI Slot Registry tests.
 * Verifies registerSlot, getSlot, hasSlot, and priority ordering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSlot,
  getSlot,
  hasSlot,
  getSlotNames,
  clearSlots,
} from '@semblance/core/extensions/ui-slots';

beforeEach(() => {
  clearSlots();
});

describe('UI Slot Registry', () => {
  it('getSlot returns empty array for unregistered slot', () => {
    expect(getSlot('financial-dashboard')).toEqual([]);
    expect(hasSlot('financial-dashboard')).toBe(false);
  });

  it('registerSlot makes component available via getSlot', () => {
    const mockComponent = { component: 'FinancialDashboard' };
    registerSlot('financial-dashboard', mockComponent);

    expect(hasSlot('financial-dashboard')).toBe(true);
    const slots = getSlot('financial-dashboard');
    expect(slots).toHaveLength(1);
    expect(slots[0]!.component).toBe('FinancialDashboard');
  });

  it('multiple registrations for same slot are ordered by priority', () => {
    registerSlot('sidebar', { component: 'Low', priority: 50 });
    registerSlot('sidebar', { component: 'High', priority: 10 });
    registerSlot('sidebar', { component: 'Mid', priority: 30 });

    const slots = getSlot('sidebar');
    expect(slots).toHaveLength(3);
    expect(slots[0]!.component).toBe('High');
    expect(slots[1]!.component).toBe('Mid');
    expect(slots[2]!.component).toBe('Low');
  });

  it('getSlotNames returns all registered slot names', () => {
    registerSlot('slot-a', { component: 'A' });
    registerSlot('slot-b', { component: 'B' });

    const names = getSlotNames();
    expect(names).toContain('slot-a');
    expect(names).toContain('slot-b');
  });
});
