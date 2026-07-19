import { randomUUID } from 'node:crypto';
import {
  areConcurrent,
  buildConflictMarker,
  createConflictGroupId,
  dominates,
  hasCausalDependency,
  mergeVectorClocks,
} from './conflict.js';
import type {
  ConflictRecord,
  MergeResult,
  MergedVaultEvent,
  RebuildIndexesCallback,
  VaultEventPlaintext,
  VectorClock,
} from './types.js';

export interface MergeableEvent {
  readonly eventId: string;
  readonly domainId: string;
  readonly deviceId: string;
  readonly membershipEpoch: number;
  readonly lamportClock: number;
  readonly vectorClock: VectorClock;
  readonly causalParentIds: readonly string[];
  readonly plaintext: VaultEventPlaintext;
}

export interface CausalMergeOptions {
  readonly localEvents: readonly MergeableEvent[];
  readonly incomingEvents: readonly MergeableEvent[];
  readonly onRebuildIndexes?: RebuildIndexesCallback;
}

function sortByCausalOrder(events: readonly MergeableEvent[]): MergeableEvent[] {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const visited = new Set<string>();
  const ordered: MergeableEvent[] = [];

  function visit(eventId: string): void {
    if (visited.has(eventId)) {
      return;
    }
    const event = byId.get(eventId);
    if (!event) {
      return;
    }
    for (const parentId of event.causalParentIds) {
      visit(parentId);
    }
    visited.add(eventId);
    ordered.push(event);
  }

  const sortedByLamport = [...events].sort((a, b) => {
    if (a.lamportClock !== b.lamportClock) {
      return a.lamportClock - b.lamportClock;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  for (const event of sortedByLamport) {
    visit(event.eventId);
  }

  return ordered;
}

function toMergedEvent(
  event: MergeableEvent,
  conflictGroupId: string | null,
  isConflictDuplicate: boolean,
): MergedVaultEvent {
  return {
    eventId: event.eventId,
    domainId: event.domainId,
    deviceId: event.deviceId,
    membershipEpoch: event.membershipEpoch,
    lamportClock: event.lamportClock,
    vectorClock: { ...event.vectorClock },
    causalParentIds: [...event.causalParentIds],
    plaintext: event.plaintext,
    conflictGroupId,
    isConflictDuplicate,
  };
}

export function mergeVaultEvents(options: CausalMergeOptions): MergeResult {
  const localById = new Map(options.localEvents.map((event) => [event.eventId, event]));
  const incoming = sortByCausalOrder(options.incomingEvents);
  const knownEventIds = new Set(localById.keys());
  const merged: MergedVaultEvent[] = options.localEvents.map((event) =>
    toMergedEvent(event, null, false),
  );
  const conflicts: ConflictRecord[] = [];
  const appliedEventIds: string[] = [];
  const skippedEventIds: string[] = [];

  for (const incomingEvent of incoming) {
    if (localById.has(incomingEvent.eventId)) {
      skippedEventIds.push(incomingEvent.eventId);
      continue;
    }

    if (!hasCausalDependency(incomingEvent, knownEventIds)) {
      skippedEventIds.push(incomingEvent.eventId);
      continue;
    }

    const sameDomainEvents = merged.filter((event) => event.domainId === incomingEvent.domainId);
    let conflictGroupId: string | null = null;
    let isConflictDuplicate = false;

    for (const existing of sameDomainEvents) {
      if (dominates(existing.vectorClock, incomingEvent.vectorClock)) {
        skippedEventIds.push(incomingEvent.eventId);
        conflictGroupId = null;
        break;
      }

      if (areConcurrent(existing.vectorClock, incomingEvent.vectorClock)) {
        const marker = buildConflictMarker(incomingEvent.domainId, [
          existing.eventId,
          incomingEvent.eventId,
        ]);
        conflictGroupId = marker.conflictGroupId;
        isConflictDuplicate = true;

        const existingIndex = merged.findIndex((event) => event.eventId === existing.eventId);
        if (existingIndex >= 0 && merged[existingIndex]!.conflictGroupId === null) {
          merged[existingIndex] = {
            ...merged[existingIndex]!,
            conflictGroupId: marker.conflictGroupId,
            isConflictDuplicate: true,
          };
        }

        const conflictExists = conflicts.some(
          (record) => record.conflictGroupId === marker.conflictGroupId,
        );
        if (!conflictExists) {
          conflicts.push({
            conflictGroupId: marker.conflictGroupId,
            eventIds: [...marker.concurrentEventIds],
            domainId: incomingEvent.domainId,
            reason: 'Concurrent corrections preserved with conflict marker',
          });
        }
      }
    }

    if (skippedEventIds.includes(incomingEvent.eventId)) {
      continue;
    }

    merged.push(toMergedEvent(incomingEvent, conflictGroupId, isConflictDuplicate));
    localById.set(incomingEvent.eventId, incomingEvent);
    knownEventIds.add(incomingEvent.eventId);
    appliedEventIds.push(incomingEvent.eventId);
  }

  merged.sort((a, b) => {
    if (a.lamportClock !== b.lamportClock) {
      return a.lamportClock - b.lamportClock;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  if (options.onRebuildIndexes) {
    void options.onRebuildIndexes(merged);
  }

  return {
    merged,
    conflicts,
    appliedEventIds,
    skippedEventIds,
  };
}

export function advanceMergeState(
  currentVectorClock: VectorClock,
  currentLamport: number,
  appliedEvents: readonly MergeableEvent[],
): { vectorClock: VectorClock; lamportClock: number } {
  let vectorClock = { ...currentVectorClock };
  let lamportClock = currentLamport;

  for (const event of appliedEvents) {
    vectorClock = mergeVectorClocks(vectorClock, event.vectorClock);
    lamportClock = Math.max(lamportClock, event.lamportClock);
  }

  return { vectorClock, lamportClock };
}

export function createConflictGroupIdForTest(domainId: string, eventIds: string[]): string {
  return createConflictGroupId(domainId, eventIds);
}

export function newMergeEventId(): string {
  return `evt-${randomUUID()}`;
}
