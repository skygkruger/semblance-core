// Sub-Agent Coordinator — Foundation for specialized sub-orchestrators.
//
// Sub-agents are orchestrator invocations bound to specific named sessions
// with constrained tool access. The main orchestrator delegates tasks to
// sub-agents by routing processMessage() calls through specific session keys.
//
// Full sub-agent coordination (specialized sub-orchestrators with isolated
// histories) is post-launch. This ships the foundation.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SubAgentConfig {
  sessionKey: string;
  systemPromptOverride?: string;
  allowedTools: string[];
  autonomyOverrides?: Record<string, string>;
}

interface ActiveSubAgent {
  id: string;
  config: SubAgentConfig;
  createdAt: string;
}

// ─── Sub-Agent Coordinator ─────────────────────────────────────────────────────

export class SubAgentCoordinator {
  private agents: Map<string, ActiveSubAgent> = new Map();

  /**
   * Create a sub-agent bound to a named session with restricted tools.
   * Returns a unique agent ID.
   */
  async createSubAgent(config: SubAgentConfig): Promise<string> {
    const id = `agent_${nanoid()}`;

    this.agents.set(config.sessionKey, {
      id,
      config,
      createdAt: new Date().toISOString(),
    });

    console.error(`[SubAgentCoordinator] Created sub-agent ${id} for session ${config.sessionKey} with ${config.allowedTools.length} tools`);
    return id;
  }

  /**
   * List active sub-agents.
   */
  listSubAgents(): SubAgentConfig[] {
    return Array.from(this.agents.values()).map(a => a.config);
  }

  /**
   * Get sub-agent config for a session key (if one exists).
   */
  getSubAgent(sessionKey: string): SubAgentConfig | null {
    const agent = this.agents.get(sessionKey);
    return agent?.config ?? null;
  }

  /**
   * Check if a tool is allowed for a sub-agent session.
   */
  isToolAllowed(sessionKey: string, toolName: string): boolean {
    const agent = this.agents.get(sessionKey);
    if (!agent) return true; // No sub-agent = unrestricted
    return agent.config.allowedTools.includes(toolName);
  }

  /**
   * Terminate a sub-agent (session remains, agent is deregistered).
   */
  terminateSubAgent(sessionKey: string): void {
    const agent = this.agents.get(sessionKey);
    if (agent) {
      console.error(`[SubAgentCoordinator] Terminated sub-agent ${agent.id} for session ${sessionKey}`);
      this.agents.delete(sessionKey);
    }
  }

  /**
   * Get count of active sub-agents.
   */
  getActiveCount(): number {
    return this.agents.size;
  }
}
