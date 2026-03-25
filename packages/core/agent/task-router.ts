// Task Router — Platform-agnostic query complexity assessment and routing decisions.
//
// Determines whether an inference request should run locally, be offloaded to a
// paired desktop device, or run in degraded mode. Pure logic — no platform imports.
//
// The mobile implementation (packages/mobile/src/inference/task-router.ts) wraps
// this core module with platform-specific transport and local bridge wiring.
//
// CRITICAL: This file is in packages/core/. No platform-specific imports.

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Routing decision: where to execute an inference task.
 * - 'local': Execute on the current device.
 * - 'offload': Send to a paired device with more compute.
 * - 'degraded': Paired device expected but unavailable; run locally with reduced quality.
 */
export type TaskRoutingDecision = 'local' | 'offload' | 'degraded';

/**
 * Task types that the router understands.
 * Fast-tier tasks (classify, extract) always run locally.
 * Heavy tasks (reason, draft, vision_rich) are offload candidates.
 */
export type TaskType =
  | 'classify'
  | 'extract'
  | 'generate'
  | 'reason'
  | 'draft'
  | 'vision_fast'
  | 'vision_rich';

/**
 * Complexity assessment for a given task.
 */
export interface TaskComplexity {
  /** Estimated token count for the prompt + expected completion. */
  estimatedTokens: number;
  /** The type of task being performed. */
  taskType: TaskType;
  /** Number of tools that may be invoked (multi-tool chains increase complexity). */
  toolCount: number;
  /** Whether the task involves multi-step reasoning (e.g. tool chains, follow-ups). */
  isMultiStep: boolean;
  /** Whether the task involves large document context. */
  hasLargeContext: boolean;
}

/**
 * Device capability summary for routing decisions.
 */
export interface DeviceCapabilitySummary {
  /** Available RAM in MB. */
  ramMb: number;
  /** Whether a GPU is available for inference. */
  gpuAvailable: boolean;
  /** Maximum context window of the loaded model (tokens). */
  modelContextWindow: number;
  /** Whether the device can run the requested task type at acceptable quality. */
  canHandleTaskType: (taskType: TaskType) => boolean;
}

// ─── Assessment ─────────────────────────────────────────────────────────────

/** Task types that should always run locally (fast, lightweight). */
const ALWAYS_LOCAL_TASKS: ReadonlySet<TaskType> = new Set(['classify', 'extract', 'vision_fast']);

/** Default offload threshold in estimated tokens. */
const DEFAULT_OFFLOAD_THRESHOLD = 2048;

/** Approximate characters per token for estimation. */
const CHARS_PER_TOKEN = 3.5;

/**
 * Assess the complexity of a task based on the message and available tools.
 *
 * @param message - The user's input message.
 * @param taskType - The classified task type.
 * @param tools - Names of tools available for this task.
 * @returns A TaskComplexity assessment.
 */
export function assessTaskComplexity(
  message: string,
  taskType: TaskType,
  tools: string[] = [],
): TaskComplexity {
  const estimatedPromptTokens = Math.ceil(message.length / CHARS_PER_TOKEN);

  // Estimate completion tokens based on task type
  const completionMultiplier = taskType === 'reason' ? 3.0
    : taskType === 'draft' ? 2.5
    : taskType === 'vision_rich' ? 2.0
    : taskType === 'generate' ? 1.5
    : 1.0;

  const estimatedTokens = Math.ceil(estimatedPromptTokens * (1 + completionMultiplier));

  const isMultiStep = tools.length > 2 || taskType === 'reason';
  const hasLargeContext = estimatedPromptTokens > 1500;

  return {
    estimatedTokens,
    taskType,
    toolCount: tools.length,
    isMultiStep,
    hasLargeContext,
  };
}

/**
 * Decide whether to offload a task to a paired device.
 *
 * Decision logic:
 * 1. Always-local task types (classify, extract, vision_fast) → 'local'
 * 2. No tunnel available → 'local' (or 'degraded' if task exceeds local capability)
 * 3. Estimated tokens > threshold AND tunnel available → 'offload'
 * 4. Otherwise → 'local'
 *
 * @param complexity - The assessed task complexity.
 * @param tunnelAvailable - Whether a tunnel to a paired device is currently active.
 * @param localModelCapable - Whether the local model can handle this task adequately.
 * @param offloadThreshold - Token threshold above which offloading is preferred.
 * @returns The routing decision.
 */
export function shouldOffload(
  complexity: TaskComplexity,
  tunnelAvailable: boolean,
  localModelCapable: boolean,
  offloadThreshold: number = DEFAULT_OFFLOAD_THRESHOLD,
): TaskRoutingDecision {
  // Fast-tier tasks always stay local
  if (ALWAYS_LOCAL_TASKS.has(complexity.taskType)) {
    return 'local';
  }

  // If tunnel is available and task is complex enough, offload
  if (tunnelAvailable && complexity.estimatedTokens > offloadThreshold) {
    return 'offload';
  }

  // If tunnel is available and task involves multi-step reasoning with many tools, offload
  if (tunnelAvailable && complexity.isMultiStep && complexity.toolCount > 3) {
    return 'offload';
  }

  // If local model can't handle it and no tunnel, we're degraded
  if (!localModelCapable && !tunnelAvailable) {
    return 'degraded';
  }

  // If local model can't handle it but tunnel is available, offload
  if (!localModelCapable && tunnelAvailable) {
    return 'offload';
  }

  return 'local';
}

/**
 * Estimate the token count for a raw text string.
 * Uses a simple character-based heuristic (3.5 chars per token).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
