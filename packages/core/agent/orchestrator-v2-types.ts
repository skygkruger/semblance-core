// Orchestrator v2 Types — Multi-agent coordination, subagent spawning,
// complexity classification, session memory, tool hooks, and streaming events.
//
// Phase 1 only — no Cloud Bridge types. Cloud Bridge ships in Phase 3.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { AutonomyTier, AutonomyDomain } from './types.js';
import type { ToolDefinition } from '../llm/types.js';
import type { ActionType } from '../types/ipc.js';

// ─── Complexity Classification ────────────────────────────────────────────────

export type RequestComplexity = 'simple' | 'compound' | 'complex';

export interface ComplexityAssessment {
  complexity: RequestComplexity;
  domains: AutonomyDomain[];
  estimatedTools: string[];
  reasoning: string;
  /** Whether subtasks can run in parallel (only meaningful for 'complex') */
  parallelCapable: boolean;
}

// ─── Model Tiers ──────────────────────────────────────────────────────────────

/** Model tier for subagent assignment. 'cloud_bridge' reserved for Phase 3. */
export type ModelTier = 'fast' | 'primary' | 'vision' | 'embedding' | 'cloud_bridge';

// ─── Subtask Definition ───────────────────────────────────────────────────────

export interface SubtaskDefinition {
  id: string;
  description: string;
  successCriteria: string;
  allowedTools: string[];
  modelTier: ModelTier;
  /** Max tokens the subagent may generate */
  maxTokens: number;
  /** Max execution time in ms */
  timeoutMs: number;
  /** Max tokens of context to provide to the subagent */
  contextBudget: number;
  /** Max ReAct turns before forced completion */
  turnBudget: number;
  /** Permission overrides: tool name → auto/approve/deny */
  permissionOverrides?: Record<string, 'auto' | 'approve' | 'deny'>;
  /** PreToolUse hook IDs to apply */
  preToolHooks?: string[];
  /** PostToolUse hook IDs to apply */
  postToolHooks?: string[];
  /** Parent subagent ID for nested chains */
  parentSubagentId?: string;
  /** Dependencies — subtask IDs that must complete before this one starts */
  dependsOn?: string[];
}

// ─── Subagent Result ──────────────────────────────────────────────────────────

export interface SubagentResult {
  subagentId: string;
  subtaskId: string;
  status: 'completed' | 'partial' | 'failed' | 'escalated' | 'timed_out';
  output: string;
  structuredOutput?: Record<string, unknown>;
  toolCallsExecuted: number;
  tokensConsumed: number;
  executionTimeMs: number;
  modelUsed: string;
  escalationRequest?: {
    reason: string;
    requiredTool: string;
    requiredPermission: string;
  };
}

// ─── Streaming Events ─────────────────────────────────────────────────────────

export type SubagentStreamEventType =
  | 'subagent_started'
  | 'subagent_progress'
  | 'subagent_tool_call'
  | 'subagent_tool_result'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'synthesis_started'
  | 'synthesis_progress'
  | 'synthesis_completed';

export interface SubagentStreamEvent {
  type: SubagentStreamEventType;
  subagentId: string;
  subtaskId: string;
  timestamp: number;
  data: {
    text?: string;
    toolName?: string;
    toolStatus?: string;
    progress?: number;
    tokensConsumed?: number;
  };
}

// ─── Tool Hooks ───────────────────────────────────────────────────────────────

export type PreToolUseAction =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'mutate'; params: Record<string, unknown> }
  | { action: 'redirect'; targetTool: string; params?: Record<string, unknown> };

export type PostToolUseAction =
  | { action: 'pass' }
  | { action: 'filter'; filteredResult: unknown }
  | { action: 'inject'; appendedContext: string }
  | { action: 'abort'; reason: string };

export interface PreToolUseHook {
  id: string;
  description: string;
  /** Which tools this hook applies to (empty = all tools) */
  appliesTo: string[];
  execute(context: ToolHookContext): Promise<PreToolUseAction>;
}

export interface PostToolUseHook {
  id: string;
  description: string;
  appliesTo: string[];
  execute(context: ToolHookContext, result: unknown): Promise<PostToolUseAction>;
}

export interface ToolHookContext {
  toolName: string;
  toolParams: Record<string, unknown>;
  subagentId: string | null;
  subtaskId: string | null;
  sessionId: string;
  domain: AutonomyDomain | null;
  autonomyTier: AutonomyTier;
}

// ─── Tool Hook Registry ───────────────────────────────────────────────────────

export interface ToolHookRegistry {
  registerPreHook(hook: PreToolUseHook): void;
  registerPostHook(hook: PostToolUseHook): void;
  removePreHook(id: string): void;
  removePostHook(id: string): void;
  getPreHooks(toolName: string): PreToolUseHook[];
  getPostHooks(toolName: string): PostToolUseHook[];
}

// ─── Session Memory ───────────────────────────────────────────────────────────

export type SessionMemoryPriority = 'critical' | 'normal' | 'ephemeral';

export interface SessionMemoryEntry {
  key: string;
  value: string;
  priority: SessionMemoryPriority;
  createdAt: number;
  source: string;  // 'coordinator' | subagentId
}

export interface SessionMemoryStore {
  /** Write an entry (coordinator only) */
  set(key: string, value: string, priority: SessionMemoryPriority, source: string): void;
  /** Read an entry (coordinator and subagents) */
  get(key: string): SessionMemoryEntry | null;
  /** Read all entries */
  getAll(): SessionMemoryEntry[];
  /** Read entries by priority */
  getByPriority(priority: SessionMemoryPriority): SessionMemoryEntry[];
  /** Delete an entry */
  delete(key: string): void;
  /** Clear ephemeral entries */
  clearEphemeral(): void;
  /** Clear all entries */
  clear(): void;
  /** Get a compaction-safe snapshot: critical entries verbatim, normal summarized */
  getCompactionSnapshot(): SessionMemoryEntry[];
}

// ─── Context Compaction ───────────────────────────────────────────────────────

export interface CompactionResult {
  /** The compressed summary that replaces the detailed history */
  summary: string;
  /** Number of messages compacted */
  messagesCompacted: number;
  /** Entries offloaded to knowledge graph */
  offloadedEntries: number;
  /** Token count before compaction */
  tokensBefore: number;
  /** Token count after compaction */
  tokensAfter: number;
}

// ─── Hierarchical Permissions ─────────────────────────────────────────────────

export interface SubagentPermissionScope {
  /** Tools the subagent is allowed to use */
  allowedTools: string[];
  /** Per-tool permission overrides (intersected with user's autonomy tier) */
  toolPermissions: Record<string, 'auto' | 'approve' | 'deny'>;
  /** The effective autonomy tier for this subagent's domain */
  effectiveTier: AutonomyTier;
}

export interface PermissionResolution {
  decision: 'auto_approve' | 'requires_approval' | 'denied';
  reason: string;
  /** The tier that produced this decision */
  decidingTier: AutonomyTier;
  /** Whether a subagent permission scope further restricted this */
  subagentRestricted: boolean;
}

// ─── Parallel Execution ───────────────────────────────────────────────────────

export type ExecutionMode = 'parallel' | 'interleaved' | 'sequential';

export interface ExecutionPlan {
  mode: ExecutionMode;
  /** Subtasks grouped by execution wave (wave 0 runs first, wave 1 after, etc.) */
  waves: SubtaskDefinition[][];
  /** Estimated total execution time in ms */
  estimatedDurationMs: number;
}

// ─── Decomposition Result ─────────────────────────────────────────────────────

export interface DecompositionResult {
  subtasks: SubtaskDefinition[];
  executionPlan: ExecutionPlan;
  synthesisPrompt: string;
}

// ─── Orchestrator v2 Event Types (for Event Bus) ──────────────────────────────

export type OrchestratorV2EventType =
  | 'orchestrator.decomposition'
  | 'orchestrator.subagent_spawned'
  | 'orchestrator.subagent_completed'
  | 'orchestrator.subagent_failed'
  | 'orchestrator.subagent_escalated'
  | 'orchestrator.synthesis_started'
  | 'orchestrator.synthesis_completed'
  | 'orchestrator.compaction_performed'
  | 'orchestrator.hook_denied'
  | 'orchestrator.hook_mutated'
  | 'orchestrator.hook_redirected';

export interface OrchestratorV2Event {
  type: OrchestratorV2EventType;
  sessionId: string;
  timestamp: number;
  details: Record<string, unknown>;
}

// ─── Cloud Bridge Chat Handler ────────────────────────────────────────────────

/**
 * Callback for routing chat requests through Cloud Bridge.
 * Provided by the Gateway wiring layer (bridge.ts). The executor calls this
 * for subtasks with modelTier 'cloud_bridge'. The handler makes the actual
 * API call through the Gateway's Cloud Bridge adapter.
 *
 * CRITICAL: This is a callback type, not a network import. The actual network
 * call happens in packages/gateway/cloud-bridge/, not in packages/core/.
 */
export type CloudBridgeChatHandler = (params: {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
  subagentId: string;
  domain: string;
  taskType: string;
}) => Promise<{
  content: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  model: string;
  provider: string;
}>;

// ─── Session Context Provider ─────────────────────────────────────────────────

/**
 * Provides named session context to the coordinator for decomposition.
 * Bridge.ts wires a NamedSessionManager-backed implementation.
 */
export interface SessionContextProvider {
  /** Look up session-specific autonomy overrides for a conversation ID. */
  getSessionOverrides(conversationId: string): Promise<{
    autonomyOverrides: Record<string, string>;
    modelOverride: string | null;
    sessionKey: string | null;
  } | null>;
}

// ─── Skill Bundle ─────────────────────────────────────────────────────────────

/**
 * A skill bundle maps a skill's tool set to a SubtaskDefinition template.
 * The coordinator can assign skill bundles as coherent subtasks during decomposition.
 */
export interface SkillBundle {
  skillId: string;
  name: string;
  description: string;
  tools: string[];
  defaultModelTier: ModelTier;
  defaultTurnBudget: number;
}

// ─── Event Emitter Interface ──────────────────────────────────────────────────

/**
 * Minimal event emitter interface for the coordinator to publish lifecycle events.
 * This avoids importing from packages/gateway/ (boundary rule).
 * The bridge.ts wiring layer provides the actual SemblanceEventBus instance cast to this.
 */
export interface OrchestratorEventEmitter {
  emit(type: string, payload: Record<string, unknown>): void;
}

// ─── Coordinator Config ───────────────────────────────────────────────────────

export interface CoordinatorConfig {
  /** Number of tool calls between compaction cycles (default: 5) */
  compactionInterval: number;
  /** Maximum concurrent subagents (default: 3) */
  maxConcurrentSubagents: number;
  /** Default timeout for subagents in ms (default: 60000) */
  defaultSubagentTimeoutMs: number;
  /** Default turn budget for subagents (default: 10) */
  defaultTurnBudget: number;
  /** Default context budget for subagents in tokens (default: 4096) */
  defaultContextBudget: number;
  /** Enable parallel execution (default: true, falls back to sequential if hardware constrained) */
  enableParallel: boolean;
}

export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  compactionInterval: 5,
  maxConcurrentSubagents: 3,
  defaultSubagentTimeoutMs: 60_000,
  defaultTurnBudget: 10,
  defaultContextBudget: 4096,
  enableParallel: true,
};
