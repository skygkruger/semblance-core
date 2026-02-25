// Lazy Loader — Deferred feature loading with load-time tracking.
// Registers features with async loaders, loads on first access, tracks timing.
// CRITICAL: No networking imports. No telemetry. Load times stored locally only.

import type { LazyFeatureRegistration } from './types.js';

/**
 * Manages lazy loading of features with performance tracking.
 */
export class LazyLoader {
  private features = new Map<string, LazyFeatureRegistration>();
  private loadPromises = new Map<string, Promise<unknown>>();

  /**
   * Register a feature for lazy loading.
   * The loader function is NOT called until loadFeature() is invoked.
   */
  registerFeature(name: string, loader: () => Promise<unknown>): void {
    if (this.features.has(name)) return;
    this.features.set(name, {
      name,
      loader,
      loaded: false,
      loadTimeMs: null,
    });
  }

  /**
   * Load a feature by name. Returns the loaded module/value.
   * If already loaded, returns immediately. If loading in progress, awaits.
   * Tracks load time in milliseconds.
   */
  async loadFeature(name: string): Promise<unknown> {
    const reg = this.features.get(name);
    if (!reg) {
      throw new Error(`[LazyLoader] Feature not registered: ${name}`);
    }

    // Already loaded — return cached
    if (reg.loaded) {
      return this.loadPromises.get(name);
    }

    // Loading in progress — await existing promise
    const existing = this.loadPromises.get(name);
    if (existing) return existing;

    // Start loading with timing
    const startMs = Date.now();
    const promise = reg.loader().then(result => {
      reg.loaded = true;
      reg.loadTimeMs = Date.now() - startMs;
      return result;
    });

    this.loadPromises.set(name, promise);
    return promise;
  }

  /**
   * Preload multiple features in the background.
   * Does not throw if individual features fail.
   */
  async preloadFeatures(names: string[]): Promise<void> {
    const promises = names.map(name => {
      if (!this.features.has(name)) return Promise.resolve();
      return this.loadFeature(name).catch(() => {
        // Preload failure is non-fatal — feature will retry on next access
      });
    });
    await Promise.all(promises);
  }

  /**
   * Check if a feature has been loaded.
   */
  isLoaded(name: string): boolean {
    return this.features.get(name)?.loaded ?? false;
  }

  /**
   * Get load time for a specific feature (null if not yet loaded).
   */
  getLoadTime(name: string): number | null {
    return this.features.get(name)?.loadTimeMs ?? null;
  }

  /**
   * Get all tracked load times as a record.
   */
  getAllLoadTimes(): Record<string, number> {
    const times: Record<string, number> = {};
    for (const [name, reg] of this.features) {
      if (reg.loadTimeMs !== null) {
        times[name] = reg.loadTimeMs;
      }
    }
    return times;
  }

  /**
   * Get all registered feature names.
   */
  getRegisteredFeatures(): string[] {
    return Array.from(this.features.keys());
  }
}
