// Cold Start Optimizer — Three-phase feature loading for fast mobile startup.
//
// Phase 1 (critical, <1.5s):  UI chrome + biometric auth
// Phase 2 (important):        Daily features (inbox, chat, capture)
// Phase 3 (deferred):         Sovereignty, knowledge graph, adversarial
//
// Features not loaded until their phase runs or first navigation triggers them.
// CRITICAL: No networking imports. No telemetry. Purely local scheduling.

/**
 * Load phase for feature scheduling.
 */
export type LoadPhase = 'critical' | 'important' | 'deferred';

/**
 * Feature classification for cold start phases.
 */
interface FeatureClassification {
  name: string;
  phase: LoadPhase;
}

// ─── Feature → Phase Mapping ────────────────────────────────────────────────

const FEATURE_PHASES: Record<string, LoadPhase> = {
  // Critical — UI + auth, must load first
  'ui-shell': 'critical',
  'biometric-auth': 'critical',
  'navigation': 'critical',
  'theme': 'critical',
  'design-tokens': 'critical',

  // Important — daily-use features
  'inbox': 'important',
  'chat': 'important',
  'capture': 'important',
  'notifications': 'important',
  'daily-digest': 'important',
  'reminders': 'important',
  'settings': 'important',

  // Deferred — specialty features loaded on demand
  'knowledge-graph': 'deferred',
  'sovereignty': 'deferred',
  'living-will': 'deferred',
  'witness': 'deferred',
  'inheritance': 'deferred',
  'adversarial': 'deferred',
  'privacy-dashboard': 'deferred',
  'network': 'deferred',
  'backup': 'deferred',
  'import-digital-life': 'deferred',
  'performance-monitor': 'deferred',
};

// ─── State ──────────────────────────────────────────────────────────────────

let currentPhase: LoadPhase = 'critical';
const loadedFeatures = new Set<string>();

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Classify a feature into its load phase.
 * Unknown features default to 'deferred'.
 */
export function classifyFeature(featureName: string): LoadPhase {
  return FEATURE_PHASES[featureName] ?? 'deferred';
}

/**
 * Get the current active phase.
 */
export function getPhase(): LoadPhase {
  return currentPhase;
}

/**
 * Advance to the next phase.
 */
export function advancePhase(): LoadPhase {
  if (currentPhase === 'critical') currentPhase = 'important';
  else if (currentPhase === 'important') currentPhase = 'deferred';
  return currentPhase;
}

/**
 * Whether a feature should load now based on the current phase.
 * Critical features load in all phases. Important in important+deferred.
 * Deferred only in deferred phase.
 */
export function shouldLoadNow(featureName: string): boolean {
  const featurePhase = classifyFeature(featureName);
  const phaseOrder: LoadPhase[] = ['critical', 'important', 'deferred'];
  const currentIndex = phaseOrder.indexOf(currentPhase);
  const featureIndex = phaseOrder.indexOf(featurePhase);
  return featureIndex <= currentIndex;
}

/**
 * Mark a feature as loaded (for tracking).
 */
export function markLoaded(featureName: string): void {
  loadedFeatures.add(featureName);
}

/**
 * Check if a feature has been loaded.
 */
export function isFeatureLoaded(featureName: string): boolean {
  return loadedFeatures.has(featureName);
}

/**
 * Get all features for a given phase.
 */
export function getFeaturesForPhase(phase: LoadPhase): string[] {
  return Object.entries(FEATURE_PHASES)
    .filter(([, p]) => p === phase)
    .map(([name]) => name);
}

/**
 * Reset optimizer state (for testing).
 */
export function resetOptimizer(): void {
  currentPhase = 'critical';
  loadedFeatures.clear();
}
