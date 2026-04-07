// Coordinator Agent — v2 orchestrator entry point.
//
// Receives user requests, classifies complexity, and decides execution strategy:
//   - simple/compound → delegates to v1 OrchestratorImpl (zero overhead)
//   - complex → decomposes into subtasks, spawns subagents, synthesizes results
//
// Implements the same Orchestrator interface for full backward compatibility.
// All existing callers (bridge.ts, conversation manager, extension system) work unchanged.
//
// CRITICAL: This file is in packages/core/. No network imports.

import { nanoid } from 'nanoid';
import type { LLMProvider, ChatMessage, ToolDefinition } from '../llm/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { AutonomyManager } from './autonomy.js';
import type { ActionType } from '../types/ipc.js';
import type { AgentAction, AutonomyDomain } from './types.js';
import type {
  Orchestrator,
  OrchestratorResponse,
  SystemPromptConfig,
} from './orchestrator.js';
import { OrchestratorImpl } from './orchestrator.js';
import type { ApprovalPattern } from './approval-patterns.js';
import type { ExtensionTool, ToolHandler } from '../extensions/types.js';
import type { StyleProfileStore } from '../style/style-profile.js';
import type { IntentManager } from './intent-manager.js';
import type { AlterEgoGuardrails } from './alter-ego-guardrails.js';
import type { AlterEgoStore } from './alter-ego-store.js';
import type { DocumentContextManager } from './document-context.js';
import type { ContactResolver } from '../knowledge/contacts/contact-resolver.js';
import type { MessageDrafter } from './messaging/message-drafter.js';

import { ComplexityClassifier } from './complexity-classifier.js';
import { SubagentExecutor, type StreamEventCallback } from './subagent-executor.js';
import { InMemorySessionMemory } from './session-memory.js';
import { ContextCompactionEngine } from './context-compaction.js';
import { HierarchicalPermissionResolver } from './hierarchical-permissions.js';
import { ToolHookRegistryImpl, createAutonomyEnforcementHook, createGuardianRedirectHook } from './tool-hooks.js';
import { createTerminalSafetyHook, createFilesystemPermissionHook } from './filesystem-tools.js';
import type {
  CoordinatorConfig,
  SubtaskDefinition,
  ExecutionPlan,
  DecompositionResult,
  SubagentResult,
  SubagentStreamEvent,
  ModelTier,
  OrchestratorV2EventType,
  OrchestratorEventEmitter,
  SessionContextProvider,
  SkillBundle,
} from './orchestrator-v2-types.js';
import { DEFAULT_COORDINATOR_CONFIG } from './orchestrator-v2-types.js';
import type { HardwareProfileTier } from '../llm/hardware-types.js';

// ─── Coordinator Agent ────────────────────────────────────────────────────────

export class CoordinatorAgent implements Orchestrator {
  /** The v1 orchestrator — used directly for simple/compound requests */
  private v1: OrchestratorImpl;
  private llm: LLMProvider;
  private knowledge: KnowledgeGraph;
  private ipc: IPCClient;
  readonly autonomy: AutonomyManager;
  private model: string;
  private config: CoordinatorConfig;
  private classifier: ComplexityClassifier;
  private sessionMemory: InMemorySessionMemory;
  private compaction: ContextCompactionEngine;
  private hookRegistry: ToolHookRegistryImpl;
  private permissionResolver: HierarchicalPermissionResolver;
  private executor: SubagentExecutor | null = null;
  private eventBus: OrchestratorEventEmitter | null = null;
  private hardwareTier: HardwareProfileTier;
  private sessionContextProvider: SessionContextProvider | null = null;
  private skillBundles: Map<string, SkillBundle> = new Map();

  // Extension tool tracking (mirrors v1)
  private extensionToolHandlers: Map<string, ToolHandler> = new Map();
  private allToolDefs: ToolDefinition[] = [];
  private localTools: Set<string> = new Set();
  private toolActionMap: Record<string, ActionType> = {};

  constructor(config: {
    v1: OrchestratorImpl;
    llm: LLMProvider;
    knowledge: KnowledgeGraph;
    ipc: IPCClient;
    autonomy: AutonomyManager;
    model: string;
    coordinatorConfig?: Partial<CoordinatorConfig>;
    hardwareTier?: HardwareProfileTier;
    eventBus?: OrchestratorEventEmitter;
    allToolDefs: ToolDefinition[];
    localTools: Set<string>;
    toolActionMap: Record<string, ActionType>;
  }) {
    this.v1 = config.v1;
    this.llm = config.llm;
    this.knowledge = config.knowledge;
    this.ipc = config.ipc;
    this.autonomy = config.autonomy;
    this.model = config.model;
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config.coordinatorConfig };
    this.hardwareTier = config.hardwareTier ?? 'standard';
    this.eventBus = config.eventBus ?? null;
    this.allToolDefs = config.allToolDefs;
    this.localTools = config.localTools;
    this.toolActionMap = config.toolActionMap;

    // Initialize subsystems
    this.classifier = new ComplexityClassifier(this.llm, this.allToolDefs);
    this.sessionMemory = new InMemorySessionMemory();
    this.compaction = new ContextCompactionEngine(this.llm, this.knowledge, this.sessionMemory, {
      interval: this.config.compactionInterval,
    });
    this.hookRegistry = new ToolHookRegistryImpl();
    this.permissionResolver = new HierarchicalPermissionResolver(this.autonomy);

    // Register built-in hooks
    this.hookRegistry.registerPreHook(
      createAutonomyEnforcementHook((toolName) => {
        // Use the v1 autonomy manager's decide() method
        const domain = ComplexityClassifier.getToolDomain(toolName);
        const actionType = this.toolActionMap[toolName];
        if (!actionType) return 'auto_approve';
        return this.autonomy.decide(actionType);
      }),
    );
    this.hookRegistry.registerPreHook(createGuardianRedirectHook());
    this.hookRegistry.registerPreHook(createTerminalSafetyHook());
    this.hookRegistry.registerPreHook(createFilesystemPermissionHook());
  }

  // ─── Orchestrator Interface (backward compatible) ──────────────────────────

  /**
   * Process a user message — the main entry point.
   *
   * Classifies complexity:
   *   - simple/compound → delegates to v1 (zero overhead)
   *   - complex → decomposes, spawns subagents, synthesizes
   */
  async processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse> {
    // Classify the request
    const assessment = this.classifier.classify(message);

    console.error(`[CoordinatorAgent] Complexity: ${assessment.complexity} | Domains: ${assessment.domains.join(', ')} | Reasoning: ${assessment.reasoning}`);

    // Simple and compound → v1 loop (unchanged, zero overhead)
    if (assessment.complexity === 'simple' || assessment.complexity === 'compound') {
      return this.v1.processMessage(message, conversationId);
    }

    // Complex → multi-agent decomposition
    return this.processComplexRequest(message, assessment, conversationId);
  }

  async getConversation(conversationId: string) {
    return this.v1.getConversation(conversationId);
  }

  async approveAction(actionId: string) {
    return this.v1.approveAction(actionId);
  }

  async getPendingActions() {
    return this.v1.getPendingActions();
  }

  async rejectAction(actionId: string) {
    return this.v1.rejectAction(actionId);
  }

  getApprovalCount(actionType: ActionType, payload: Record<string, unknown>): number {
    return this.v1.getApprovalCount(actionType, payload);
  }

  getApprovalThreshold(actionType: ActionType, payload: Record<string, unknown>): number {
    return this.v1.getApprovalThreshold(actionType, payload);
  }

  getApprovalPatterns(): ApprovalPattern[] {
    return this.v1.getApprovalPatterns();
  }

  setVoiceMode(active: boolean): void {
    this.v1.setVoiceMode(active);
  }

  updatePromptConfig(updates: Partial<SystemPromptConfig>): void {
    this.v1.updatePromptConfig(updates);
  }

  registerTools(tools: ExtensionTool[]): void {
    // Register in both v1 and our local tracking
    this.v1.registerTools(tools);
    for (const tool of tools) {
      this.allToolDefs.push(tool.definition);
      this.extensionToolHandlers.set(tool.definition.name, tool.handler);
      if (tool.isLocal) {
        this.localTools.add(tool.definition.name);
      }
      if (tool.actionType) {
        this.toolActionMap[tool.definition.name] = tool.actionType;
      }
    }
  }

  setIntentManager?(manager: IntentManager): void {
    this.v1.setIntentManager?.(manager);
  }

  setAlterEgoGuardrails?(guardrails: AlterEgoGuardrails, store: AlterEgoStore): void {
    this.v1.setAlterEgoGuardrails?.(guardrails, store);
  }

  setWeatherService?(service: { getCurrentWeather(location?: string): Promise<unknown> }): void {
    this.v1.setWeatherService?.(service);
  }

  /** Set the model name (delegated to v1). */
  setModel(model: string): void {
    this.model = model;
    this.v1.setModel(model);
  }

  /** Set the stream event callback for multi-agent UI updates. */
  setStreamCallback(callback: StreamEventCallback): void {
    this.getOrCreateExecutor().setStreamCallback(callback);
    // Also wire v1 so single-tool calls emit stream events for the bracket UI
    if (this.v1.setStreamCallback) {
      this.v1.setStreamCallback(callback);
    }
  }

  /** Set the Cloud Bridge chat handler for hybrid local+cloud execution. */
  setCloudBridgeChatHandler(handler: import('./orchestrator-v2-types.js').CloudBridgeChatHandler): void {
    this.getOrCreateExecutor().setCloudBridgeChatHandler(handler);
  }

  /** Set the event bus for orchestrator lifecycle events. */
  setEventBus(eventBus: OrchestratorEventEmitter): void {
    this.eventBus = eventBus;
  }

  /** Set the session context provider for named session overrides. */
  setSessionContextProvider(provider: SessionContextProvider): void {
    this.sessionContextProvider = provider;
  }

  /** Register a skill bundle for subtask assignment during decomposition. */
  registerSkillBundle(bundle: SkillBundle): void {
    this.skillBundles.set(bundle.skillId, bundle);
    console.error(`[CoordinatorAgent] Registered skill bundle: ${bundle.name} (${bundle.tools.length} tools)`);
  }

  /** Get all registered skill bundles. */
  getSkillBundles(): SkillBundle[] {
    return Array.from(this.skillBundles.values());
  }

  /** Get the hook registry for external hook registration. */
  getHookRegistry(): ToolHookRegistryImpl {
    return this.hookRegistry;
  }

  /** Get session memory for inspection/debugging. */
  getSessionMemory(): InMemorySessionMemory {
    return this.sessionMemory;
  }

  // ─── Complex Request Processing ────────────────────────────────────────────

  private async processComplexRequest(
    message: string,
    assessment: { complexity: string; domains: AutonomyDomain[]; estimatedTools: string[]; parallelCapable: boolean },
    conversationId?: string,
  ): Promise<OrchestratorResponse> {
    const sessionId = conversationId ?? `session_${nanoid(12)}`;

    // Step 0: Look up named session context if available
    let sessionModelOverride: string | null = null;
    if (conversationId && this.sessionContextProvider) {
      try {
        const sessionCtx = await this.sessionContextProvider.getSessionOverrides(conversationId);
        if (sessionCtx) {
          sessionModelOverride = sessionCtx.modelOverride;
          // Store session context in session memory for subagent access
          this.sessionMemory.set(
            'session:key',
            sessionCtx.sessionKey ?? '',
            'critical',
            'coordinator',
          );
          if (Object.keys(sessionCtx.autonomyOverrides).length > 0) {
            this.sessionMemory.set(
              'session:autonomy_overrides',
              JSON.stringify(sessionCtx.autonomyOverrides),
              'critical',
              'coordinator',
            );
          }
          console.error(`[CoordinatorAgent] Named session context loaded: ${sessionCtx.sessionKey}`);
        }
      } catch {
        // Session lookup failed — proceed with global settings
      }
    }

    // Step 1: Decompose into subtasks
    const decomposition = await this.decompose(message, assessment);

    this.emitBusEvent('orchestrator.decomposition', {
      sessionId,
      complexity: assessment.complexity,
      subtaskCount: decomposition.subtasks.length,
      domains: assessment.domains,
    });

    // Step 2: Execute the plan
    const executor = this.getOrCreateExecutor();
    const results = await executor.executePlan(
      decomposition.executionPlan,
      message,
      sessionId,
    );

    // Step 3: Synthesize results
    this.emitBusEvent('orchestrator.synthesis_started', {
      sessionId,
      subtaskCount: results.length,
    });

    const synthesis = await this.synthesize(message, results, decomposition.synthesisPrompt);

    this.emitBusEvent('orchestrator.synthesis_completed', {
      sessionId,
      tokensConsumed: synthesis.tokensUsed,
    });

    // Step 4: Store in session memory
    this.sessionMemory.set(
      `last_complex_result:${sessionId}`,
      synthesis.message.slice(0, 2000),
      'normal',
      'coordinator',
    );

    // Step 5: Build OrchestratorResponse (compatible with v1 shape)
    const actions: AgentAction[] = [];
    for (const result of results) {
      if (result.status === 'escalated' && result.escalationRequest) {
        // Surface escalation as a pending action
        actions.push({
          id: nanoid(),
          action: 'web.search' as ActionType, // placeholder — the escalation carries the real info
          payload: { escalation: result.escalationRequest },
          reasoning: result.escalationRequest.reason,
          domain: 'system' as AutonomyDomain,
          tier: 'partner',
          status: 'pending_approval',
          createdAt: new Date().toISOString(),
        });
      }
    }

    return {
      message: synthesis.message,
      conversationId: sessionId,
      actions,
      context: [],
      tokensUsed: { prompt: synthesis.tokensUsed, completion: synthesis.tokensUsed },
    };
  }

  // ─── Decomposition ─────────────────────────────────────────────────────────

  private async decompose(
    message: string,
    assessment: { domains: AutonomyDomain[]; estimatedTools: string[]; parallelCapable: boolean },
  ): Promise<DecompositionResult> {
    // Try LLM-assisted decomposition
    const subtasks = await this.decomposeWithLLM(message, assessment);

    if (subtasks.length > 0) {
      return this.buildExecutionPlan(subtasks, assessment.parallelCapable, message);
    }

    // Fallback: rule-based decomposition (one subtask per domain)
    return this.decomposeRuleBased(message, assessment);
  }

  private async decomposeWithLLM(
    message: string,
    assessment: { domains: AutonomyDomain[]; estimatedTools: string[] },
  ): Promise<SubtaskDefinition[]> {
    if (!this.llm.routedChat) return [];

    const toolList = assessment.estimatedTools.join(', ');
    const domainList = assessment.domains.join(', ');

    try {
      const response = await this.llm.routedChat(
        {
          model: '',
          messages: [
            {
              role: 'system',
              content: `You decompose complex user requests into parallel subtasks for a multi-agent AI assistant.
Each subtask runs as an independent agent with scoped tools.

Available tools by domain:
- email: fetch_inbox, search_emails, send_email, draft_email, archive_email, categorize_email
- calendar: fetch_calendar, create_calendar_event, update_calendar_event, detect_calendar_conflicts
- files: search_files, list_indexed_documents, read_document
- web: search_web, deep_search_web, fetch_url
- contacts: search_contacts, add_contact
- finances: fetch_transactions
- health: log_health_entry, get_health_summary
- reminders: create_reminder, list_reminders
- location: get_weather

Respond with ONLY a JSON array of subtask objects:
[{"id":"st-1","description":"...","successCriteria":"...","tools":["tool1","tool2"],"modelTier":"primary","dependsOn":[]}]

Rules:
- Each subtask should be completable independently (unless it depends on another)
- Use "dependsOn" to express ordering constraints between subtasks
- modelTier: "fast" for classification/triage, "primary" for reasoning/drafting
- Keep subtask count between 2-5 (more would overwhelm local hardware)
- The last subtask should be a synthesis step with no tools (modelTier "primary")`,
            },
            {
              role: 'user',
              content: `Request: "${message}"\nDetected domains: ${domainList}\nEstimated tools: ${toolList}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 1024,
          format: 'json',
        },
        'classify',
      );

      let parsed = JSON.parse(response.message.content) as
        | Array<{ id?: string; description?: string; successCriteria?: string; tools?: string[]; modelTier?: string; dependsOn?: string[] }>
        | { id?: string; description?: string; successCriteria?: string; tools?: string[]; modelTier?: string; dependsOn?: string[] };

      // Some models return a single object instead of an array — normalize
      if (!Array.isArray(parsed)) {
        parsed = parsed && typeof parsed === 'object' && parsed.description ? [parsed] : [];
      }

      if (parsed.length === 0) return [];

      return parsed
        .filter(s => s.description && s.tools)
        .map((s, i) => ({
          id: s.id ?? `st-${i + 1}`,
          description: s.description!,
          successCriteria: s.successCriteria ?? 'Complete the subtask successfully',
          allowedTools: s.tools!,
          modelTier: (s.modelTier === 'fast' ? 'fast' : 'primary') as ModelTier,
          maxTokens: 1024,
          timeoutMs: this.config.defaultSubagentTimeoutMs,
          contextBudget: this.config.defaultContextBudget,
          turnBudget: this.config.defaultTurnBudget,
          dependsOn: s.dependsOn ?? [],
        }));
    } catch {
      return [];
    }
  }

  private decomposeRuleBased(
    message: string,
    assessment: { domains: AutonomyDomain[]; estimatedTools: string[]; parallelCapable: boolean },
  ): DecompositionResult {
    // Create one subtask per domain
    const subtasks: SubtaskDefinition[] = assessment.domains.map((domain, i) => {
      const domainTools = assessment.estimatedTools.filter(t => {
        const toolDomain = ComplexityClassifier.getToolDomain(t);
        return toolDomain === domain;
      });

      return {
        id: `st-${i + 1}`,
        description: `Handle ${domain} aspect of: "${message}"`,
        successCriteria: `Gather relevant ${domain} information and complete any ${domain} actions`,
        allowedTools: domainTools.length > 0 ? domainTools : assessment.estimatedTools,
        modelTier: 'primary' as ModelTier,
        maxTokens: 1024,
        timeoutMs: this.config.defaultSubagentTimeoutMs,
        contextBudget: this.config.defaultContextBudget,
        turnBudget: this.config.defaultTurnBudget,
      };
    });

    return this.buildExecutionPlan(subtasks, assessment.parallelCapable, message);
  }

  private buildExecutionPlan(
    subtasks: SubtaskDefinition[],
    parallelCapable: boolean,
    message: string,
  ): DecompositionResult {
    // Build dependency graph into waves
    const waves: SubtaskDefinition[][] = [];

    if (!parallelCapable) {
      // Sequential: each subtask is its own wave
      for (const st of subtasks) {
        waves.push([st]);
      }
    } else {
      // Parallel: group independent subtasks into waves
      const completed = new Set<string>();
      const remaining = [...subtasks];

      while (remaining.length > 0) {
        const wave: SubtaskDefinition[] = [];
        const stillRemaining: SubtaskDefinition[] = [];

        for (const st of remaining) {
          const depsResolved = !st.dependsOn || st.dependsOn.every(d => completed.has(d));
          if (depsResolved) {
            wave.push(st);
          } else {
            stillRemaining.push(st);
          }
        }

        if (wave.length === 0) {
          // Circular dependency or unresolvable — force remaining into one wave
          waves.push(stillRemaining);
          break;
        }

        waves.push(wave);
        for (const st of wave) {
          completed.add(st.id);
        }
        remaining.length = 0;
        remaining.push(...stillRemaining);
      }
    }

    const estimatedDurationMs = waves.length * this.config.defaultSubagentTimeoutMs * 0.3;

    return {
      subtasks,
      executionPlan: {
        mode: parallelCapable ? 'parallel' : 'sequential',
        waves,
        estimatedDurationMs,
      },
      synthesisPrompt: `The user asked: "${message}"\n\nYou received results from ${subtasks.length} specialized agents. Synthesize their outputs into a coherent, comprehensive response. Present all information clearly. Do not fabricate data not present in the agent outputs.`,
    };
  }

  // ─── Synthesis ──────────────────────────────────────────────────────────────

  private async synthesize(
    userMessage: string,
    results: SubagentResult[],
    synthesisPrompt: string,
  ): Promise<{ message: string; tokensUsed: number }> {
    // Build synthesis input from all subagent results
    const resultSummaries = results.map(r => {
      const statusLabel = r.status === 'completed' ? '✓' : r.status === 'partial' ? '~' : '✗';
      return `[${statusLabel} ${r.subtaskId}] (${r.modelUsed}, ${r.toolCallsExecuted} tools, ${r.executionTimeMs}ms)\n${r.output}`;
    }).join('\n\n---\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: synthesisPrompt,
      },
      {
        role: 'user',
        content: `Subagent results:\n\n${resultSummaries}\n\nSynthesize these into a single coherent response for the user.`,
      },
    ];

    const response = await this.llm.chat({
      model: this.model,
      messages,
      temperature: 0.7,
      maxTokens: 2048,
    });

    return {
      message: response.message.content ?? 'I completed the analysis but couldn\'t generate a summary. Please check the individual results.',
      tokensUsed: response.tokensUsed?.total ?? 0,
    };
  }

  // ─── Executor Lifecycle ─────────────────────────────────────────────────────

  private getOrCreateExecutor(): SubagentExecutor {
    if (!this.executor) {
      this.executor = new SubagentExecutor({
        llm: this.llm,
        knowledge: this.knowledge,
        ipc: this.ipc,
        hookRegistry: this.hookRegistry,
        permissionResolver: this.permissionResolver,
        sessionMemory: this.sessionMemory,
        allToolDefs: this.allToolDefs,
        allToolHandlers: this.extensionToolHandlers,
        localTools: this.localTools,
        toolActionMap: this.toolActionMap,
        hardwareTier: this.hardwareTier,
      });
    }
    return this.executor;
  }

  // ─── Event Bus ──────────────────────────────────────────────────────────────

  private emitBusEvent(type: OrchestratorV2EventType, details: Record<string, unknown>): void {
    if (!this.eventBus) return;
    try {
      // The event bus expects typed payloads per event type.
      // We cast here because our dynamic details match the registered shapes.
      (this.eventBus as any).emit(type, details);
    } catch {
      // Event bus errors are not fatal
    }
  }
}
