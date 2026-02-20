// Rate Limiter — Sliding window counter for per-action and global limits.
// Prevents runaway agents from spamming external services.

import type { ActionType } from '@semblance/core';

interface WindowEntry {
  timestamps: number[];
}

const DEFAULT_ACTION_LIMITS: Partial<Record<ActionType, number>> = {
  'email.send': 20,
  'email.fetch': 60,
  'calendar.create': 30,
  'service.api_call': 100,
};

const DEFAULT_PER_ACTION_LIMIT = 60;
const DEFAULT_GLOBAL_LIMIT = 500;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface RateLimiterConfig {
  actionLimits?: Partial<Record<ActionType, number>>;
  defaultActionLimit?: number;
  globalLimit?: number;
  windowMs?: number;
}

export class RateLimiter {
  private actionWindows: Map<string, WindowEntry> = new Map();
  private globalWindow: WindowEntry = { timestamps: [] };
  private actionLimits: Partial<Record<ActionType, number>>;
  private defaultActionLimit: number;
  private globalLimit: number;
  private windowMs: number;

  constructor(config?: RateLimiterConfig) {
    this.actionLimits = config?.actionLimits ?? DEFAULT_ACTION_LIMITS;
    this.defaultActionLimit = config?.defaultActionLimit ?? DEFAULT_PER_ACTION_LIMIT;
    this.globalLimit = config?.globalLimit ?? DEFAULT_GLOBAL_LIMIT;
    this.windowMs = config?.windowMs ?? WINDOW_MS;
  }

  /**
   * Check if a request is within rate limits.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  check(action: ActionType): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();

    // Check global limit first
    this.pruneWindow(this.globalWindow, now);
    if (this.globalWindow.timestamps.length >= this.globalLimit) {
      const retryAfterMs = this.getRetryAfter(this.globalWindow, now);
      return { allowed: false, retryAfterMs };
    }

    // Check per-action limit
    const actionKey = action;
    let actionWindow = this.actionWindows.get(actionKey);
    if (!actionWindow) {
      actionWindow = { timestamps: [] };
      this.actionWindows.set(actionKey, actionWindow);
    }
    this.pruneWindow(actionWindow, now);

    const limit = this.actionLimits[action] ?? this.defaultActionLimit;
    if (actionWindow.timestamps.length >= limit) {
      const retryAfterMs = this.getRetryAfter(actionWindow, now);
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  /**
   * Record a request. Call this after check() returns allowed: true.
   */
  record(action: ActionType): void {
    const now = Date.now();

    this.globalWindow.timestamps.push(now);

    const actionKey = action;
    let actionWindow = this.actionWindows.get(actionKey);
    if (!actionWindow) {
      actionWindow = { timestamps: [] };
      this.actionWindows.set(actionKey, actionWindow);
    }
    actionWindow.timestamps.push(now);
  }

  /**
   * Get current counts for monitoring.
   */
  getCounts(): { global: number; byAction: Record<string, number> } {
    const now = Date.now();
    this.pruneWindow(this.globalWindow, now);

    const byAction: Record<string, number> = {};
    for (const [key, window] of this.actionWindows) {
      this.pruneWindow(window, now);
      byAction[key] = window.timestamps.length;
    }

    return { global: this.globalWindow.timestamps.length, byAction };
  }

  /**
   * Reset all counters. Used for testing.
   */
  reset(): void {
    this.actionWindows.clear();
    this.globalWindow = { timestamps: [] };
  }

  private pruneWindow(window: WindowEntry, now: number): void {
    const cutoff = now - this.windowMs;
    window.timestamps = window.timestamps.filter(t => t > cutoff);
  }

  private getRetryAfter(window: WindowEntry, now: number): number {
    if (window.timestamps.length === 0) return 0;
    const oldest = window.timestamps[0]!;
    return Math.max(0, oldest + this.windowMs - now);
  }
}
