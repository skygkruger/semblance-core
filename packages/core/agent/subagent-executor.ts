// Subagent Executor — Spawns and manages scoped, short-lived agent instances.
//
// Each subagent is a ReAct loop with:
//   - Scoped tool access (only tools assigned by the coordinator)
//   - Scoped context (only relevant context, not full conversation)
//   - Scoped permissions (intersected with user's autonomy tier)
//   - Timeout and resource budget
//
// Three execution modes:
//   - parallel:    Different model tiers run concurrently (16GB+ RAM)
//   - interleaved: Subagents take turns generating (constrained hardware)
//   - sequential:  One at a time (8GB mobile fallback)
//
// CRITICAL: This file is in packages/core/. No network imports.

import { nanoid } from 'nanoid';
import type { LLMProvider, ChatMessage, ToolDefinition, ToolCall } from '../llm/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { ActionType } from '../types/ipc.js';
import type { AutonomyDomain } from './types.js';
import type {
  SubtaskDefinition,
  SubagentResult,
  SubagentStreamEvent,
  ExecutionMode,
  ExecutionPlan,
  SubagentPermissionScope,
  ToolHookContext,
  SessionMemoryStore,
  CloudBridgeChatHandler,
} from './orchestrator-v2-types.js';
import type { ToolHookRegistry } from './orchestrator-v2-types.js';
import { executePreToolHooks, executePostToolHooks } from './tool-hooks.js';
import { HierarchicalPermissionResolver } from './hierarchical-permissions.js';
import { ComplexityClassifier } from './complexity-classifier.js';
import type { HardwareProfileTier } from '../llm/hardware-types.js';
import type { ExtensionTool, ToolHandler } from '../extensions/types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StreamEventCallback = (event: SubagentStreamEvent) => void;

interface SubagentInstance {
  id: string;
  subtask: SubtaskDefinition;
  scope: SubagentPermissionScope;
  startedAt: number;
  status: 'running' | 'completed' | 'failed' | 'timed_out';
}

interface ToolExecutionResult {
  tool: string;
  result: unknown;
  success: boolean;
}

// ─── Subagent Executor ────────────────────────────────────────────────────────

/**
 * Truncate a string to at most `maxChars`, breaking at the nearest sentence
 * boundary before the cut rather than mid-word. Preserves JSON-ish payloads
 * by preferring commas and `}` when no sentence boundary is near.
 *
 * If the string is already within budget, returns it unchanged.
 * If no reasonable boundary exists in the last 15% of the window, falls back
 * to a hard slice with an ellipsis.
 */
function truncateAtSentenceBoundary(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const window = s.slice(0, maxChars);
  // Prefer sentence endings
  const sentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('\n\n'),
  );
  if (sentenceEnd > maxChars * 0.85) {
    return window.slice(0, sentenceEnd + 1) + '... [truncated]';
  }
  // For JSON-ish content, break at a comma or closing brace
  const structEnd = Math.max(
    window.lastIndexOf('},'),
    window.lastIndexOf('",'),
    window.lastIndexOf('],'),
  );
  if (structEnd > maxChars * 0.85) {
    return window.slice(0, structEnd + 1) + '... [truncated]';
  }
  return window + '... [truncated]';
}

export class SubagentExecutor {
  private llm: LLMProvider;
  private knowledge: KnowledgeGraph;
  private ipc: IPCClient;
  private hookRegistry: ToolHookRegistry;
  private permissionResolver: HierarchicalPermissionResolver;
  private sessionMemory: SessionMemoryStore;
  private allToolDefs: ToolDefinition[];
  private allToolHandlers: Map<string, ToolHandler>;
  private localTools: Set<string>;
  private toolActionMap: Record<string, ActionType>;
  private hardwareTier: HardwareProfileTier;
  private activeSubagents: Map<string, SubagentInstance> = new Map();
  private onStreamEvent: StreamEventCallback | null = null;
  private cloudBridgeChatHandler: CloudBridgeChatHandler | null = null;

  constructor(config: {
    llm: LLMProvider;
    knowledge: KnowledgeGraph;
    ipc: IPCClient;
    hookRegistry: ToolHookRegistry;
    permissionResolver: HierarchicalPermissionResolver;
    sessionMemory: SessionMemoryStore;
    allToolDefs: ToolDefinition[];
    allToolHandlers: Map<string, ToolHandler>;
    localTools: Set<string>;
    toolActionMap: Record<string, ActionType>;
    hardwareTier: HardwareProfileTier;
  }) {
    this.llm = config.llm;
    this.knowledge = config.knowledge;
    this.ipc = config.ipc;
    this.hookRegistry = config.hookRegistry;
    this.permissionResolver = config.permissionResolver;
    this.sessionMemory = config.sessionMemory;
    this.allToolDefs = config.allToolDefs;
    this.allToolHandlers = config.allToolHandlers;
    this.localTools = config.localTools;
    this.toolActionMap = config.toolActionMap;
    this.hardwareTier = config.hardwareTier;
  }

  /** Set the stream event callback for UI updates. */
  setStreamCallback(callback: StreamEventCallback): void {
    this.onStreamEvent = callback;
  }

  /** Set the Cloud Bridge chat handler for routing cloud_bridge tier subtasks. */
  setCloudBridgeChatHandler(handler: CloudBridgeChatHandler): void {
    this.cloudBridgeChatHandler = handler;
  }

  /**
   * Determine the optimal execution mode based on hardware and subtask model tiers.
   */
  selectExecutionMode(plan: ExecutionPlan): ExecutionMode {
    // Override: if only one subtask per wave, sequential is fine
    const maxWaveSize = Math.max(...plan.waves.map(w => w.length));
    if (maxWaveSize <= 1) return 'sequential';

    // Check if subtasks use different model tiers (enables true parallel)
    const hasDifferentTiers = plan.waves.some(wave => {
      const tiers = new Set(wave.map(s => s.modelTier));
      return tiers.size > 1;
    });

    switch (this.hardwareTier) {
      case 'enthusiast':
      case 'workstation':
      case 'performance':
        // 16GB+ — true parallel if different tiers, otherwise interleaved
        return hasDifferentTiers ? 'parallel' : 'interleaved';
      case 'standard':
        // 8-15GB — interleaved only
        return 'interleaved';
      case 'constrained':
        // <8GB — sequential
        return 'sequential';
    }
  }

  /**
   * Execute a full execution plan (all waves, all subtasks).
   *
   * Returns results in subtask order.
   */
  async executePlan(
    plan: ExecutionPlan,
    userMessage: string,
    sessionId: string,
  ): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];
    const mode = this.selectExecutionMode(plan);

    for (const wave of plan.waves) {
      const waveResults = await this.executeWave(wave, mode, userMessage, sessionId);
      results.push(...waveResults);

      // Store completed results in session memory for subsequent waves
      for (const result of waveResults) {
        if (result.status === 'completed' || result.status === 'partial') {
          this.sessionMemory.set(
            `subagent:${result.subtaskId}:output`,
            result.output.slice(0, 2000), // Cap stored output
            'normal',
            result.subagentId,
          );
        }
      }
    }

    return results;
  }

  /**
   * Execute a single wave of subtasks according to the execution mode.
   */
  private async executeWave(
    subtasks: SubtaskDefinition[],
    mode: ExecutionMode,
    userMessage: string,
    sessionId: string,
  ): Promise<SubagentResult[]> {
    switch (mode) {
      case 'parallel':
        return this.executeParallel(subtasks, userMessage, sessionId);
      case 'interleaved':
        return this.executeInterleaved(subtasks, userMessage, sessionId);
      case 'sequential':
        return this.executeSequential(subtasks, userMessage, sessionId);
    }
  }

  /**
   * True parallel — all subtasks in the wave run concurrently via Promise.all.
   * Only safe when using different model tiers (no memory contention).
   */
  private async executeParallel(
    subtasks: SubtaskDefinition[],
    userMessage: string,
    sessionId: string,
  ): Promise<SubagentResult[]> {
    const promises = subtasks.map(subtask =>
      this.executeSubagent(subtask, userMessage, sessionId),
    );
    return Promise.all(promises);
  }

  /**
   * Interleaved — subtasks run concurrently but share inference resources.
   * Uses Promise.all since the LLM provider handles queuing internally.
   * If the provider can't handle concurrent requests, they'll serialize naturally.
   */
  private async executeInterleaved(
    subtasks: SubtaskDefinition[],
    userMessage: string,
    sessionId: string,
  ): Promise<SubagentResult[]> {
    // Interleaved is structurally the same as parallel at the executor level.
    // The LLM provider's internal request queue handles the actual interleaving.
    return this.executeParallel(subtasks, userMessage, sessionId);
  }

  /**
   * Sequential — one subtask at a time. Safest for constrained hardware.
   */
  private async executeSequential(
    subtasks: SubtaskDefinition[],
    userMessage: string,
    sessionId: string,
  ): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];
    for (const subtask of subtasks) {
      const result = await this.executeSubagent(subtask, userMessage, sessionId);
      results.push(result);
    }
    return results;
  }

  /**
   * Execute a single subagent — the core ReAct loop with scoped tools.
   */
  private async executeSubagent(
    subtask: SubtaskDefinition,
    userMessage: string,
    sessionId: string,
  ): Promise<SubagentResult> {
    const subagentId = `subagent_${nanoid(12)}`;
    const scope = this.permissionResolver.buildSubagentScope(subtask);
    const startedAt = Date.now();

    // Register as active
    this.activeSubagents.set(subagentId, {
      id: subagentId,
      subtask,
      scope,
      startedAt,
      status: 'running',
    });

    this.emitEvent({
      type: 'subagent_started',
      subagentId,
      subtaskId: subtask.id,
      timestamp: startedAt,
      data: { text: subtask.description },
    });

    try {
      // Build scoped tool definitions
      const scopedTools = this.allToolDefs.filter(t =>
        scope.allowedTools.includes(t.name),
      );

      // Build scoped context from session memory
      const memoryEntries = this.sessionMemory.getAll();
      const sessionContext = memoryEntries.length > 0
        ? '\n\nAvailable context from prior steps:\n' +
          memoryEntries
            .filter(e => e.priority !== 'ephemeral')
            .map(e => `- ${e.key}: ${e.value}`)
            .join('\n')
        : '';

      // Retrieve relevant knowledge within context budget
      const knowledgeResults = await this.knowledge.search(
        `${userMessage} ${subtask.description}`,
        { limit: 3 },
      );
      const knowledgeContext = knowledgeResults.length > 0
        ? '\n\nRelevant knowledge:\n' +
          knowledgeResults.map(r => `- ${r.document.title}: ${r.chunk.content?.slice(0, 300) ?? ''}`).join('\n')
        : '';

      // Build messages for the subagent
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a focused subtask agent. Your job: ${subtask.description}

Success criteria: ${subtask.successCriteria}

You have access to these tools: ${scope.allowedTools.join(', ')}
Complete your task efficiently. Do not attempt to use tools outside your scope.
If you need a tool you don't have, explain what you need and why.${sessionContext}${knowledgeContext}`,
        },
        {
          role: 'user',
          content: `Original user request: "${userMessage}"\n\nYour subtask: ${subtask.description}`,
        },
      ];

      // ReAct loop with turn budget
      let toolCallsExecuted = 0;
      let totalTokens = 0;
      let output = '';
      let turnsUsed = 0;

      while (turnsUsed < subtask.turnBudget) {
        // Check timeout
        if (Date.now() - startedAt > subtask.timeoutMs) {
          this.updateSubagentStatus(subagentId, 'timed_out');
          this.emitEvent({
            type: 'subagent_failed',
            subagentId,
            subtaskId: subtask.id,
            timestamp: Date.now(),
            data: { text: 'Timeout exceeded' },
          });
          return {
            subagentId,
            subtaskId: subtask.id,
            status: 'timed_out',
            output: output || 'Subtask timed out before completion',
            toolCallsExecuted,
            tokensConsumed: totalTokens,
            executionTimeMs: Date.now() - startedAt,
            modelUsed: this.getModelForTier(subtask.modelTier),
          };
        }

        // LLM call — route through Cloud Bridge for cloud_bridge tier if handler available
        let chatResponse;
        if (subtask.modelTier === 'cloud_bridge' && this.cloudBridgeChatHandler) {
          try {
            const cloudResult = await this.cloudBridgeChatHandler({
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              maxTokens: subtask.maxTokens,
              temperature: 0.5,
              subagentId,
              domain: ComplexityClassifier.getToolDomain(subtask.allowedTools[0] ?? '') ?? 'general',
              taskType: subtask.description.slice(0, 50),
            });
            chatResponse = {
              message: { role: 'assistant' as const, content: cloudResult.content },
              model: cloudResult.model,
              tokensUsed: cloudResult.tokensUsed,
              durationMs: 0,
            };
          } catch {
            // Cloud Bridge failed — fall back to local primary model
            chatResponse = await this.llm.chat({
              model: this.getModelForTier('primary'),
              messages,
              tools: scopedTools.length > 0 ? scopedTools : undefined,
              temperature: 0.5,
              maxTokens: subtask.maxTokens,
            });
          }
        } else {
          // Local model (or cloud_bridge tier without handler = fallback to primary)
          const effectiveTier = subtask.modelTier === 'cloud_bridge' ? 'primary' : subtask.modelTier;
          chatResponse = await this.llm.chat({
            model: this.getModelForTier(effectiveTier),
            messages,
            tools: scopedTools.length > 0 ? scopedTools : undefined,
            temperature: 0.5,
            maxTokens: subtask.maxTokens,
          });
        }

        totalTokens += chatResponse.tokensUsed?.total ?? 0;
        turnsUsed++;

        this.emitEvent({
          type: 'subagent_progress',
          subagentId,
          subtaskId: subtask.id,
          timestamp: Date.now(),
          data: {
            progress: turnsUsed / subtask.turnBudget,
            tokensConsumed: totalTokens,
          },
        });

        // No tool calls — the subagent has finished reasoning
        if (!chatResponse.toolCalls || chatResponse.toolCalls.length === 0) {
          output = chatResponse.message.content ?? '';
          break;
        }

        // Process tool calls
        for (const toolCall of chatResponse.toolCalls) {
          // Check tool is in scope
          if (!scope.allowedTools.includes(toolCall.name)) {
            // Subagent tried to use a tool outside its scope — escalation
            messages.push({
              role: 'assistant',
              content: `I need to use '${toolCall.name}' but it's not in my tool scope. I'll note this and continue with available tools.`,
            });
            continue;
          }

          // Run PreToolUse hooks
          const hookContext: ToolHookContext = {
            toolName: toolCall.name,
            toolParams: toolCall.arguments,
            subagentId,
            subtaskId: subtask.id,
            sessionId,
            domain: ComplexityClassifier.getToolDomain(toolCall.name),
            autonomyTier: scope.effectiveTier,
          };

          const preResult = await executePreToolHooks(
            this.hookRegistry,
            hookContext,
            subtask.preToolHooks,
          );

          if (!preResult.proceed) {
            messages.push({
              role: 'assistant',
              content: `Tool '${toolCall.name}' was denied: ${preResult.denyReason}. I'll adjust my approach.`,
            });
            continue;
          }

          this.emitEvent({
            type: 'subagent_tool_call',
            subagentId,
            subtaskId: subtask.id,
            timestamp: Date.now(),
            data: { toolName: preResult.toolName, toolStatus: 'executing' },
          });

          // Execute the tool
          const toolResult = await this.executeTool(
            preResult.toolName,
            preResult.params,
          );
          toolCallsExecuted++;

          // Run PostToolUse hooks
          const postResult = await executePostToolHooks(
            this.hookRegistry,
            { ...hookContext, toolName: preResult.toolName },
            toolResult.result,
            subtask.postToolHooks,
          );

          if (postResult.aborted) {
            messages.push({
              role: 'assistant',
              content: `Tool result was rejected: ${postResult.abortReason}. Adjusting approach.`,
            });
            continue;
          }

          this.emitEvent({
            type: 'subagent_tool_result',
            subagentId,
            subtaskId: subtask.id,
            timestamp: Date.now(),
            data: { toolName: preResult.toolName, toolStatus: 'completed' },
          });

          // Add tool result to conversation.
          // Truncation target: ~2000 chars was arbitrary. We use a context-budget
          // heuristic instead — roughly half the model's context window divided
          // by expected tool-call count (~3 per turn). Prefer sentence-boundary
          // truncation so the model doesn't see half-words.
          const fullResultStr = JSON.stringify(postResult.result);
          const budget = this.getToolResultCharBudget();
          const resultStr = truncateAtSentenceBoundary(fullResultStr, budget);
          const injected = postResult.injectedContext
            ? `\n${postResult.injectedContext}`
            : '';
          messages.push({
            role: 'user',
            content: `Tool '${preResult.toolName}' result: ${resultStr}${injected}`,
          });
        }

        // If we had tool calls, the last message is a tool result.
        // Get the model to process it.
        if (chatResponse.toolCalls.length > 0) {
          output = chatResponse.message.content ?? '';
        }
      }

      // Success
      this.updateSubagentStatus(subagentId, 'completed');
      this.emitEvent({
        type: 'subagent_completed',
        subagentId,
        subtaskId: subtask.id,
        timestamp: Date.now(),
        data: { tokensConsumed: totalTokens },
      });

      return {
        subagentId,
        subtaskId: subtask.id,
        status: turnsUsed >= subtask.turnBudget ? 'partial' : 'completed',
        output,
        toolCallsExecuted,
        tokensConsumed: totalTokens,
        executionTimeMs: Date.now() - startedAt,
        modelUsed: this.getModelForTier(subtask.modelTier),
      };

    } catch (error) {
      this.updateSubagentStatus(subagentId, 'failed');
      this.emitEvent({
        type: 'subagent_failed',
        subagentId,
        subtaskId: subtask.id,
        timestamp: Date.now(),
        data: { text: (error as Error).message },
      });

      return {
        subagentId,
        subtaskId: subtask.id,
        status: 'failed',
        output: `Subtask failed: ${(error as Error).message}`,
        toolCallsExecuted: 0,
        tokensConsumed: 0,
        executionTimeMs: Date.now() - startedAt,
        modelUsed: this.getModelForTier(subtask.modelTier),
      };
    }
  }

  /**
   * Execute a tool (local or IPC). Mirrors orchestrator.ts tool execution
   * but without the approval flow (subagents handle permissions via hooks).
   */
  private async executeTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    try {
      // Check for extension tool handler first
      const extensionHandler = this.allToolHandlers.get(toolName);
      if (extensionHandler) {
        const result = await extensionHandler(params);
        return { tool: toolName, result, success: true };
      }

      // Local tools
      if (this.localTools.has(toolName)) {
        // Local tools are handled by the orchestrator's internal methods.
        // For subagents, we route through the knowledge graph for search tools.
        if (toolName === 'search_files' || toolName === 'list_indexed_documents') {
          const results = await this.knowledge.search(
            (params.query as string) ?? '',
            { limit: 10 },
          );
          return { tool: toolName, result: results, success: true };
        }
        // Other local tools fall through to IPC
      }

      // IPC tools
      const actionType = this.toolActionMap[toolName];
      if (actionType) {
        const response = await this.ipc.sendAction(actionType, params);
        return { tool: toolName, result: response, success: true };
      }

      return {
        tool: toolName,
        result: { error: `Unknown tool: ${toolName}` },
        success: false,
      };
    } catch (error) {
      return {
        tool: toolName,
        result: { error: (error as Error).message },
        success: false,
      };
    }
  }

  /**
   * Character budget for a single tool-call result inserted back into the
   * conversation. Scales with hardware tier — small models have smaller
   * effective context windows and need tighter truncation to leave room for
   * system prompt + history + the next generation. Returns chars not tokens
   * because the caller is string-based; ~4 chars/token rule of thumb.
   */
  private getToolResultCharBudget(): number {
    switch (this.hardwareTier) {
      case 'constrained': return 1200;  // ~300 tokens
      case 'standard': return 2400;     // ~600 tokens
      case 'performance': return 4000;  // ~1000 tokens
      case 'workstation': return 6000;  // ~1500 tokens
      case 'enthusiast': return 8000;   // ~2000 tokens
      default: return 2400;
    }
  }

  /**
   * Get the model name for a given tier.
   * Uses the LLM provider's model routing if available.
   */
  private getModelForTier(tier: string): string {
    // The InferenceRouter handles tier-based model selection via routedChat.
    // We return a hint model name — the actual routing happens in the provider.
    switch (tier) {
      case 'fast':
        return 'fast'; // SmolLM2 — InferenceRouter maps this
      case 'primary':
        return ''; // Default model — Qwen3
      case 'vision':
        return 'vision'; // Moondream2
      case 'embedding':
        return 'embedding'; // Nomic
      default:
        return '';
    }
  }

  private emitEvent(event: SubagentStreamEvent): void {
    if (this.onStreamEvent) {
      try {
        this.onStreamEvent(event);
      } catch {
        // Stream callback errors are not fatal
      }
    }
  }

  private updateSubagentStatus(id: string, status: SubagentInstance['status']): void {
    const instance = this.activeSubagents.get(id);
    if (instance) {
      instance.status = status;
      if (status !== 'running') {
        this.activeSubagents.delete(id);
      }
    }
  }

  /** Get count of currently active subagents. */
  getActiveCount(): number {
    return this.activeSubagents.size;
  }

  /** Get all active subagent IDs. */
  getActiveIds(): string[] {
    return Array.from(this.activeSubagents.keys());
  }
}
