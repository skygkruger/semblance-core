import type { VectorClock } from './types.js';

export function dominates(clockA: VectorClock, clockB: VectorClock): boolean {
  let strictlyGreater = false;

  const keys = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);
  for (const key of keys) {
    const a = clockA[key] ?? 0;
    const b = clockB[key] ?? 0;
    if (a < b) {
      return false;
    }
    if (a > b) {
      strictlyGreater = true;
    }
  }

  return strictlyGreater;
}

export function areConcurrent(clockA: VectorClock, clockB: VectorClock): boolean {
  return !dominates(clockA, clockB) && !dominates(clockB, clockA);
}

export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: VectorClock = { ...a };
  for (const [deviceId, time] of Object.entries(b)) {
    merged[deviceId] = Math.max(merged[deviceId] ?? 0, time);
  }
  return merged;
}

export function maxVectorClock(clocks: readonly VectorClock[]): VectorClock {
  const merged: VectorClock = {};
  for (const clock of clocks) {
    for (const [deviceId, time] of Object.entries(clock)) {
      merged[deviceId] = Math.max(merged[deviceId] ?? 0, time);
    }
  }
  return merged;
}

export function createConflictGroupId(domainId: string, eventIds: readonly string[]): string {
  const sorted = [...eventIds].sort().join(':');
  return `conflict:${domainId}:${sorted}`;
}

export interface ConflictMarker {
  readonly conflictGroupId: string;
  readonly concurrentEventIds: readonly string[];
  readonly domainId: string;
  readonly detectedAt: string;
}

export function buildConflictMarker(
  domainId: string,
  eventIds: readonly string[],
): ConflictMarker {
  return {
    conflictGroupId: createConflictGroupId(domainId, eventIds),
    concurrentEventIds: [...eventIds].sort(),
    domainId,
    detectedAt: new Date().toISOString(),
  };
}

export function hasCausalDependency(
  event: { readonly causalParentIds: readonly string[] },
  knownEventIds: ReadonlySet<string>,
): boolean {
  if (event.causalParentIds.length === 0) {
    return true;
  }
  return event.causalParentIds.every((parentId) => knownEventIds.has(parentId));
}
