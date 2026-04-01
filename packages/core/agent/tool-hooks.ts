// Tool Execution Hooks — PreToolUse and PostToolUse hook pipeline.
//
// Every tool call in the v2 orchestrator passes through hooks before and after execution.
//
// PreToolUse: allow / deny / mutate / redirect
// PostToolUse: pass / filter / inject / abort
//
// Hooks are registered in the ToolHookRegistryImpl and execute synchronously
// in the tool call path. Hook execution location:
//   - Local hooks (autonomy enforcement, behavioral contracts) → orchestrator layer
//   - Gateway hooks (audit logging, content filtering) → Gateway adapter layer (Phase 3)
//
// CRITICAL: This file is in packages/core/. No network imports.

import type {
  ToolHookRegistry,
  PreToolUseHook,
  PostToolUseHook,
  PreToolUseAction,
  PostToolUseAction,
  ToolHookContext,
} from './orchestrator-v2-types.js';

// ─── Hook Registry ────────────────────────────────────────────────────────────

export class ToolHookRegistryImpl implements ToolHookRegistry {
  private preHooks: Map<string, PreToolUseHook> = new Map();
  private postHooks: Map<string, PostToolUseHook> = new Map();

  registerPreHook(hook: PreToolUseHook): void {
    this.preHooks.set(hook.id, hook);
  }

  registerPostHook(hook: PostToolUseHook): void {
    this.postHooks.set(hook.id, hook);
  }

  removePreHook(id: string): void {
    this.preHooks.delete(id);
  }

  removePostHook(id: string): void {
    this.postHooks.delete(id);
  }

  getPreHooks(toolName: string): PreToolUseHook[] {
    return Array.from(this.preHooks.values()).filter(
      h => h.appliesTo.length === 0 || h.appliesTo.includes(toolName),
    );
  }

  getPostHooks(toolName: string): PostToolUseHook[] {
    return Array.from(this.postHooks.values()).filter(
      h => h.appliesTo.length === 0 || h.appliesTo.includes(toolName),
    );
  }

  /** Get all registered pre-hooks. */
  getAllPreHooks(): PreToolUseHook[] {
    return Array.from(this.preHooks.values());
  }

  /** Get all registered post-hooks. */
  getAllPostHooks(): PostToolUseHook[] {
    return Array.from(this.postHooks.values());
  }
}

// ─── Hook Pipeline ────────────────────────────────────────────────────────────

export interface HookPipelineResult {
  /** Whether the tool call should proceed */
  proceed: boolean;
  /** The final tool name (may have been redirected) */
  toolName: string;
  /** The final parameters (may have been mutated) */
  params: Record<string, unknown>;
  /** If denied or aborted, the reason */
  denyReason?: string;
  /** If redirected, the original tool name */
  redirectedFrom?: string;
  /** Hooks that fired and their actions */
  hookActions: Array<{ hookId: string; action: string }>;
}

/**
 * Execute the PreToolUse hook pipeline for a tool call.
 *
 * Hooks execute in registration order. The first deny/redirect stops the pipeline.
 * Mutations accumulate (each hook sees the previous mutation's result).
 */
export async function executePreToolHooks(
  registry: ToolHookRegistry,
  context: ToolHookContext,
  additionalHookIds?: string[],
): Promise<HookPipelineResult> {
  const hooks = registry.getPreHooks(context.toolName);
  const hookActions: Array<{ hookId: string; action: string }> = [];
  let currentToolName = context.toolName;
  let currentParams = { ...context.toolParams };

  for (const hook of hooks) {
    // If additional hook IDs are specified, only run those + universal hooks
    if (additionalHookIds && hook.appliesTo.length > 0 && !additionalHookIds.includes(hook.id)) {
      continue;
    }

    try {
      const result = await hook.execute({
        ...context,
        toolName: currentToolName,
        toolParams: currentParams,
      });

      hookActions.push({ hookId: hook.id, action: result.action });

      switch (result.action) {
        case 'allow':
          // Continue to next hook
          break;

        case 'deny':
          return {
            proceed: false,
            toolName: currentToolName,
            params: currentParams,
            denyReason: result.reason,
            hookActions,
          };

        case 'mutate':
          currentParams = result.params;
          break;

        case 'redirect':
          const originalName = currentToolName;
          currentToolName = result.targetTool;
          if (result.params) {
            currentParams = result.params;
          }
          return {
            proceed: true,
            toolName: currentToolName,
            params: currentParams,
            redirectedFrom: originalName,
            hookActions,
          };
      }
    } catch (error) {
      console.error(`[ToolHooks] PreToolUse hook '${hook.id}' threw:`, (error as Error).message);
      // Hook errors are not fatal — skip the hook and continue
      hookActions.push({ hookId: hook.id, action: 'error' });
    }
  }

  return {
    proceed: true,
    toolName: currentToolName,
    params: currentParams,
    hookActions,
  };
}

/**
 * Execute the PostToolUse hook pipeline for a tool result.
 *
 * Hooks execute in registration order. Filter/inject accumulate.
 * The first abort stops the pipeline.
 */
export async function executePostToolHooks(
  registry: ToolHookRegistry,
  context: ToolHookContext,
  result: unknown,
  additionalHookIds?: string[],
): Promise<{ result: unknown; aborted: boolean; abortReason?: string; injectedContext?: string; hookActions: Array<{ hookId: string; action: string }> }> {
  const hooks = registry.getPostHooks(context.toolName);
  const hookActions: Array<{ hookId: string; action: string }> = [];
  let currentResult = result;
  let injectedContext: string | undefined;

  for (const hook of hooks) {
    if (additionalHookIds && hook.appliesTo.length > 0 && !additionalHookIds.includes(hook.id)) {
      continue;
    }

    try {
      const action = await hook.execute(
        { ...context, toolParams: context.toolParams },
        currentResult,
      );

      hookActions.push({ hookId: hook.id, action: action.action });

      switch (action.action) {
        case 'pass':
          break;

        case 'filter':
          currentResult = action.filteredResult;
          break;

        case 'inject':
          injectedContext = injectedContext
            ? `${injectedContext}\n${action.appendedContext}`
            : action.appendedContext;
          break;

        case 'abort':
          return {
            result: currentResult,
            aborted: true,
            abortReason: action.reason,
            hookActions,
          };
      }
    } catch (error) {
      console.error(`[ToolHooks] PostToolUse hook '${hook.id}' threw:`, (error as Error).message);
      hookActions.push({ hookId: hook.id, action: 'error' });
    }
  }

  return {
    result: currentResult,
    aborted: false,
    injectedContext,
    hookActions,
  };
}

// ─── Built-in Hooks ───────────────────────────────────────────────────────────

/**
 * Create the autonomy enforcement PreToolUse hook.
 * This hook checks the user's Guardian/Partner/Alter Ego setting for each tool call.
 */
export function createAutonomyEnforcementHook(
  autonomyDecide: (toolName: string) => 'auto_approve' | 'requires_approval' | 'blocked',
): PreToolUseHook {
  return {
    id: 'builtin:autonomy-enforcement',
    description: 'Enforces user autonomy tier for tool calls',
    appliesTo: [], // Applies to all tools
    async execute(context: ToolHookContext): Promise<PreToolUseAction> {
      const decision = autonomyDecide(context.toolName);

      switch (decision) {
        case 'auto_approve':
          return { action: 'allow' };
        case 'requires_approval':
          // Don't deny — let the orchestrator handle the approval flow
          return { action: 'allow' };
        case 'blocked':
          return { action: 'deny', reason: `Tool '${context.toolName}' is blocked by autonomy policy` };
      }
    },
  };
}

/**
 * Create the Guardian mode redirect hook.
 * In Guardian mode, send_email is redirected to draft_email.
 */
export function createGuardianRedirectHook(): PreToolUseHook {
  return {
    id: 'builtin:guardian-redirect',
    description: 'Redirects send actions to draft actions in Guardian mode',
    appliesTo: ['send_email', 'send_message_channel'],
    async execute(context: ToolHookContext): Promise<PreToolUseAction> {
      if (context.autonomyTier === 'guardian') {
        const redirectMap: Record<string, string> = {
          send_email: 'draft_email',
          send_message_channel: 'draft_message',
        };
        const target = redirectMap[context.toolName];
        if (target) {
          return { action: 'redirect', targetTool: target, params: context.toolParams };
        }
      }
      return { action: 'allow' };
    },
  };
}
