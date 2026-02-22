// Inference Types — Task classification and tier routing for InferenceRouter.
// Maps semantic task types to inference quality tiers, which determine model selection.
// CRITICAL: No network imports. Pure types.

/**
 * Semantic task types that callers declare when requesting inference.
 * The InferenceRouter uses this to select the appropriate model tier.
 */
export type TaskType =
  | 'generate'          // General text generation (conversation, summaries)
  | 'classify'          // Email categorization, sentiment, intent detection
  | 'extract'           // Structured data extraction (receipts, statements)
  | 'embed'             // Embedding generation (knowledge graph)
  | 'reason'            // Multi-step reasoning (complex orchestration)
  | 'draft';            // Draft composition (emails, messages)

/**
 * Inference quality tiers — maps to model size classes.
 *
 * For Step 9, 'fast' and 'primary' point to the same model since we only
 * download one reasoning model per tier. The distinction exists for future
 * multi-model setups.
 */
export type InferenceTier = 'fast' | 'primary' | 'quality' | 'embedding';

/**
 * Map task types to their default inference tier.
 * InferenceRouter uses this for automatic routing.
 */
export const TASK_TIER_MAP: Record<TaskType, InferenceTier> = {
  classify: 'fast',
  extract: 'primary',
  draft: 'primary',
  generate: 'primary',
  reason: 'quality',
  embed: 'embedding',
};

/**
 * Fallback chain: if the preferred tier is unavailable, try these in order.
 * Example: if 'quality' model isn't loaded, fall back to 'primary', then 'fast'.
 */
export const TIER_FALLBACK_CHAIN: Record<InferenceTier, InferenceTier[]> = {
  quality: ['quality', 'primary', 'fast'],
  primary: ['primary', 'fast'],
  fast: ['fast'],
  embedding: ['embedding'], // No fallback — embedding model is required
};

/**
 * Extended request that includes task type for routing.
 * Callers can optionally specify taskType; InferenceRouter uses it for selection.
 */
export interface InferenceRequest {
  taskType: TaskType;
}
