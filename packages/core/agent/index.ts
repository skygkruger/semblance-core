// Agent Orchestration Layer — Export types, autonomy, IPC client, and orchestrator.

export type {
  AutonomyTier,
  AutonomyConfig,
  AutonomyDomain,
  AgentAction,
  ConversationTurn,
} from './types.js';

export { AutonomyManager } from './autonomy.js';
export type { AutonomyDecision } from './autonomy.js';
export { CoreIPCClient } from './ipc-client.js';
export type { IPCClient, IPCClientConfig } from './ipc-client.js';
export { OrchestratorImpl } from './orchestrator.js';
export type { Orchestrator, OrchestratorResponse, SystemPromptConfig } from './orchestrator.js';
export type { VaultChatGrounding, VaultChatChunk } from './context/vault-chat-grounding.js';
export { buildVaultChatContext } from './context/vault-context-builder.js';
export { extractVaultSourceCitations, validateVaultCitations } from './context/citation-validator.js';
// Orchestrator v2 — multi-agent coordination
export { CoordinatorAgent } from './coordinator-agent.js';
export { ComplexityClassifier } from './complexity-classifier.js';
export { SubagentExecutor } from './subagent-executor.js';
export { InMemorySessionMemory } from './session-memory.js';
export { ContextCompactionEngine } from './context-compaction.js';
export { HierarchicalPermissionResolver } from './hierarchical-permissions.js';
export { ToolHookRegistryImpl, createAutonomyEnforcementHook, createGuardianRedirectHook } from './tool-hooks.js';
export type {
  RequestComplexity,
  ComplexityAssessment,
  SubtaskDefinition,
  SubagentResult,
  SubagentStreamEvent,
  ExecutionMode,
  ExecutionPlan,
  DecompositionResult,
  CoordinatorConfig,
  ModelTier,
  PreToolUseHook,
  PostToolUseHook,
  PreToolUseAction,
  PostToolUseAction,
  ToolHookContext,
  ToolHookRegistry,
  SessionMemoryStore,
  SessionMemoryEntry,
  SessionMemoryPriority,
  SubagentPermissionScope,
  PermissionResolution,
  OrchestratorV2EventType,
  OrchestratorEventEmitter,
} from './orchestrator-v2-types.js';
export { DEFAULT_COORDINATOR_CONFIG } from './orchestrator-v2-types.js';
export { ConversationManager } from './conversation-manager.js';
export type {
  ConversationSummary as ConvSummary,
  ConversationTurnRow,
  ListConversationsOptions,
  ConversationWithTurns,
} from './conversation-manager.js';
export { DocumentContextManager } from './document-context.js';
export type { DocumentContextInfo } from './document-context.js';
export { DailyDigestGenerator } from './daily-digest.js';
export type { DailyDigest, DailyDigestPreferences } from './daily-digest.js';
export { assessTaskComplexity, shouldOffload, estimateTokenCount } from './task-router.js';
export type { TaskRoutingDecision, TaskComplexity, TaskType, DeviceCapabilitySummary } from './task-router.js';
export { HandoffProtocol } from './device-handoff.js';
export type {
  HandoffRequest,
  HandoffResponse,
  DeviceCapability,
  HandoffTransport,
  IncomingTaskHandler,
} from './device-handoff.js';

export {
  approveRepresentativeEmailWorkflow,
  createEntitlementGateFromSnapshot,
  createRepresentativeEmailWorkflowStore,
  hashRepresentativeEmailPayload,
  isRepresentativeEmailWorkflowRestartPersistent,
  reopenRepresentativeEmailWorkflowStores,
  runRepresentativeEmailWorkflow,
  getRepresentativeEmailWorkflowAuditRecord,
} from './representative-email-workflow.js';
export type {
  EntitlementGatePort,
  FollowUpNeed,
  FollowUpTrackerPort,
  RepresentativeEmailDraft,
  RepresentativeEmailDrafterPort,
  RepresentativeEmailWorkflowDeps,
  RepresentativeEmailWorkflowRecord,
  RepresentativeEmailWorkflowResult,
  RepresentativeEmailWorkflowStatus,
  RepresentativeEmailWorkflowStore,
  RunRepresentativeEmailWorkflowInput,
} from './representative-email-workflow.js';

export {
  MemoryProposalStore,
  MemoryProposalError,
  createMemoryProposal,
  confirmProposal,
  correctProposal,
  dismissProposal,
  proposeFromPreferenceSignal,
  formatPreferenceSignalAsMemoryText,
  extractEvidenceSourceIdsFromPreferenceEvidence,
  canConfirmProposal,
} from './memory/memory-proposal.js';
export type {
  MemoryProposal,
  MemoryProposalStatus,
  MemoryDerivationMethod,
  CreateMemoryProposalInput,
  ConfirmMemoryProposalOptions,
  CorrectMemoryProposalInput,
} from './memory/memory-proposal.js';
export {
  MemoryPromotionError,
  promoteConfirmedMemory,
  buildPromotedMemoryAssertion,
  isPromotableMemory,
  isEvidenceBacked,
} from './memory/memory-promotion.js';
export type {
  MemoryPromotionWriter,
  PromotedMemoryAssertion,
} from './memory/memory-promotion.js';
export {
  createPlanStore,
  enrichPlanView,
  syncPlanWithActionLifecycle,
  createDelegatedPlan,
  updateDelegatedPlan,
  linkStepActionRequest,
  markStepComplete,
  markStepFailed,
  attachStepOutcome,
  computePlanProgress,
  type PlanStore,
  type DelegatedPlan,
  type DelegatedPlanView,
  type PlanStatus,
  type PlanStep,
  type CreatePlanInput,
  type UpdatePlanInput,
} from './planning/index.js';

import type { LLMProvider } from '../llm/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { AutonomyConfig } from './types.js';
import type { Orchestrator } from './orchestrator.js';
import { OrchestratorImpl, BASE_TOOLS, BASE_LOCAL_TOOLS, BASE_TOOL_ACTION_MAP } from './orchestrator.js';
import { CoordinatorAgent } from './coordinator-agent.js';
import { AutonomyManager } from './autonomy.js';
import { getPlatform } from '../platform/index.js';
import type { SemblanceExtension } from '../extensions/types.js';
import type { StyleProfileStore } from '../style/style-profile.js';
import type { CoordinatorConfig, OrchestratorEventEmitter } from './orchestrator-v2-types.js';
import type { HardwareProfileTier } from '../llm/hardware-types.js';
import type { VaultChatGrounding } from './context/vault-chat-grounding.js';

/**
 * Create an Orchestrator instance.
 * If extensions are provided, their tools are registered with the orchestrator.
 */
export function createOrchestrator(config: {
  llmProvider: LLMProvider;
  knowledgeGraph: KnowledgeGraph;
  ipcClient: IPCClient;
  autonomyConfig?: AutonomyConfig;
  dataDir: string;
  model: string;
  extensions?: SemblanceExtension[];
  aiName?: string;
  userName?: string;
  connectedServices?: string[];
  indexedDocCount?: number;
  styleProfileStore?: StyleProfileStore;
  vaultChatGrounding?: VaultChatGrounding;
}): Orchestrator {
  const p = getPlatform();
  const db = p.sqlite.openDatabase(p.path.join(config.dataDir, 'agent.db'));
  db.pragma('journal_mode = WAL');

  const autonomy = new AutonomyManager(db, config.autonomyConfig);

  const orchestrator = new OrchestratorImpl({
    llm: config.llmProvider,
    knowledge: config.knowledgeGraph,
    ipc: config.ipcClient,
    autonomy,
    db,
    model: config.model,
    aiName: config.aiName,
    userName: config.userName,
    connectedServices: config.connectedServices,
    indexedDocCount: config.indexedDocCount,
    styleProfileStore: config.styleProfileStore,
    vaultChatGrounding: config.vaultChatGrounding,
  });

  // Wire extension tools
  if (config.extensions) {
    for (const ext of config.extensions) {
      if (ext.tools && ext.tools.length > 0) {
        orchestrator.registerTools(ext.tools);
      }
    }
  }

  return orchestrator;
}

/**
 * Create a v2 CoordinatorAgent that wraps the v1 OrchestratorImpl.
 *
 * For simple/compound requests, delegates directly to v1 (zero overhead).
 * For complex multi-domain requests, decomposes into subagents and synthesizes.
 *
 * Drop-in replacement for createOrchestrator — same interface, same callers.
 */
export function createCoordinatorAgent(config: {
  llmProvider: LLMProvider;
  knowledgeGraph: KnowledgeGraph;
  ipcClient: IPCClient;
  autonomyConfig?: AutonomyConfig;
  dataDir: string;
  model: string;
  extensions?: SemblanceExtension[];
  aiName?: string;
  userName?: string;
  connectedServices?: string[];
  indexedDocCount?: number;
  styleProfileStore?: StyleProfileStore;
  coordinatorConfig?: Partial<CoordinatorConfig>;
  hardwareTier?: HardwareProfileTier;
  eventBus?: OrchestratorEventEmitter;
  /** Path where AI metrics (scanner fires, retries, etc.) should be appended. */
  metricsLogPath?: string;
  vaultChatGrounding?: VaultChatGrounding;
}): Orchestrator {
  const p = getPlatform();
  const db = p.sqlite.openDatabase(p.path.join(config.dataDir, 'agent.db'));
  db.pragma('journal_mode = WAL');

  const autonomy = new AutonomyManager(db, config.autonomyConfig);

  // Create the v1 orchestrator (used for simple/compound requests)
  const v1 = new OrchestratorImpl({
    llm: config.llmProvider,
    knowledge: config.knowledgeGraph,
    ipc: config.ipcClient,
    autonomy,
    db,
    model: config.model,
    aiName: config.aiName,
    userName: config.userName,
    connectedServices: config.connectedServices,
    indexedDocCount: config.indexedDocCount,
    hardwareTier: config.hardwareTier,
    styleProfileStore: config.styleProfileStore,
    vaultChatGrounding: config.vaultChatGrounding,
  });

  // Wire metrics log path if provided (non-critical — silent no-op when unset).
  if (config.metricsLogPath) v1.setMetricsLogPath(config.metricsLogPath);

  // Extract tool metadata from v1 for the coordinator
  // The v1 orchestrator stores these as private fields, so we access them
  // through the same BASE_TOOLS/BASE_LOCAL_TOOLS/BASE_TOOL_ACTION_MAP
  // that v1 uses. We import them indirectly by reading the v1's registered tools.
  // For now, the coordinator gets the base tool definitions via a clean import.
  // Wrap in CoordinatorAgent
  const coordinator = new CoordinatorAgent({
    v1,
    llm: config.llmProvider,
    knowledge: config.knowledgeGraph,
    ipc: config.ipcClient,
    autonomy,
    model: config.model,
    coordinatorConfig: config.coordinatorConfig,
    hardwareTier: config.hardwareTier,
    eventBus: config.eventBus,
    allToolDefs: [...BASE_TOOLS],
    localTools: new Set(BASE_LOCAL_TOOLS),
    toolActionMap: { ...BASE_TOOL_ACTION_MAP },
  });

  // Wire extension tools into both v1 and coordinator
  if (config.extensions) {
    for (const ext of config.extensions) {
      if (ext.tools && ext.tools.length > 0) {
        coordinator.registerTools(ext.tools);
      }
    }
  }

  return coordinator;
}

