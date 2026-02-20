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
  | 'services';

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
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context?: SearchResult[];   // Knowledge graph context used
  actions?: AgentAction[];    // Actions taken during this turn
}
