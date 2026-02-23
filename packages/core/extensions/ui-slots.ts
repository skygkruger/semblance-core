// UI Slot Registry — Named slots that extensions can fill with components.
// The public app defines rendering slots; extensions (e.g. DR) fill them.
// When a slot is empty, the host app shows nothing or an upgrade prompt.

import type { UISlotComponent } from './types.js';

const slots: Map<string, UISlotComponent[]> = new Map();

/**
 * Register a component for a named UI slot.
 * Multiple registrations for the same slot are ordered by priority (lower = first).
 */
export function registerSlot(name: string, component: UISlotComponent): void {
  const existing = slots.get(name) ?? [];
  existing.push(component);
  existing.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  slots.set(name, existing);
}

/**
 * Get the registered component(s) for a named slot.
 * Returns empty array if no extension has filled the slot.
 */
export function getSlot(name: string): UISlotComponent[] {
  return slots.get(name) ?? [];
}

/**
 * Check whether a named slot has any registered components.
 */
export function hasSlot(name: string): boolean {
  return (slots.get(name)?.length ?? 0) > 0;
}

/**
 * Get all registered slot names.
 */
export function getSlotNames(): string[] {
  return Array.from(slots.keys());
}

/**
 * Clear all slot registrations (for testing).
 */
export function clearSlots(): void {
  slots.clear();
}
