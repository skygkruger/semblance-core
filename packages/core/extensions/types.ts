// Extension Interface — Plugin contract for Semblance extensions.
// Extensions (e.g. Digital Representative) register tools, insight trackers,
// and gateway adapters without coupling to the core orchestrator.

import type { ToolDefinition } from '../llm/types.js';
import type { ActionType } from '../types/ipc.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';

// Re-declare the ServiceAdapter shape here to avoid core→gateway import (boundary rule).
// This mirrors the contract in packages/gateway/services/types.ts.
export interface ExtensionServiceAdapter {
  execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }>;
}

// --- Tool handler types ---

export interface ToolHandlerResult {
  result?: unknown;
  error?: string;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolHandlerResult> | ToolHandlerResult;

// --- Extension tool ---

export interface ExtensionTool {
  /** LLM tool schema (name, description, parameters) */
  definition: ToolDefinition;
  /** Async handler: receives parsed arguments, returns result or error */
  handler: ToolHandler;
  /** If true, tool is handled in-process (no IPC to Gateway) */
  isLocal: boolean;
  /** Optional Gateway action mapping (for non-local tools) */
  actionType?: ActionType;
}

// --- Extension insight tracker ---

export interface ExtensionInsightTracker {
  /** Generate proactive insights from extension data sources */
  generateInsights(): ProactiveInsight[];
}

// --- Extension gateway adapter ---

export interface GatewayExtensionContext {
  /** Access the shared OAuth token manager */
  getOAuthTokenManager(): unknown;
  /** The config database handle */
  configDb: unknown;
}

export interface ExtensionGatewayAdapter {
  /** The action type this adapter handles */
  actionType: ActionType;
  /** Factory function to create the service adapter */
  createAdapter: (ctx: GatewayExtensionContext) => ExtensionServiceAdapter;
}

// --- Extension init context ---

export interface ExtensionInitContext {
  /** The core database handle for extension-specific tables */
  db: unknown;
}

// --- UI slot types ---

export interface UISlotComponent {
  /** The React component (or component factory) to render in this slot */
  component: unknown;
  /** Priority for ordering when multiple extensions register the same slot */
  priority?: number;
}

// --- Main extension interface ---

export interface SemblanceExtension {
  /** Unique extension identifier (e.g. '@semblance/dr') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semver version string */
  version: string;
  /** Tools to register with the orchestrator */
  tools?: ExtensionTool[];
  /** Insight trackers to register with the proactive engine */
  insightTrackers?: ExtensionInsightTracker[];
  /** Gateway adapters to register with the service registry */
  gatewayAdapters?: ExtensionGatewayAdapter[];
  /** Insight type strings this extension provides (for documentation/filtering) */
  insightTypes?: string[];
  /** UI slot registrations */
  uiSlots?: Record<string, UISlotComponent>;
  /** Optional async initialization */
  initialize?: (ctx: ExtensionInitContext) => Promise<void> | void;
}
