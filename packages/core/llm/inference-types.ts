// Inference Types — Task classification and tier routing for InferenceRouter.
// Maps semantic task types to inference quality tiers, which determine model selection.
// CRITICAL: No network imports. Pure types.

/**
 * Semantic task types that callers declare when requesting inference.
 * The InferenceRouter uses this to select the appropriate model tier.
 */
export type TaskType =
  | 'generate'          // General text generation (conversation, summaries)
  | 'classify'          // Email categorization, sentiment, intent detection → SmolLM2 (fast)
  | 'extract'           // Structured data extraction (receipts, statements) → SmolLM2 (fast)
  | 'embed'             // Embedding generation (knowledge graph)
  | 'reason'            // Multi-step reasoning (complex orchestration)
  | 'draft'             // Draft composition (emails, messages)
  | 'vision_fast'       // Quick visual queries, screen reading → Moondream2
  | 'vision_rich';      // Document OCR, rich visual analysis → Qwen2.5-VL

/**
 * Inference quality tiers — maps to model size classes.
 *
 * - fast: SmolLM2 1.7B — always resident, handles classify/extract tasks
 * - primary: Qwen3 series — session resident, handles generate/reason/draft
 * - quality: same as primary (reserved for future larger models)
 * - vision: Moondream2 or Qwen2.5-VL — on-demand vision-language tasks
 * - embedding: nomic-embed-text — always resident
 */
export type InferenceTier = 'fast' | 'primary' | 'quality' | 'vision' | 'embedding';

/**
 * Map task types to their default inference tier.
 * InferenceRouter uses this for automatic routing.
 */
export const TASK_TIER_MAP: Record<TaskType, InferenceTier> = {
  classify: 'fast',
  extract: 'fast',
  draft: 'primary',
  generate: 'primary',
  reason: 'quality',
  embed: 'embedding',
  vision_fast: 'vision',
  vision_rich: 'vision',
};

/**
 * Fallback chain: if the preferred tier is unavailable, try these in order.
 * Example: if 'quality' model isn't loaded, fall back to 'primary', then 'fast'.
 */
export const TIER_FALLBACK_CHAIN: Record<InferenceTier, InferenceTier[]> = {
  quality: ['quality', 'primary', 'fast'],
  primary: ['primary', 'fast'],
  fast: ['fast', 'primary'],
  vision: ['vision'], // No fallback — vision models are required for vision tasks
  embedding: ['embedding'], // No fallback — embedding model is required
};

/**
 * Extended request that includes task type for routing.
 * Callers can optionally specify taskType; InferenceRouter uses it for selection.
 */
export interface InferenceRequest {
  taskType: TaskType;
}
