// Skill Bundle Resolver — Converts skill declarations into SubtaskDefinition templates.
//
// When the coordinator decomposes a complex request, it can assign a skill's tool
// bundle as a coherent subtask. This resolver maps SkillDeclaration → SkillBundle
// and generates SubtaskDefinition configs from skill capabilities.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { SkillDeclaration, SkillCapability } from './skill-declaration.js';
import type { SkillBundle, ModelTier, SubtaskDefinition } from '../agent/orchestrator-v2-types.js';

// ─── Capability → Model Tier Mapping ──────────────────────────────────────────

const CAPABILITY_MODEL_TIER: Record<SkillCapability, ModelTier> = {
  knowledge_graph_read: 'fast',
  knowledge_graph_write: 'primary',
  calendar_read: 'fast',
  email_read: 'fast',
  system_execute: 'primary',
  network_fetch: 'primary',
  canvas_push: 'fast',
  notification: 'fast',
};

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Convert a SkillDeclaration into a SkillBundle.
 *
 * The bundle captures the skill's tool set and recommended model tier,
 * ready for the coordinator to use during decomposition.
 */
export function skillToBundle(declaration: SkillDeclaration): SkillBundle {
  // Determine the highest model tier required by any capability
  let highestTier: ModelTier = 'fast';
  const tierOrder: Record<ModelTier, number> = { fast: 0, primary: 1, vision: 2, embedding: 3 };

  for (const cap of declaration.capabilities) {
    const tier = CAPABILITY_MODEL_TIER[cap] ?? 'primary';
    if (tierOrder[tier] > tierOrder[highestTier]) {
      highestTier = tier;
    }
  }

  return {
    skillId: declaration.id,
    name: declaration.name,
    description: declaration.description,
    tools: declaration.tools.map(t => t.name),
    defaultModelTier: highestTier,
    defaultTurnBudget: Math.max(5, declaration.tools.length * 2),
  };
}

/**
 * Generate a SubtaskDefinition from a SkillBundle for a specific user request.
 *
 * This is used by the coordinator when it decides a skill's tool set is the
 * right fit for a subtask during decomposition.
 */
export function bundleToSubtask(
  bundle: SkillBundle,
  subtaskId: string,
  userMessage: string,
  config?: {
    timeoutMs?: number;
    contextBudget?: number;
    maxTokens?: number;
  },
): SubtaskDefinition {
  return {
    id: subtaskId,
    description: `Use skill "${bundle.name}" to handle: ${userMessage}`,
    successCriteria: `Complete the task using ${bundle.name} tools: ${bundle.tools.join(', ')}`,
    allowedTools: bundle.tools,
    modelTier: bundle.defaultModelTier,
    maxTokens: config?.maxTokens ?? 1024,
    timeoutMs: config?.timeoutMs ?? 60_000,
    contextBudget: config?.contextBudget ?? 4096,
    turnBudget: bundle.defaultTurnBudget,
  };
}

/**
 * Given a set of required tool names, find the best matching skill bundle.
 * Returns the bundle with the highest overlap.
 */
export function findMatchingBundle(
  requiredTools: string[],
  bundles: SkillBundle[],
): SkillBundle | null {
  if (bundles.length === 0 || requiredTools.length === 0) return null;

  let bestMatch: SkillBundle | null = null;
  let bestOverlap = 0;

  for (const bundle of bundles) {
    const overlap = requiredTools.filter(t => bundle.tools.includes(t)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = bundle;
    }
  }

  // Only return if at least half the required tools are covered
  return bestOverlap >= Math.ceil(requiredTools.length / 2) ? bestMatch : null;
}
