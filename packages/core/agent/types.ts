// Agent Types — Orchestration, autonomy, and action management.

import type { ActionType, ActionResponse } from '../types/ipc.js';
import type { SearchResult } from '../knowledge/types.js';

export type AutonomyTier = 'guardian' | 'partner' | 'alter_ego';

export interface AutonomyConfig {
  defaultTier: AutonomyTier;
  domainOverrides: Partial<Record<AutonomyDomain, AutonomyTier>>;
}

export type AutonomyDomain =
  | 'email'
  | 'calendar'
  | 'finances'
  | 'health'
  | 'files'
  | 'contacts'
  | 'services'
  | 'web'
  | 'reminders'
  | 'messaging'
  | 'clipboard'
  | 'location'
  | 'voice'
  | 'cloud-storage'
  | 'connectors'
  | 'network'
  | 'system';

/**
 * Compact reference to a knowledge chunk that informed a decision.
 * Stored in audit trail metadata for full reasoning traceability.
 */
export interface ReasoningChunkRef {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;             // e.g. 'email', 'calendar', 'local_file'
  score: number;              // Similarity score from vector search
}

/**
 * Full reasoning context attached to each orchestrator decision.
 * Captures which knowledge informed the action and the query that
 * retrieved it.
 */
export interface ReasoningContext {
  query: string;              // The user message / search query
  chunks: ReasoningChunkRef[];
  retrievedAt: string;        // ISO timestamp of knowledge retrieval
}

export interface AgentAction {
  id: string;
  action: ActionType;
  payload: Record<string, unknown>;
  reasoning: string;          // Why the agent wants to do this
  domain: AutonomyDomain;
  tier: AutonomyTier;         // What tier applies to this action
  status: 'pending_approval' | 'approved' | 'executed' | 'rejected' | 'failed';
  createdAt: string;
  executedAt?: string;
  response?: ActionResponse;
  reasoningContext?: ReasoningContext;  // Knowledge chunks that informed this decision
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context?: SearchResult[];   // Knowledge graph context used
  actions?: AgentAction[];    // Actions taken during this turn
}
