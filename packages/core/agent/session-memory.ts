// Session Memory — Key-value store scoped to orchestrator sessions.
//
// Coordinator writes, subagents read. Entries are tagged with priority
// (critical / normal / ephemeral) for context compaction.
//
// In-memory only — session memory does not persist across app restarts.
// For persistent storage, the coordinator offloads to the knowledge graph.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type {
  SessionMemoryStore,
  SessionMemoryEntry,
  SessionMemoryPriority,
} from './orchestrator-v2-types.js';

export class InMemorySessionMemory implements SessionMemoryStore {
  private entries: Map<string, SessionMemoryEntry> = new Map();

  set(key: string, value: string, priority: SessionMemoryPriority, source: string): void {
    this.entries.set(key, {
      key,
      value,
      priority,
      createdAt: Date.now(),
      source,
    });
  }

  get(key: string): SessionMemoryEntry | null {
    return this.entries.get(key) ?? null;
  }

  getAll(): SessionMemoryEntry[] {
    return Array.from(this.entries.values());
  }

  getByPriority(priority: SessionMemoryPriority): SessionMemoryEntry[] {
    return Array.from(this.entries.values()).filter(e => e.priority === priority);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clearEphemeral(): void {
    for (const [key, entry] of this.entries) {
      if (entry.priority === 'ephemeral') {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  getCompactionSnapshot(): SessionMemoryEntry[] {
    // Return critical entries verbatim, normal entries as-is (caller summarizes),
    // drop ephemeral entries entirely.
    return Array.from(this.entries.values()).filter(
      e => e.priority === 'critical' || e.priority === 'normal',
    );
  }

  /** Number of entries. */
  get size(): number {
    return this.entries.size;
  }
}
