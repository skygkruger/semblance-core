// Memory Manager — Responds to OS memory pressure by releasing non-essential caches.
// Tracks per-feature allocations and enforces caps.
// CRITICAL: No networking imports. No telemetry. Entirely local memory management.

/**
 * Callback registered by features for cache release on memory pressure.
 */
export type CacheReleaseCallback = () => void;

/**
 * Memory allocation record for a feature.
 */
interface FeatureAllocation {
  name: string;
  estimatedBytes: number;
  releaseCallback: CacheReleaseCallback | null;
  essential: boolean;
}

// ─── State ──────────────────────────────────────────────────────────────────

const allocations = new Map<string, FeatureAllocation>();

/** Default per-feature cap: 50MB */
const DEFAULT_FEATURE_CAP_BYTES = 50 * 1024 * 1024;

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Register a feature's memory allocation with optional release callback.
 * Essential features are NOT released on memory warning.
 */
export function registerAllocation(
  featureName: string,
  estimatedBytes: number,
  releaseCallback: CacheReleaseCallback | null,
  essential: boolean = false,
): void {
  allocations.set(featureName, {
    name: featureName,
    estimatedBytes,
    releaseCallback,
    essential,
  });
}

/**
 * Update a feature's estimated memory usage.
 */
export function updateAllocation(featureName: string, estimatedBytes: number): void {
  const existing = allocations.get(featureName);
  if (existing) {
    existing.estimatedBytes = estimatedBytes;
  }
}

/**
 * Unregister a feature's allocation.
 */
export function unregisterAllocation(featureName: string): void {
  allocations.delete(featureName);
}

/**
 * Handle OS memory warning by releasing non-essential caches.
 * Returns list of features whose caches were released.
 */
export function onMemoryWarning(): string[] {
  const released: string[] = [];

  for (const [name, alloc] of allocations) {
    if (!alloc.essential && alloc.releaseCallback) {
      alloc.releaseCallback();
      alloc.estimatedBytes = 0;
      released.push(name);
    }
  }

  return released;
}

/**
 * Check if a feature exceeds its memory cap.
 */
export function isOverCap(
  featureName: string,
  capBytes: number = DEFAULT_FEATURE_CAP_BYTES,
): boolean {
  const alloc = allocations.get(featureName);
  if (!alloc) return false;
  return alloc.estimatedBytes > capBytes;
}

/**
 * Get total estimated memory across all features.
 */
export function getTotalAllocated(): number {
  let total = 0;
  for (const alloc of allocations.values()) {
    total += alloc.estimatedBytes;
  }
  return total;
}

/**
 * Get per-feature allocation breakdown.
 */
export function getAllocations(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [name, alloc] of allocations) {
    result[name] = alloc.estimatedBytes;
  }
  return result;
}

/**
 * Reset all allocations (for testing).
 */
export function resetAllocations(): void {
  allocations.clear();
}
